function createPlannerStorage(storage,userKey){
 const privateKeys=new Set(['lbl-v1','lbl-cloud-pending','lbl-cloud-revision','lbl-recovery-copy']);
 const prefix='lbl-account:'+String(userKey||'guest')+':';
 try{if(!storage.getItem(prefix+'migrated')){if(userKey&&storage.getItem('lbl-migrated-'+userKey)==='1'){for(const key of privateKeys){const legacy=storage.getItem(key);if(legacy!=null&&storage.getItem(prefix+key)==null)storage.setItem(prefix+key,legacy)}}storage.setItem(prefix+'migrated','1')}}catch{}
 const scoped=key=>privateKeys.has(key)?prefix+key:key;
 return {getItem(key){return storage.getItem(scoped(key))},setItem(key,value){storage.setItem(scoped(key),value)},removeItem(key){storage.removeItem(scoped(key))}};
}
