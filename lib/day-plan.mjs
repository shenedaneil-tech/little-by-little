// Pure scheduling engine: chain visits from the last stop; fixed times are anchors.
export function buildDayPlan({tasks,events=[],matrix=[[0]],start=540,end=1260,now=0,buffer=10,energy='medium',originLabel='Your current location'}){
 let cursor=Math.max(start,now),index=0,from=originLabel,count=0;const result=[],eventTrips=[],warnings=[];
 const minutes=(a,b)=>b==null?0:a===b?0:matrix[a]?.[b]??null;
 const remaining=tasks.filter(t=>!t.pinned).map(t=>({...t}));
 const anchors=[...events.filter(e=>e.end>cursor).map(e=>({...e,event:true,at:e.start,duration:e.end-e.start})),...tasks.filter(t=>t.pinned).map(t=>({...t}))].sort((a,b)=>a.at-b.at);
 const validPlace=t=>!t.location||t.routeIndex!=null;
 const hours=(t,at)=>t.closed?'Closed on this day':t.opens&&at<t.opens?'Before opening':t.closes&&at+t.duration>t.closes?'Would finish after closing':'';
 const add=(t,at,drive,depart)=>{result.push({...t,at,travelBefore:drive,travelAfter:0,routeFrom:from,travelStart:depart,issue:'',routeVersion:2});cursor=at+t.duration+buffer;if(t.routeIndex!=null){index=t.routeIndex;from=t.placeName||t.title}count++};
 function fill(until,next){
  while(remaining.length&&(energy!=='low'||count<3)){
   const candidates=[];
   for(const t of remaining){if(t.closed||!validPlace(t))continue;let drive=minutes(index,t.routeIndex);if(drive==null)continue;let at=Math.max(cursor+drive,t.opens||0),finish=at+t.duration;if(hours(t,at)||finish>end)continue;
    const dest=t.routeIndex??index,onward=next?minutes(dest,next.routeIndex):0;if(onward==null||finish+(next?buffer:0)+onward>until)continue;
    const wait=Math.max(0,at-drive-cursor),urgent=t.closes&&t.closes-finish<90?20:0;
    const score=drive*2+wait+(Number(t.priority)===1?0:Number(t.priority)===3?35:15)-(t.main?15:0)-urgent;
    candidates.push({t,at,drive,score});
   }
   if(!candidates.length)break;candidates.sort((a,b)=>a.score-b.score||a.at-b.at||String(a.t.id).localeCompare(String(b.t.id)));const c=candidates[0];remaining.splice(remaining.findIndex(t=>t.id===c.t.id),1);add(c.t,c.at,c.drive,c.at-c.drive);
  }
 }
 for(const anchor of anchors){
  if(anchor.at+anchor.duration<=now){if(!anchor.event)result.push({...anchor,issue:'Chosen time has passed; move or complete this task',routeVersion:2,travelBefore:0,travelAfter:0});continue}
  fill(anchor.at,anchor);
  const drive=minutes(index,anchor.routeIndex);let issue=!validPlace(anchor)?'Choose this place from the suggestions':drive==null?'No driving route found':cursor+drive>anchor.at?'Not enough time to reach this fixed commitment':hours(anchor,anchor.at);
  if(anchor.at+anchor.duration>end&&!anchor.event)issue='Fixed task is outside your planning day';
  const depart=anchor.at-(drive||0);
  if(anchor.event){if(issue)warnings.push(`${anchor.title}: ${issue}`);if(drive>0&&!issue)eventTrips.push({id:anchor.id,date:anchor.date,title:'Drive to '+anchor.title,start:depart,end:anchor.at,from});cursor=Math.max(cursor,anchor.at+anchor.duration+buffer);if(anchor.routeIndex!=null){index=anchor.routeIndex;from=anchor.title}}
  else {if(issue)result.push({...anchor,travelBefore:drive||0,travelAfter:0,routeFrom:from,travelStart:depart,issue,routeVersion:2});else add(anchor,anchor.at,drive,depart);cursor=Math.max(cursor,anchor.at+anchor.duration+buffer);if(anchor.routeIndex!=null){index=anchor.routeIndex;from=anchor.placeName||anchor.title}}
 }
 fill(end,null);
 for(const t of remaining){let issue=t.closed?'Closed on this day':!validPlace(t)?'Choose the matching store or address from suggestions':minutes(index,t.routeIndex)==null?'No driving route found':energy==='low'&&count>=3?'Low-energy limit: three tasks':'No slot fits your time, opening hours, and fixed commitments';result.push({...t,at:null,travelBefore:0,travelAfter:0,issue,routeVersion:2})}
 return {tasks:result.sort((a,b)=>(a.at??9999)-(b.at??9999)),eventTrips,warnings};
}
