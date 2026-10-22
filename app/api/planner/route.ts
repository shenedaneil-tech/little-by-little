import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic = 'force-dynamic';
const json = (data: unknown,status=200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){
 const user=await getChatGPTUser(); if(!user)return json({error:'Sign in to save your planner.'},401);
 const db=env.DB;if(!db)return json({error:'Planner database unavailable'},503);
 try {const row=await db.prepare('SELECT state, revision FROM planners WHERE user_id = ?').bind(user.userId).first() as {state:string,revision:number}|null;
 return json({state:row?JSON.parse(row.state):null,revision:row?.revision??0,userKey:user.userId});}catch{return json({error:'Could not load the planner. Your device copy is safe.'},503)}
}
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Sign in to save your planner.'},401);
 const db=env.DB;if(!db)return json({error:'Planner database unavailable'},503);
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid origin'},403);
 if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'JSON required'},415);
 try{
 const raw=await req.text();if(raw.length>1500000)return json({error:'Planner is too large; export a backup.'},413);
 const {state,revision}=JSON.parse(raw);
 if(!Number.isInteger(revision)||revision<0||!state||!Array.isArray(state.tasks)||!Array.isArray(state.events)||state.tasks.length>3000||state.events.length>3000||typeof state.dump!=='string'||!/^\d{2}:\d{2}$/.test(state.start)||!/^\d{2}:\d{2}$/.test(state.end)||!Number.isFinite(state.buffer)||state.buffer<0||state.buffer>120)return json({error:'Invalid planner data'},400);
 if(state.tasks.some((t:any)=>typeof t.id!=='string'||typeof t.title!=='string'||t.title.length>1000||!Number.isFinite(t.duration)||t.duration<5||t.duration>720||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||(t.at!=null&&(!Number.isFinite(t.at)||t.at<0||t.at+t.duration>1440)))||state.events.some((e:any)=>typeof e.id!=='string'||typeof e.title!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(e.start)||!Number.isFinite(e.end)||e.start<0||e.end>1440||e.end<=e.start))return json({error:'Invalid task or commitment'},400);
 const validTime=(v:any)=>v==null||v===''||(typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v));
 if(state.tasks.some((t:any)=>!validTime(t.opens)||!validTime(t.closes)||[t.travelBefore,t.travelAfter].some(n=>n!=null&&(!Number.isFinite(n)||n<0||n>720))))return json({error:'Invalid business hours or journey time'},400);
 const payload=JSON.stringify(state),now=new Date().toISOString();let result;
 if(revision===0)result=await db.prepare('INSERT INTO planners (user_id,state,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(user_id) DO NOTHING').bind(user.userId,payload,now).run();
 else result=await db.prepare('UPDATE planners SET state = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?').bind(payload,now,user.userId,revision).run();
 if(result.meta.changes!==1)return json({error:'Your planner changed in another tab or device. Reload before saving.'},409);
 return json({revision:revision+1});
 }catch{return json({error:'Unable to save right now. Your device copy is safe.'},503)}
}
