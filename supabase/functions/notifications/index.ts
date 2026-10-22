import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';
import {validSubscription,validPreferences,notificationPayload} from './helpers.mjs';
const origin='https://shenedaneil-tech.github.io';
const base=Deno.env.get('SUPABASE_URL')!;
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')||JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;
const admin=createClient(base,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
async function credentials(){const {data,error}=await admin.rpc('lbl_push_config');if(error||!data)throw Error('Notification configuration unavailable');return data;}
async function send(subscription:any,payload:any,config:any){
 if(!validSubscription(subscription))throw Error('Invalid push subscription');
 const details=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:300,urgency:'normal',vapidDetails:{subject:origin+'/little-by-little/',publicKey:config.publicKey,privateKey:config.privateKey}});
 const response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:new Uint8Array(details.body),redirect:'error',signal:AbortSignal.timeout(12000)});
 return response.status;
}
export async function handle(req:Request){
 const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const json=(data:any,status=200)=>Response.json(data,{status,headers:cors});
 try {
  if(req.headers.has('x-cron-secret')){
   if(req.method!=='POST')return json({error:'Method not allowed'},405);
   const config=await credentials();
   if(req.headers.get('x-cron-secret')!==config.cronSecret)return json({error:'Unauthorized'},401);
   const {data:jobs,error}=await admin.rpc('lbl_claim_push_reminders');if(error)throw error;
   let sent=0,failed=0;
   // Bounded claims and parallelism keep delivery inside the function time limit.
   for(let i=0;i<(jobs||[]).length;i+=5)await Promise.all(jobs.slice(i,i+5).map(async(job:any)=>{
    try{
     const status=await send(job.subscription,notificationPayload(job),config);
     if(status===404||status===410){await admin.from('push_subscriptions').delete().eq('id',job.device_id);return;}
     if(status<200||status>=300)throw Error('Push provider rejected delivery');
     const {error}=await admin.from('push_deliveries').update({sent_at:new Date().toISOString()}).eq('id',job.delivery_id);if(error)throw error;sent++;
    }catch{failed++;}
   }));
   return json({sent,failed});
  }
  if(req.headers.get('origin')!==origin)return json({error:'Origin not allowed'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(!['GET','POST'].includes(req.method))return json({error:'Method not allowed'},405);
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return json({error:'Please sign in.'},401);
  const client=createClient(base,publicKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:authError}=await client.auth.getUser(authorization.slice(7));
  if(authError||!identity.user)return json({error:'Please sign in again.'},401);
  const userId=identity.user.id;
  if(req.method==='GET'){
   const config=await credentials();const deviceId=new URL(req.url).searchParams.get('deviceId');
   const {data,error}=deviceId?await client.from('push_subscriptions').select('enabled,lead_minutes').eq('id',deviceId).eq('user_id',userId).maybeSingle():{data:null,error:null};
   if(error)throw error;return json({publicKey:config.publicKey,enabled:!!data?.enabled,leadMinutes:data?.lead_minutes??5});
  }
  // Bound reads even when a sender omits Content-Length.
  const reader=req.body?.getReader();let length=0;const chunks:Uint8Array[]=[];
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>12000){await reader.cancel();return json({error:'Request too large'},413);}chunks.push(value);}
  let raw='';const decoder=new TextDecoder();for(const chunk of chunks)raw+=decoder.decode(chunk,{stream:true});raw+=decoder.decode();
  let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
  if(!/^[0-9a-f-]{36}$/i.test(body.deviceId||''))return json({error:'Invalid device'},400);
  if(body.action==='disable'){
   const {error}=await client.from('push_subscriptions').delete().eq('id',body.deviceId).eq('user_id',userId);if(error)throw error;return json({ok:true});
  }
  if(body.action==='test'){
   const {data:device,error}=await client.from('push_subscriptions').select('*').eq('id',body.deviceId).eq('user_id',userId).maybeSingle();
   if(error)throw error;if(!device?.enabled)return json({error:'Enable notifications on this device first.'},400);
   if(device.last_test_at&&Date.now()-Date.parse(device.last_test_at)<10000)return json({error:'Wait a few seconds before another test.'},429);
   await client.from('push_subscriptions').update({last_test_at:new Date().toISOString()}).eq('id',body.deviceId).eq('user_id',userId);
   const config=await credentials();const status=await send(device.subscription,{title:'Little by Little',body:'Your notifications are ready. A little nudge, right when you need it.',tag:'lbl-test',url:'./'},config);
   if(status===404||status===410){await client.from('push_subscriptions').delete().eq('id',body.deviceId);return json({error:'This subscription expired. Enable notifications again.'},410);}
   if(status<200||status>=300)throw Error('Test could not be delivered');return json({ok:true});
  }
  if(body.action!=='subscribe'||!validSubscription(body.subscription)||!validPreferences(body))return json({error:'Invalid notification settings'},400);
  const {error}=await client.from('push_subscriptions').upsert({id:body.deviceId,user_id:userId,subscription:body.subscription,timezone:body.timezone,lead_minutes:body.leadMinutes,enabled:true,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(error)throw error;return json({ok:true});
 }catch{return json({error:'Notifications could not connect. Please try again.'},503);}
}
Deno.serve(handle);
