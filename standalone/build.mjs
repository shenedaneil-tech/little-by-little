// Compile the existing API handlers without changing their validation or scheduling contracts.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
mkdirSync('standalone/generated',{recursive:true});
for(const name of ['planner','addresses','journey','travel']){
 const source=readFileSync(`app/api/${name}/route.ts`,'utf8')
  .replace("import { env } from 'cloudflare:workers';", "import { env } from '../runtime.mjs';")
  .replace("import { getChatGPTUser } from '../../chatgpt-auth';", "import { getChatGPTUser } from '../runtime.mjs';");
 writeFileSync(`standalone/generated/${name}.mjs`,stripTypeScriptTypes(source));
}
const route=readFileSync('app/route.ts','utf8');
const welcome=route.slice(route.indexOf('function welcome('));
writeFileSync('standalone/generated/welcome.mjs',stripTypeScriptTypes('export '+welcome).replaceAll('Continue with ChatGPT','Continue with GitHub'));
