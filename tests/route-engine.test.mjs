import assert from 'node:assert/strict';
import {buildDayPlan} from '../lib/day-plan.mjs';
const shop=(id,index,extra={})=>({id,title:id,placeName:id,location:id,routeIndex:index,duration:20,priority:2,...extra});
let matrix=[[0,5,25],[5,0,20],[25,20,0]],tasks=[shop('home task',2),shop('store',1)];
let r=buildDayPlan({tasks,matrix,now:540,start:540,end:1000,buffer:10});
assert.deepEqual(r.tasks.map(t=>t.id),['store','home task']);assert.equal(r.tasks[0].travelBefore,5);assert.equal(r.tasks[1].travelBefore,20);assert.equal(r.tasks[1].routeFrom,'store');assert.ok(r.tasks.every(t=>t.travelAfter===0));
// A new current position closer to Home changes the order without a round trip.
r=buildDayPlan({tasks,matrix:[[0,25,3],[25,0,20],[3,20,0]],now:540,start:540,end:1000,buffer:10});assert.equal(r.tasks[0].id,'home task');assert.equal(r.tasks[0].travelBefore,3);
// Opening and closing apply to the activity; departure is before arrival.
r=buildDayPlan({tasks:[shop('opens at ten',1,{opens:600,closes:660})],matrix:[[0,15],[15,0]],start:540,end:1000});assert.equal(r.tasks[0].at,600);assert.equal(r.tasks[0].travelStart,585);
r=buildDayPlan({tasks:[shop('closed',1,{closed:true})],matrix,start:540,end:1000});assert.equal(r.tasks[0].at,null);
r=buildDayPlan({tasks:[shop('too short',1,{opens:600,closes:610})],matrix,start:540,end:1000});assert.equal(r.tasks[0].at,null);
// The onward journey must fit before a fixed appointment, which stays at 10am.
r=buildDayPlan({tasks:[shop('errand',1,{duration:40}),shop('appointment',2,{pinned:true,at:600,duration:30})],matrix:[[0,5,10],[5,0,30],[10,30,0]],start:540,end:1000,buffer:10});assert.equal(r.tasks.find(t=>t.id==='appointment').at,600);assert.equal(r.tasks.find(t=>t.id==='errand').at,670);assert.equal(r.tasks.find(t=>t.id==='errand').routeFrom,'appointment');
// Unknown and unreachable stores are left unscheduled, not assigned a zero drive.
r=buildDayPlan({tasks:[shop('unknown',null),shop('no route',1)],matrix:[[0,null],[null,0]],start:540,end:1000});assert.ok(r.tasks.every(t=>t.at===null));
r=buildDayPlan({tasks:Array.from({length:6},(_,i)=>({id:String(i),title:String(i),duration:20,priority:2})),start:540,end:1000,energy:'low'});assert.equal(r.tasks.filter(t=>t.at!=null).length,3);
// Online commitments preserve the previous stop, rather than inventing a return home.
r=buildDayPlan({tasks:[shop('store',1)],events:[{id:'call',title:'Call',start:540,end:560}],matrix:[[0,5],[5,0]],start:540,end:1000,buffer:10});assert.equal(r.tasks[0].at,575);
console.log('PASS: chain routes, nearby reordering, no forced returns, opening/closing, fixed appointment with onward travel, unknown/unreachable places, energy limits, online commitments');
