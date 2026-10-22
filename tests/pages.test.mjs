import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {createDatabaseAdapter} from '../supabase/functions/planner/adapter.mjs';

test('Pages API transport uses verified-session tokens and prevents account switching',async()=>{
 const sandbox={module:{exports:{}},Headers,Response,fetch};vm.runInNewContext(readFileSync('pages/transport.js','utf8'),sandbox);
 const {createPlannerFetch}=sandbox.module.exports;let session={access_token:'test',user:{id:'alice'}},seen;
 const client={auth:{getSession:async()=>({data:{session}})}};
 const api=createPlannerFetch(client,{url:'https://example.supabase.co',key:'public'},async(url,options)=>{seen={url,options};return Response.json({ok:true})},'alice');
 const controller=new AbortController();await api('/api/addresses?q=store',{signal:controller.signal});
 assert.equal(seen.url,'https://example.supabase.co/functions/v1/planner/addresses?q=store');assert.equal(seen.options.headers.get('authorization'),'Bearer test');assert.equal(seen.options.credentials,'omit');assert.equal(seen.options.signal,controller.signal);
 session={access_token:'other',user:{id:'bob'}};assert.equal((await api('/api/planner')).status,401);
 session=null;assert.equal((await api('/api/planner')).status,401);await assert.rejects(()=>api('https://evil.example'));
});

test('Free backend verifies identities, isolates accounts, validates saves, and preserves conflicts',async()=>{
 const rows=new Map();let handler;
 const createClient=(_url,_key,options)=>{
  const token=options.global.headers.Authorization;
  const id=token==='Bearer alice'?'alice':token==='Bearer bob'?'bob':null;
  return {auth:{getUser:async()=>({data:{user:id?{id}:null},error:!id})},from:()=>({select:()=>({eq:(_column,user)=>({maybeSingle:async()=>({data:rows.get(user)||null})})})}),rpc:async(_name,{p_state,p_revision})=>{
   const old=rows.get(id);if((old?.revision||0)!==p_revision)return {data:false};rows.set(id,{state:p_state,revision:p_revision+1});return {data:true};
  }};
 };
 const generated=readFileSync('supabase/functions/planner/index.ts','utf8').replace(/^import .*;\s*$/gm,'').replace('export async function dispatch','async function dispatch');
 const Deno={env:{get:key=>({APP_ORIGIN:'https://shenedaneil-tech.github.io',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public'})[key]},serve:fn=>handler=fn};
 new Function('createClient','createDatabaseAdapter','Deno',stripTypeScriptTypes(generated))(createClient,createDatabaseAdapter,Deno);
 const request=(path,{method='GET',token='alice',origin='https://shenedaneil-tech.github.io',body}={})=>handler(new Request('https://example.supabase.co/functions/v1/planner/'+path,{method,headers:{origin,authorization:'Bearer '+token,'content-type':'application/json','oai-authenticated-user-id':'spoof'},...(body?{body:JSON.stringify(body)}:{})}));
 assert.equal((await request('planner',{origin:'https://evil.example'})).status,403);
 assert.equal((await request('planner',{method:'OPTIONS'})).status,204);
 assert.equal((await request('planner',{token:'forged'})).status,401);
 assert.equal((await request('planner',{token:''})).status,401);
 const state={tasks:[{id:'one',title:'Visit',date:'2026-10-17',duration:30,opens:'10:00',closes:'18:00'}],events:[],dump:'',start:'09:00',end:'21:00',buffer:10};
 assert.equal((await request('planner',{method:'POST',body:{state,revision:0}})).status,200);
 assert.equal((await request('planner',{method:'POST',body:{state,revision:0}})).status,409);
 const result=await request('planner');assert.equal(result.headers.get('access-control-allow-origin'),'https://shenedaneil-tech.github.io');assert.equal(result.headers.get('cache-control'),'private, no-store');assert.deepEqual(await result.json(),{state,revision:1,userKey:'supabase:alice'});
 assert.equal((await (await request('planner',{token:'bob'})).json()).state,null);
 assert.equal((await request('planner',{method:'POST',body:{state:{...state,tasks:[{...state.tasks[0],duration:-1}]},revision:1}})).status,400);
 assert.equal((await request('unknown')).status,404);
});

test('Edge routing accepts gateway-rewritten and full public paths for every endpoint',async()=>{
 const source=readFileSync('supabase/functions/planner/index.ts','utf8').replace(/^import .*;\s*$/gm,'').replace('export async function dispatch','async function dispatch');
 const dispatch=new Function('createClient','createDatabaseAdapter','Deno',stripTypeScriptTypes(source)+'\nreturn dispatch;')(()=>{},createDatabaseAdapter,{serve(){}});
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})};
 for(const prefix of ['/functions/v1/planner','/planner']) {
  for(const [endpoint,method,status,body] of [['planner','GET',200],['addresses','GET',200],['journey','POST',400,{points:[]}],['travel','POST',400,{}]]) {
   const req=new Request('https://example.supabase.co'+prefix+'/'+endpoint,{method,headers:{origin:'https://example.supabase.co','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   assert.equal((await dispatch(req,{id:'alice'},client)).status,status,prefix+'/'+endpoint);
  }
 }
});
