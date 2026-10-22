import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
 if (!await getChatGPTUser()) return Response.json({error:'Sign in to estimate your journey.'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try {
 const {origin,destination}=await req.json() as {origin:{lat:number,lon:number},destination:{lat:number,lon:number}};
 const valid=(p:any)=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180;
 if(!valid(origin)||!valid(destination))return Response.json({error:'Select a starting address and destination from the suggestions first.'},{status:400});
 const coordinates=`${origin.lon},${origin.lat};${destination.lon},${destination.lat};${origin.lon},${origin.lat}`;
 const r=await fetch('https://router.project-osrm.org/route/v1/driving/'+coordinates+'?overview=false&steps=false',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error();const data=await r.json() as any;
 const legs=data.routes?.[0]?.legs;if(data.code!=='Ok'||legs?.length!==2||legs.some((l:any)=>!Number.isFinite(l.duration)))throw Error();
 return Response.json({outbound:Math.max(1,Math.ceil(legs[0].duration/60)),inbound:Math.max(1,Math.ceil(legs[1].duration/60)),source:'OSRM',trafficAware:false,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
 } catch {return Response.json({error:'Driving estimates are unavailable. Enter travel minutes manually, or check Google Maps and enter its traffic estimate.'},{status:503})}
}
