import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {validSubscription,validPreferences,notificationPayload} from '../supabase/functions/notifications/helpers.mjs';
const device='11111111-1111-4111-8111-111111111111';
const subscription={endpoint:'https://web.push.apple.com/a',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};
test('push subscriptions accept supported HTTPS providers and reject internal hosts and malformed keys',()=>{
 assert.equal(validSubscription(subscription),true);
 for(const endpoint of ['http://web.push.apple.com/a','https://127.0.0.1/a','https://web.push.apple.com.evil.test/a','https://user@web.push.apple.com/a','https://web.push.apple.com:8443/a'])assert.equal(validSubscription({...subscription,endpoint}),false);
 assert.equal(validSubscription({...subscription,keys:{...subscription.keys,auth:'invalid'}}),false);
 assert.equal(validPreferences({deviceId:device,timezone:'America/New_York',leadMinutes:5}),true);
 assert.equal(validPreferences({deviceId:device,timezone:'bad/zone',leadMinutes:5}),false);
 assert.equal(validPreferences({deviceId:device,timezone:'UTC',leadMinutes:-5}),false);
 assert.equal(notificationPayload({lead_minutes:5,title:'Visit',device_id:device,item_id:'task:a',scheduled_at:'now'}).body,'Visit');
});
function context({installed=false,supported=true,permission='granted'}={}){
 let requests=[],asks=0,subscribed=0,unsubscribed=0,storage=new Map();const node={textContent:''};
 const sub={toJSON:()=>subscription,unsubscribe:async()=>{unsubscribed++;return true;}};
 let activeSub=null;
 const reg={pushManager:{getSubscription:async()=>activeSub,subscribe:async options=>{assert.equal(options.userVisibleOnly,true);subscribed++;activeSub=sub;return sub;}}};
 const navigator={userAgent:'iPhone',platform:'iPhone',maxTouchPoints:1,...(supported?{serviceWorker:{register:async()=>reg,ready:Promise.resolve(reg),getRegistration:async()=>reg}}:{})};
 const window={matchMedia:()=>({matches:installed}),...(supported?{PushManager:function(){},Notification:{},plannerFetch:async(path,options={})=>{requests.push({path,body:options.body?JSON.parse(options.body):null});return Response.json(options.method?{ok:true}:{publicKey:'B'.repeat(87),enabled:false,leadMinutes:5});}}:{})};
 const ctx={window,navigator,Response,Uint8Array,atob,Intl,JSON,Number,crypto:{randomUUID:()=>device},Notification:{permission,requestPermission:async()=>{asks++;return permission;}},plannerStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},$:()=>node,esc:s=>String(s),view:'today',state:{notify:false},save(){},render(){},toast(){}};
 vm.runInNewContext(readFileSync('planner/src/06a-push.js','utf8'),ctx);
 return {ctx,node,requests,counts:()=>({asks,subscribed,unsubscribed})};
}
test('ordinary iPhone tabs show installation steps without asking permission',async()=>{
 const {ctx,node,counts}=context();await ctx.notifications();assert.equal(counts().asks,0);assert.match(node.textContent,/Home Screen/);assert.match(ctx.pushSettings(),/Add to Home Screen/);
});
test('installed app registers device, sends test, saves timing, and unsubscribes on logout',async()=>{
 const {ctx,requests,counts}=context({installed:true});await new Promise(r=>setImmediate(r));await ctx.notifications();
 assert.equal(counts().asks,1);assert.equal(counts().subscribed,1);assert.equal(ctx.state.notify,true);
 const registered=requests.find(r=>r.body?.action==='subscribe');assert.equal(registered.body.deviceId,device);assert.equal(registered.body.leadMinutes,5);
 await ctx.testNotification();assert.equal(requests.at(-1).body.action,'test');
 await ctx.setPushLead('15');assert.equal(requests.at(-1).body.leadMinutes,15);
 await ctx.window.disablePlannerPush();assert.equal(counts().unsubscribed,1);assert.equal(requests.at(-1).body.action,'disable');
});
test('denied permission never registers a push subscription',async()=>{
 const {ctx,node,counts}=context({installed:true,permission:'denied'});await new Promise(r=>setImmediate(r));await ctx.notifications();assert.equal(counts().subscribed,0);assert.match(node.textContent,/blocked/);
});
test('service worker always displays pushes and keeps click navigation inside the app',async()=>{
 const handlers={},seen=[];const self={addEventListener:(e,fn)=>handlers[e]=fn,registration:{scope:'https://example.test/little-by-little/',showNotification:async(title,options)=>seen.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>seen.push(url)}};
 vm.runInNewContext(readFileSync('pages/sw.js','utf8'),{self,URL});let pending;
 handlers.push({data:{json:()=>({title:'Task',body:'Visit',url:'https://evil.test'})},waitUntil:p=>pending=p});await pending;assert.equal(seen[0].title,'Task');
 handlers.notificationclick({notification:{close(){}},waitUntil:p=>pending=p});await pending;assert.equal(seen[1],'https://example.test/little-by-little/');
});
test('notification API verifies users, restricts origins, scopes device writes, and guards the scheduler',async()=>{
 const {stripTypeScriptTypes}=await import('node:module');let writes=[],filters=[],deliveries=0;
 const config={publicKey:'public',privateKey:'private',cronSecret:'scheduler-secret'};
 const builder={select(){return this},eq(k,v){filters.push([k,v]);return this},maybeSingle:async()=>({data:null,error:null}),upsert:async data=>{writes.push(data);return{error:null}},delete(){return this}};
 const admin={rpc:async name=>name==='lbl_push_config'?{data:config}:{data:[],error:null}};
 const createClient=(_url,key,options)=>key==='service'?admin:{auth:{getUser:async token=>token==='alice'?{data:{user:{id:'alice'}},error:null}:{data:{user:null},error:true}},from:()=>builder};
 const Deno={env:{get:k=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'service'})[k]},serve(){}};
 const source=readFileSync('supabase/functions/notifications/index.ts','utf8').replace(/^import .*;\s*$/gm,'').replace('export async function handle','async function handle');
 const handle=new Function('createClient','webpush','Deno','validSubscription','validPreferences','notificationPayload',stripTypeScriptTypes(source)+'\nreturn handle;')(createClient,{},Deno,validSubscription,validPreferences,notificationPayload);
 const request=(options={})=>handle(new Request('https://project.supabase.co/functions/v1/notifications',{method:options.body?'POST':'GET',headers:{origin:'https://shenedaneil-tech.github.io',authorization:'Bearer alice','content-type':'application/json',...options.headers},...(options.body?{body:JSON.stringify(options.body)}:{})}));
 assert.equal((await request({headers:{origin:'https://evil.test'}})).status,403);
 assert.equal((await request({headers:{authorization:'Bearer forged'}})).status,401);
 const response=await request();assert.deepEqual(await response.json(),{publicKey:'public',enabled:false,leadMinutes:5});
 assert.equal((await request({body:{action:'subscribe',deviceId:device,user_id:'bob',subscription,timezone:'America/New_York',leadMinutes:5}})).status,200);assert.equal(writes[0].user_id,'alice');
 assert.equal((await request({body:{action:'disable',deviceId:device}})).status,200);assert.ok(filters.some(([key,value])=>key==='user_id'&&value==='alice'));
 assert.equal((await request({body:{},headers:{'x-cron-secret':'wrong'}})).status,401);
 assert.equal((await request({body:{},headers:{'x-cron-secret':'scheduler-secret'}})).status,200);
});
