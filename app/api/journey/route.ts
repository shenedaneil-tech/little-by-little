import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(!await getChatGPTUser())return Response.json({error:'Sign in to plan your journey.'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{const {points}=await req.json();if(!Array.isArray(points)||points.length<2||points.length>40||points.some(p=>!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180))return Response.json({error:'Choose valid places for up to 39 stops.'},{status:400});
 const url='https://router.project-osrm.org/table/v1/driving/'+points.map(p=>`${p.lon},${p.lat}`).join(';')+'?annotations=duration';
 const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const d=await r.json() as any;
 if(d.code!=='Ok'||d.durations?.length!==points.length||d.durations.some((row:any)=>!Array.isArray(row)||row.length!==points.length))throw Error();
 return Response.json({minutes:d.durations.map((row:any[])=>row.map(n=>n==null?null:Math.max(0,Math.ceil(n/60)))),source:'OSRM',trafficAware:false,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Couldn’t calculate the routes. Your saved plan has not changed. Try again shortly.'},{status:503})}
}
