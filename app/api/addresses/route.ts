import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic = 'force-dynamic';
export async function GET(req:Request){
 if(!await getChatGPTUser())return Response.json({error:'Sign in to search addresses.'},{status:401});
 const params=new URL(req.url).searchParams;const q=params.get('q')?.trim()??'';
 if(q.length<3||q.length>200)return Response.json({results:[]});
 try{
 const url=new URL('https://photon.komoot.io/api/');url.searchParams.set('q',q);url.searchParams.set('limit','5');url.searchParams.set('lang','en');const lat=Number(params.get('lat')??40.85),lon=Number(params.get('lon')??-74.02);if(Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180){url.searchParams.set('lat',String(lat));url.searchParams.set('lon',String(lon));url.searchParams.set('location_bias_scale','0.5')}
 const res=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'LittleByLittlePlanner/1.0'},signal:AbortSignal.timeout(7000)});
 if(!res.ok)throw Error();const data=await res.json() as any;
 const results=(data.features??[]).slice(0,5).map((f:any)=>{const p=f.properties;const street=[p.housenumber,p.street].filter(Boolean).join(' ');return {name:p.name||street,osmType:p.osm_type,osmId:p.osm_id,label:[p.name!==p.street?p.name:null,street,p.city||p.town||p.village,p.state,p.postcode,p.country].filter(Boolean).join(', '),lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]}});
 return Response.json({results},{headers:{'Cache-Control':'private, max-age=120'}});
 }catch{return Response.json({error:'Address search is unavailable. You can still type an address.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
