// Run every query with the caller's verified JWT. No service-role key is used.
export function createDatabaseAdapter(client,userId){return {prepare(sql){let values=[];const query={
 bind(...args){values=args;return query},
 async first(){const {data,error}=await client.from('planners').select('state,revision').eq('user_id',userId).maybeSingle();if(error)throw error;return data?{state:JSON.stringify(data.state),revision:data.revision}:null},
 async run(){const insert=sql.startsWith('INSERT INTO planners');const state=JSON.parse(values[insert?1:0]);const revision=insert?0:values[3];const {data,error}=await client.rpc('save_planner',{p_state:state,p_revision:revision});if(error)throw error;return {meta:{changes:data===true?1:0}}}
 };return query}}}
