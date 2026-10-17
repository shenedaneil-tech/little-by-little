// Keep API requests explicit: all other browser fetch calls retain normal behavior.
function createPlannerFetch(client,config,nativeFetch=fetch,expectedUserId=null){
 return async function plannerFetch(path,options={}){
  if(!/^\/api\/(planner|addresses|journey|travel)(\?|$)/.test(path))throw Error('Unknown planner endpoint');
  const {data,error}=await client.auth.getSession();
  if(error||!data.session||(expectedUserId&&data.session.user.id!==expectedUserId))return Response.json({error:'Please sign in again.'},{status:401});
  const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+data.session.access_token);headers.set('apikey',config.key);
  return nativeFetch(config.url+'/functions/v1/planner'+path.slice(4),{...options,headers,credentials:'omit'});
 };
}
if(typeof module!=='undefined')module.exports={createPlannerFetch};
