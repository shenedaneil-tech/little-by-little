import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlannerServer} from './server.mjs';

test('OAuth sessions, private saves, conflict protection, and restart persistence',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'little-planner-'));
 let port;let verifierSeen=false;let profile=101;let calls=0;
 const options={dbPath:join(directory,'planner.sqlite'),origin:'http://localhost:3000',clientId:'test-client',clientSecret:'test-secret',fetcher:async(url,opts)=>{
  calls++;
  if(url.includes('access_token')){verifierSeen=opts.body.get('code_verifier').length===43;return Response.json({access_token:'test-token'})}
  assert.equal(opts.headers.Authorization,'Bearer test-token');return Response.json({id:profile});
 }};
 let server=createPlannerServer(options);
 const listen=async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port};
 const request=(path,init={})=>fetch(`http://127.0.0.1:${port}${path}`,{redirect:'manual',...init});
 const close=()=>new Promise(r=>server.close(r));
 const login=async()=>{
  const begin=await request('/auth/github');assert.equal(begin.status,303);
  const target=new URL(begin.headers.get('location'));assert.equal(target.searchParams.get('scope'),'');assert.equal(target.searchParams.get('code_challenge_method'),'S256');
  const state=target.searchParams.get('state'),cookie=begin.headers.getSetCookie()[0].split(';')[0];
  const result=await request('/auth/callback?code=test&state='+state,{headers:{cookie}});assert.equal(result.status,303);
  const session=result.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await request('/auth/callback?code=test&state='+state,{headers:{cookie}})).status,400);
  return session;
 };
 try{
  await listen();
  assert.equal((await request('/healthz')).status,200);
  const home=await request('/');assert.match(await home.text(),/Continue with GitHub/);assert.equal(home.headers.get('cache-control'),'private, no-store');
  assert.equal((await request('/api/planner',{headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'spoof@example.com'}})).status,401);
  assert.equal((await request('/auth/callback?state=bad&code=no')).status,400);assert.equal(calls,0);
  const alice=await login();assert.ok(verifierSeen);
  const page=await request('/',{headers:{cookie:alice}});assert.match(await page.text(),/PLANNER_USER_KEY="github:101"/);
  const state={tasks:[{id:'task1',title:'Store',date:'2026-10-17',duration:30,opens:'10:00',closes:'18:00'}],events:[],dump:'remember',start:'09:00',end:'21:00',buffer:10};
  const save=(cookie,revision,origin='http://localhost:3000')=>request('/api/planner',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({state,revision})});
  assert.equal((await save(alice,0,'https://evil.example')).status,403);
  assert.equal((await save(alice,0)).status,200);assert.equal((await save(alice,0)).status,409);
  const loaded=await (await request('/api/planner',{headers:{cookie:alice}})).json();assert.deepEqual(loaded.state,state);assert.equal(loaded.revision,1);
  profile=202;const bob=await login();assert.equal((await (await request('/api/planner',{headers:{cookie:bob}})).json()).state,null);
  await close();server=createPlannerServer(options);await listen();
  assert.deepEqual((await (await request('/api/planner',{headers:{cookie:alice}})).json()).state,state);
  assert.equal((await request('/auth/logout',{method:'POST',headers:{cookie:alice,origin:'https://evil.example'}})).status,403);
  assert.equal((await request('/auth/logout',{method:'POST',headers:{cookie:alice,origin:'http://localhost:3000'}})).status,303);
  assert.equal((await request('/api/planner',{headers:{cookie:alice}})).status,401);
  assert.equal((await request('/api/planner',{headers:{cookie:bob}})).status,200);
  assert.equal((await request('/api/journey',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 }finally{await close();rmSync(directory,{recursive:true,force:true})}
});

test('HTTPS uses secure host cookies',async()=>{
 const server=createPlannerServer({dbPath:':memory:',origin:'https://planner.example',clientId:'id',clientSecret:'secret'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/auth/github`,{redirect:'manual'});assert.match(r.headers.get('set-cookie'),/__Host-lbl-oauth=.*HttpOnly; SameSite=Lax; Max-Age=600; Secure/);assert.equal(new URL(r.headers.get('location')).searchParams.get('redirect_uri'),'https://planner.example/auth/callback')}
 finally{await new Promise(r=>server.close(r))}
});


test('unconfigured login fails closed',async()=>{
 const server=createPlannerServer({dbPath:':memory:',origin:'http://localhost:3000',clientId:'',clientSecret:''});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/auth/github`,{redirect:'manual'});assert.equal(r.status,503);assert.equal(r.headers.get('set-cookie'),null)}
 finally{await new Promise(r=>server.close(r))}
});
