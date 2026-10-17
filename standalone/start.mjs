import {createPlannerServer} from './server.mjs';
const server=createPlannerServer();
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Little by Little is listening'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close());
