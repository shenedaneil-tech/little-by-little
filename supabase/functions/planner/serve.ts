// This function verifies access tokens itself, including new publishable-key projects.
Deno.serve(async (request: Request)=>{
 const allowedOrigin=Deno.env.get('APP_ORIGIN');
 const origin=request.headers.get('origin');
 if(!allowedOrigin||origin!==allowedOrigin)return Response.json({error:'Origin not allowed'},{status:403});
 const cors={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin','Cache-Control':'private, no-store'};
 const finish=(response: Response)=>{const headers=new Headers(response.headers);Object.entries(cors).forEach(([k,v])=>headers.set(k,v));return new Response(response.body,{status:response.status,headers})};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const authorization=request.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return finish(Response.json({error:'Sign in to access your planner.'},{status:401}));
 try{
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(authorization.slice(7));
  if(error||!data.user)return finish(Response.json({error:'Please sign in again.'},{status:401}));
  // Bound request size even when Content-Length is missing. Avoid unbounded parsing.
  let req=request;
  if(!['GET','HEAD'].includes(request.method)){
   const reader=request.body?.getReader();const chunks=[];let length=0;
   if(reader){while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1500000){await reader.cancel();return finish(Response.json({error:'Planner is too large; export a backup.'},{status:413}))}chunks.push(value)}}
   const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
   // The original handlers check same-origin. CORS above authenticates the browser origin;
   // use a canonical internal request origin so those checks keep the same contract.
   const headers=new Headers(request.headers);headers.set('origin',new URL(request.url).origin);req=new Request(request.url,{method:request.method,headers,body});
  }
  return finish(await dispatch(req,data.user,client));
 }catch{return finish(Response.json({error:'Unable to connect right now. Your device copy is safe.'},{status:503}))}
});
