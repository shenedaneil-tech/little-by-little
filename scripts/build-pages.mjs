import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {plannerSource}=createRequire(import.meta.url)('./planner-source.cjs');
const out=process.env.PAGES_OUTPUT||'pages-dist';mkdirSync(out,{recursive:true});
for(const name of ['index.html','auth.js','transport.js'])copyFileSync('pages/'+name,out+'/'+name);
copyFileSync('planner/index.html',out+'/planner.html');copyFileSync('planner/account-storage.js',out+'/account-storage.js');
writeFileSync(out+'/app.js',plannerSource().replaceAll("fetch('/api/","plannerFetch('/api/"));
writeFileSync(out+'/route-engine.js',readFileSync('lib/day-plan.mjs','utf8').replace('export function buildDayPlan','function buildDayPlan')+'\nglobalThis.DayPlanner={buildDayPlan};');
const configured=JSON.parse(readFileSync('pages/config.json','utf8'));
const url=process.env.SUPABASE_URL||configured.url||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||configured.key||'';
if(process.env.REQUIRE_PAGES_CONFIG==='1'&&(!url||!key))throw Error('Connect the Supabase project before publishing');
if(url&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw Error('Expected a Supabase project HTTPS URL');
if(key&&!(key.startsWith('sb_publishable_')||key.startsWith('eyJ')))throw Error('Use only the public anon or publishable key');
if(key.startsWith('eyJ')){const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(payload.role!=='anon')throw Error('Never put a service-role key in a public website')}
writeFileSync(out+'/config.js','window.PLANNER_CONFIG='+JSON.stringify({url,key}).replace(/</g,'\\u003c')+';\n');
writeFileSync(out+'/.nojekyll','');
