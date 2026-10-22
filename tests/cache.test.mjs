import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
test('built pages and dynamically loaded planner scripts use one release version',()=>{
 const output=mkdtempSync(join(tmpdir(),'lbl-cache-'));
 try{
  execFileSync(process.execPath,['scripts/build-pages.mjs'],{env:{...process.env,PAGES_OUTPUT:output}});
  const window={};vm.runInNewContext(readFileSync(join(output,'config.js'),'utf8'),{window});
  assert.match(window.PLANNER_ASSET_VERSION,/^[a-f0-9]{16}$/);
  for(const name of ['index.html','planner.html']){
   const markup=readFileSync(join(output,name),'utf8');
   const scripts=[...markup.matchAll(/src="(?!https?:)([^\"]+\.js)([^\"]*)"/g)];assert.ok(scripts.length>0);
   for(const [,src,query] of scripts){assert.equal(query,'?v='+window.PLANNER_ASSET_VERSION);assert.ok(existsSync(join(output,src)));}
  }
  const auth=readFileSync(join(output,'auth.js'),'utf8');assert.ok(auth.includes("s.src=src+'?v='+encodeURIComponent(window.PLANNER_ASSET_VERSION"));
 }finally{rmSync(output,{recursive:true,force:true});}
});
