import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildDayPlan} from '../lib/day-plan.mjs';
const read=p=>readFileSync(p,'utf8');
test('an ongoing appointment reserves the remaining time without blocking the day',()=>{
 const r=buildDayPlan({tasks:[{id:'task',title:'Task',duration:20}],events:[{id:'call',title:'Call',start:540,end:600}],now:570,start:540,end:1000,buffer:10});
 assert.deepEqual(r.warnings,[]);assert.equal(r.tasks[0].at,610);
});
test('an ongoing pinned task keeps its time and the next task follows it',()=>{
 const r=buildDayPlan({tasks:[{id:'fixed',title:'Fixed',pinned:true,at:540,duration:60},{id:'next',title:'Next',duration:20}],now:570,start:540,end:1000,buffer:10});
 assert.equal(r.tasks[0].at,540);assert.equal(r.tasks[0].issue,'');assert.equal(r.tasks[1].at,610);
});
test('fixed tasks before the planning day are flagged',()=>{
 const r=buildDayPlan({tasks:[{id:'early',title:'Early',pinned:true,at:500,duration:20}],start:540,end:1000});
 assert.match(r.tasks[0].issue,/outside/);
});
function cloudContext(overrides={}){
 const node={textContent:'',style:{},setAttribute(){}};const store=new Map();
 const state={tasks:[],events:[],dump:'',start:'09:00',end:'21:00',buffer:10};
 const ctx={JSON,console,Response,state,defaults:{...state},cloudReady:true,cloudRevision:1,cloudUser:'test',cloudBlocked:false,cloudBusy:false,cloudDirty:false,lastQueued:JSON.stringify(state),cloudTimer:null,
  plannerStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},$:()=>node,toast(){},render(){},setTimeout(){return 1},clearTimeout(){},document:{body:{classList:{add(){},remove(){}}}},nearbyEnabled:false,startNearbyWatch(){},...overrides};
 const src=read('planner/src/07-cloud.js');vm.runInNewContext('let cloudLoading = false;\n'+src.slice(src.indexOf('function cloudStatus'),src.indexOf("$('#saved').style")),ctx);return{ctx,node,store};
}
test('rerendering preserves a save conflict and prevents further writes',()=>{
 const {ctx,node}=cloudContext({cloudBlocked:true});ctx.queueCloud();assert.match(node.textContent,/Changed elsewhere/);assert.equal(ctx.cloudDirty,false);
});
test('rerendering preserves an actionable failed-save status',()=>{
 const {ctx,node}=cloudContext({cloudDirty:true});ctx.queueCloud();assert.match(node.textContent,/retry/);
});
test('loading a newer account revision does not resurrect deleted tasks',async()=>{
 const old={tasks:[{id:'deleted',title:'Removed on other device'}],events:[],dump:'',start:'09:00',end:'21:00',buffer:10};
 const {ctx,store}=cloudContext({state:old,fetch:async()=>Response.json({revision:5,userKey:'test',state:{...old,tasks:[]}})});
 store.set('lbl-cloud-pending','1');store.set('lbl-cloud-revision','2');await ctx.bootCloud();assert.equal(ctx.state.tasks.length,0);assert.equal(JSON.parse(store.get('lbl-recovery-copy')).tasks[0].id,'deleted');
});
test('duplicate cloud reloads share one in-flight request',async()=>{
 let release,calls=0;const {ctx}=cloudContext({fetch:()=>{calls++;return new Promise(r=>release=r)}});
 const first=ctx.bootCloud();await ctx.bootCloud();assert.equal(calls,1);release(Response.json({revision:1,userKey:'test',state:ctx.state}));await first;
});
test('GPS denial can plan from the saved starting address',async()=>{
 const node={open:false};const ctx={Date,JSON,Number,Math,date:'2026-12-01',dayKey:()=> '2026-10-22',livePosition:null,liveEtas:{},state:{startingCoords:{lat:40,lon:-74}},getCurrentPosition:async()=>{throw Error('denied')},mins:()=>0,fetch:async()=>Response.json({minutes:[[0,10],[10,0]]}),Response,$:()=>node};
 const src=read('planner/src/02-planning.js');vm.runInNewContext(src.slice(src.indexOf('async function routingInputs'),src.indexOf('async function plan')),ctx);
 const r=await ctx.routingInputs([{id:'shop',locationCoords:{lat:40.1,lon:-74.1}}],[]);assert.equal(r.matrix[0][1],10);
});
test('backup restore rejects missing IDs, duplicate IDs, impossible dates and unsavable times',()=>{
 const ctx={Number,Date,Set,Math,dayKey:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,mins:t=>Number(t.split(':')[0])*60+Number(t.split(':')[1])};
 const src=read('planner/src/06-reminders-backup.js');vm.runInNewContext(src.slice(src.indexOf('function validBackup')),ctx);
 const backup={tasks:[{id:'one',title:'Task',duration:25,date:'2026-10-22'}],events:[],dump:'',start:'09:00',end:'21:00',buffer:10};
 assert.equal(ctx.validBackup(backup),true);
 for(const patch of [{id:undefined},{duration:0},{at:1430},{date:'2026-02-30'},{locationCoords:{lat:999,lon:0}}])assert.equal(ctx.validBackup({...backup,tasks:[{...backup.tasks[0],...patch}]}),false);
 assert.equal(ctx.validBackup({...backup,tasks:[backup.tasks[0],backup.tasks[0]]}),false);
 assert.equal(ctx.validBackup({...backup,start:'25:00'}),false);
 assert.equal(ctx.validBackup({...backup,buffer:121}),false);
});
test('focus pause and resume retains elapsed time, switching tasks resets it',()=>{
 const ctx={running:null,focusTask:null,elapsed:0,toast(){},render(){}};
 const src=read('planner/src/05-tasks.js');vm.runInNewContext(src.slice(src.indexOf('function startFocus'),src.indexOf('function fromDump')),ctx);
 ctx.startFocus('a');ctx.elapsed=45;ctx.startFocus('a');assert.equal(ctx.running,null);ctx.startFocus('a');assert.equal(ctx.elapsed,45);ctx.startFocus('b');assert.equal(ctx.elapsed,0);
});
test('new overlapping commitments are rejected before mutating the planner',()=>{
 const nodes={'#eventform':{},'#event-address':{}};let message='';const ctx={state:{events:[{id:'one',title:'Existing',date:'2026-10-22',start:600,end:660}],tasks:[]},date:'2026-10-22',open(){},$:key=>nodes[key],setupAddressSearch(){},FormData:class{get(k){return{title:'New',date:'2026-10-22',start:'10:30',end:'11:30',location:''}[k]}},mins:t=>Number(t.split(':')[0])*60+Number(t.split(':')[1]),toast:s=>message=s};
 const src=read('planner/src/05-tasks.js');vm.runInNewContext(src.slice(src.indexOf('function eventForm'),src.indexOf('function deleteEvent')),ctx);ctx.eventForm();nodes['#eventform'].onsubmit({preventDefault(){},target:{}});assert.match(message,/overlaps with Existing/);assert.equal(ctx.state.events.length,1);
});
test('task changes remove cached route blocks and estimates for that day only',()=>{
 const ctx={state:{tasks:[{id:'a',date:'2026-10-22',travelBefore:10,planIssue:'old'},{id:'b',date:'2026-10-23',travelBefore:15}],eventTrips:[{date:'2026-10-22'},{date:'2026-10-23'}]},liveEtas:{a:{minutes:10},b:{minutes:15}},routeGeneration:0};
 const src=read('planner/src/01-core.js');vm.runInNewContext(src.slice(src.indexOf('function invalidateRoute'),src.indexOf('const snapshot')),ctx);ctx.invalidateRoute('2026-10-22');assert.equal(ctx.state.tasks[0].travelBefore,0);assert.equal(ctx.liveEtas.a,undefined);assert.equal(ctx.state.eventTrips.length,1);assert.equal(ctx.state.tasks[1].travelBefore,15);assert.equal(ctx.routeGeneration,1);
});
test('a plan preview cannot apply over changed tasks',async()=>{
 let click,message='';const original={id:'one',title:'Task',duration:25,date:'2026-12-01'};
 const ctx={routeBusy:false,replanQueued:false,running:null,date:'2026-12-01',today:'2026-10-22',routeGeneration:0,state:{tasks:[original],events:[],start:'09:00',end:'21:00',buffer:10,energy:'medium'},livePosition:null,lastRouteAt:0,Date,JSON,Number,DayPlanner:{buildDayPlan:()=>({tasks:[{...original,at:540}],eventTrips:[],warnings:[]})},pending:()=>ctx.state.tasks,routingInputs:async()=>({inputTasks:[original],inputEvents:[],matrix:[[0]],originLabel:'Here'}),mins:()=>540,toast:s=>message=s,open(){},closeModal(){},$:()=>({set onclick(f){click=f}}),esc:s=>s,pretty:s=>s};
 const src=read('planner/src/02-planning.js');vm.runInNewContext(src.slice(src.indexOf('async function plan')),ctx);await ctx.plan();original.title='Changed';click();assert.match(message,/day changed/);assert.equal(original.at,undefined);
});
test('cloud startup begins loading immediately without initialization errors',async()=>{
 const {ctx:base,node}=cloudContext();let calls=0;
 const ctx={...base,window:{addEventListener(){}},document:{querySelectorAll:()=>[],addEventListener(){},body:{classList:{add(){},remove(){}}}},fetch:async()=>{calls++;return Response.json({state:base.state,revision:1,userKey:'test'})}};
 vm.runInNewContext(read('planner/src/07-cloud.js'),ctx);await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.match(node.textContent,/Saved to your account/);
});
