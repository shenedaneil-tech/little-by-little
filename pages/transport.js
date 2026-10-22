// Keep API requests explicit: all other browser fetch calls retain normal behavior.
function createPlannerFetch(client,config,nativeFetch=fetch,expectedUserId=null){
 return async function plannerFetch(path,options={}){
  if(!/^\/api\/(planner|addresses|journey|travel|notifications)(\?|$)/.test(path))throw Error('Unknown planner endpoint');
  const {data,error}=await client.auth.getSession();
  if(error||!data.session||(expectedUserId&&data.session.user.id!==expectedUserId))return Response.json({error:'Please sign in again.'},{status:401});
  const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+data.session.access_token);headers.set('apikey',config.key);
  const target=path.startsWith('/api/notifications')?'/functions/v1/notifications'+path.slice('/api/notifications'.length):'/functions/v1/planner'+path.slice(4);
  return nativeFetch(config.url+target,{...options,headers,credentials:'omit'});
 };
}
if(typeof module!=='undefined')module.exports={createPlannerFetch};
