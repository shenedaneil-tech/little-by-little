import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {context} from './runtime.mjs';
import {welcome} from './generated/welcome.mjs';
import * as planner from './generated/planner.mjs';
import * as addresses from './generated/addresses.mjs';
import * as journey from './generated/journey.mjs';
import * as travel from './generated/travel.mjs';
const {plannerSource}=createRequire(import.meta.url)('../scripts/planner-source.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const json=(error,status)=>Response.json({error},{status});
const redirect=(url,cookies=[])=>new Response(null,{status:303,headers:[['Location',url],...cookies.map(c=>['Set-Cookie',c])]});
const cookieValue=(req,name)=>req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';

export function createPlannerServer({dbPath=process.env.DB_PATH||'standalone/data/planner.sqlite',origin=process.env.APP_ORIGIN||(process.env.RENDER_EXTERNAL_HOSTNAME?'https://'+process.env.RENDER_EXTERNAL_HOSTNAME:'http://localhost:3000'),clientId=process.env.GITHUB_CLIENT_ID,clientSecret=process.env.GITHUB_CLIENT_SECRET,fetcher=fetch}={}){
 origin=new URL(origin).origin;
 if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))throw Error('APP_ORIGIN must use HTTPS in production');
 if(dbPath!==':memory:')mkdirSync(dirname(resolve(dbPath)),{recursive:true});
 const db=new DatabaseSync(dbPath);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS planners(user_id TEXT PRIMARY KEY NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY,verifier TEXT NOT NULL,expires INTEGER NOT NULL);`);
 const secure=origin.startsWith('https://');
 const sessionName=secure?'__Host-lbl-session':'lbl-session';
 const stateName=secure?'__Host-lbl-oauth':'lbl-oauth';
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
 const cleanup=()=>{db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());db.prepare('DELETE FROM oauth_states WHERE expires < ?').run(Date.now())};
 const assets={
  '/app.js':['text/javascript; charset=utf-8',plannerSource()],
  '/account-storage.js':['text/javascript; charset=utf-8',readFileSync('planner/account-storage.js','utf8')],
  '/route-engine.js':['text/javascript; charset=utf-8',readFileSync('lib/day-plan.mjs','utf8').replace('export function buildDayPlan','function buildDayPlan')+'\nglobalThis.DayPlanner={buildDayPlan};']
 };
 const html=readFileSync('planner/index.html','utf8');
 async function handle(req){
  const url=new URL(req.url),path=url.pathname;
  if(req.method==='GET'&&path==='/healthz'){db.prepare('SELECT 1').get();return Response.json({ok:true})}
  if(req.method==='GET'&&path==='/auth/github'){
   if(!clientId||!clientSecret)return new Response('Sign-in setup is not finished. The owner must configure the GitHub OAuth client in hosting settings.',{status:503});
   cleanup();const state=random(),verifier=random();db.prepare('INSERT INTO oauth_states VALUES (?,?,?)').run(hash(state),verifier,Date.now()+600000);
   const target=new URL('https://github.com/login/oauth/authorize');
   for(const [key,value] of Object.entries({client_id:clientId,redirect_uri:origin+'/auth/callback',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',scope:''}))target.searchParams.set(key,value);
   return redirect(target.href,[cookie(stateName,state,600)]);
  }
  if(req.method==='GET'&&path==='/auth/callback'){
   const state=url.searchParams.get('state'),code=url.searchParams.get('code');
   if(!state||!code||!equal(state,cookieValue(req,stateName)))return json('Sign-in expired. Please try again.',400);
   // Atomically consume the one-use state before exchanging the code.
   const pending=db.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires>=? RETURNING verifier').get(hash(state),Date.now());
   if(!pending)return json('Sign-in expired. Please try again.',400);
   try{
    const tokenResult=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,redirect_uri:origin+'/auth/callback',code_verifier:pending.verifier}),signal:AbortSignal.timeout(10000)});
    const token=await tokenResult.json();if(!tokenResult.ok||!token.access_token)throw Error('exchange');
    const profileResult=await fetcher('https://api.github.com/user',{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token.access_token,'User-Agent':'LittleByLittlePlanner'},signal:AbortSignal.timeout(10000)});
    const profile=await profileResult.json();if(!profileResult.ok||!Number.isSafeInteger(profile.id)||profile.id<=0)throw Error('identity');
    const session=random();db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(session),'github:'+profile.id,Date.now()+30*86400000);
    return redirect('/',[cookie(sessionName,session,30*86400),cookie(stateName,'',0)]);
   }catch{return json('Could not sign in with GitHub. Please try again.',502)}
  }
  const token=cookieValue(req,sessionName);
  const session=token?db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires>=?').get(hash(token),Date.now()):null;
  const user=session?{userId:session.user_id}:null;
  if(path==='/auth/logout'&&req.method==='POST'){
   if(req.headers.get('origin')!==origin)return json('Invalid origin',403);
   db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));return redirect('/',[cookie(sessionName,'',0)]);
  }
  if(path==='/'&&req.method==='GET'){
   const page=user?html.replace('<script src="account-storage.js">','<script>window.PLANNER_USER_KEY='+JSON.stringify(user.userId).replace(/</g,'\\u003c')+';</script><script src="account-storage.js">').replace('</main>','<form action="/auth/logout" method="post" style="text-align:right;padding:12px"><button type="submit">Sign out</button></form></main>'):welcome('/auth/github');
   return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }
  if(assets[path]&&req.method==='GET')return new Response(assets[path][1],{headers:{'Content-Type':assets[path][0]}});
  const handler={'/api/planner':planner,'/api/addresses':addresses,'/api/journey':journey,'/api/travel':travel}[path]?.[req.method];
  if(handler)return context.run({db,user},()=>handler(req));
  return json('Not found',404);
 }
 const server=createServer(async(incoming,outgoing)=>{
  try{
   // Canonical configured origin, never trust client supplied Host or identity headers.
   const url=new URL(incoming.url,origin);if(url.origin!==origin){outgoing.writeHead(400).end();return}
   let size=0;const chunks=[];for await(const chunk of incoming){size+=chunk.length;if(size>1500000){outgoing.writeHead(413).end('Request too large');return}chunks.push(chunk)}
   const req=new Request(url,{method:incoming.method,headers:incoming.headers,...(!['GET','HEAD'].includes(incoming.method)?{body:Buffer.concat(chunks)}:{})});
   const result=await handle(req);
   const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'geolocation=(self)','X-Frame-Options':'DENY'};
   result.headers.forEach((v,k)=>{if(k!=='set-cookie')headers[k]=v});
   const cookies=result.headers.getSetCookie();if(cookies.length)headers['Set-Cookie']=cookies;
   outgoing.writeHead(result.status,headers);outgoing.end(Buffer.from(await result.arrayBuffer()));
  }catch{outgoing.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({error:'Something went wrong. Please try again.'}))}
 });
 server.requestTimeout=20000;server.headersTimeout=10000;
 server.on('close',()=>db.close());
 return server;
}
