(async function(){
 const config=window.PLANNER_CONFIG,msg=document.getElementById('message'),form=document.getElementById('auth-form');
 const tell=text=>msg.textContent=text;
 if(!config?.url||!config?.key){form.querySelector('button').disabled=true;tell('The new website is being connected to its database. Your existing planner is still available at its original address.');return}
 if(!window.supabase){tell('Sign-in could not load. Please check your connection and reload.');return}
 const recoveringAtLoad=location.hash.includes('type=recovery');
 const client=window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const returnTo=new URL('./',location.href).href;
 let mode=recoveringAtLoad?'reset':'signin',loaded=false,busy=false,activeUser=null;
 function setMode(next){mode=next;document.getElementById('auth-title').textContent=next==='signup'?'A little fresh start.':next==='reset'?'Choose a new password.':next==='forgot'?'Let’s get you back in.':'Welcome back.';document.getElementById('submit').textContent=next==='signup'?'Create account ↗':next==='reset'?'Save new password':next==='forgot'?'Send reset link':'Sign in ↗';const password=document.getElementById('password'),email=document.getElementById('email');password.parentElement.querySelector('label[for="password"]').hidden=next==='forgot';password.hidden=next==='forgot';password.required=next!=='forgot';password.minLength=next==='signup'||next==='reset'?8:1;password.autocomplete=next==='signup'||next==='reset'?'new-password':'current-password';email.hidden=next==='reset';email.required=next!=='reset';form.querySelector('label[for="email"]').hidden=next==='reset';document.getElementById('signup').textContent=next==='signin'?'Create account':'Back to sign in';tell('')}
 document.getElementById('signup').onclick=()=>setMode(mode==='signin'?'signup':'signin');
 document.getElementById('forgot').onclick=()=>setMode('forgot');
 async function openPlanner(user){
  if(loaded||mode==='reset')return;loaded=true;activeUser=user.id;tell('Opening your planner…');
  try{
   const result=await fetch('planner.html',{cache:'no-store'});if(!result.ok)throw Error('Your planner could not load. Reload to try again.');
   const markup=await result.text(),doc=new DOMParser().parseFromString(markup,'text/html');
   doc.querySelectorAll('script').forEach(s=>s.remove());
   window.PLANNER_USER_KEY='supabase:'+user.id;window.plannerFetch=createPlannerFetch(client,config,fetch,user.id);
   document.head.querySelectorAll('style').forEach(s=>s.remove());doc.head.querySelectorAll('style').forEach(s=>document.head.appendChild(s));
   document.body.innerHTML=doc.body.innerHTML;
   const account=document.createElement('button');account.textContent='Sign out';account.style.cssText='margin:12px;min-height:44px';
   account.onclick=async()=>{account.disabled=true;const {error}=await client.auth.signOut();if(error){account.disabled=false;account.textContent='Sign out failed · retry';return}location.reload()};document.querySelector('.footer')?.appendChild(account);
   for(const src of ['account-storage.js','route-engine.js','app.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src+'?v='+encodeURIComponent(window.PLANNER_ASSET_VERSION||'latest');s.onload=resolve;s.onerror=reject;document.body.appendChild(s)});
  }catch(e){loaded=false;if(document.getElementById('message'))tell(e.message||'Could not open the planner. Reload to try again.');else alert('Could not load the planner. Please reload.')}
 }
 client.auth.onAuthStateChange((event,session)=>{
  if(loaded&&session&&session.user.id!==activeUser){location.reload();return}
  if(event==='PASSWORD_RECOVERY'){setMode('reset');return}
  if(event==='SIGNED_OUT'&&loaded){location.reload();return}
  if(event==='SIGNED_IN'&&session&&mode!=='reset'&&!busy)setTimeout(()=>openPlanner(session.user),0);
 });
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;const submit=document.getElementById('submit');submit.disabled=true;tell('One moment…');
  const email=document.getElementById('email').value.trim(),password=document.getElementById('password').value;
  try{
   let result;
   if(mode==='signup')result=await client.auth.signUp({email,password,options:{emailRedirectTo:returnTo}});
   else if(mode==='forgot')result=await client.auth.resetPasswordForEmail(email,{redirectTo:returnTo});
   else if(mode==='reset')result=await client.auth.updateUser({password});
   else result=await client.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   if(mode==='forgot')tell('If that account can receive recovery emails, a reset link is on its way.');
   else if(mode==='signup'&&!result.data.session)tell('Check your email to confirm your account, then come back to sign in.');
   else if(mode==='reset'){setMode('signin');await openPlanner(result.data.user)}
   else await openPlanner(result.data.user);
  }catch(e){tell(e.message||'Could not sign in. Please try again.')}finally{busy=false;submit.disabled=false}
 };
 // getSession is used to render the UI; the server verifies the token before every data request.
 const {data,error}=await client.auth.getSession();
 const recovering=recoveringAtLoad;
 if(recovering)setMode('reset');
 if(error)tell('Please sign in again.');else if(data.session&&!recovering&&mode!=='reset')await openPlanner(data.session.user);else tell('');
})();
