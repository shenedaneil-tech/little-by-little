// Device notifications use Web Push, not page timers, so the app may be closed.
let pushRegistration=null,pushPublicKey='',pushEnabled=false,pushBusy=false,pushMessage='',pushLead=5;
const pushInstalled=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const pushIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
function pushDeviceId(){let id=plannerStorage.getItem('lbl-push-device');if(!id){id=crypto.randomUUID();plannerStorage.setItem('lbl-push-device',id);}return id;}
function pushSettings(){
 const needsInstall=pushIOS()&&!pushInstalled();
 return `<div class="card"><h2>Notifications</h2><p class="help">A nudge for scheduled tasks and commitments, even when this app is closed. Reminders use your last saved plan. Delivery can take about a minute and depends on your connection and phone settings.</p>${needsInstall?'<div class="note">On iPhone: open this website in Safari, tap Share → Add to Home Screen, then open the new Little by Little icon to enable notifications.</div>':''}<p class="help" id="push-status" role="status">${esc(pushMessage||(pushEnabled?'On for this device.':'Off for this device.'))}</p><label for="push-lead">Remind me</label><select id="push-lead" onchange="setPushLead(this.value)" ${pushBusy?'disabled':''}>${[0,5,10,15,30].map(n=>`<option value="${n}" ${n===pushLead?'selected':''}>${n?n+' minutes before':'At the scheduled time'}</option>`).join('')}</select><div class="row" style="margin-top:16px"><button class="${pushEnabled?'outline':'primary'}" onclick="${pushEnabled?'disableNotifications()':'notifications()'}" ${pushBusy?'disabled':''}>${pushEnabled?'Turn off on this device':'Enable notifications'}</button>${pushEnabled?'<button class="outline" onclick="testNotification()">Send test notification</button>':''}</div><p class="help">Your browser will ask permission. Tasks need a scheduled time to trigger a reminder.</p></div>`;
}
function pushStatus(message){pushMessage=message;if($('#push-status'))$('#push-status').textContent=message;}
async function pushApi(options={}){
 if(typeof window.plannerFetch!=='function')throw Error('Open the GitHub-hosted app to set up notifications.');
 const res=await window.plannerFetch('/api/notifications'+(options.method?'':'?deviceId='+encodeURIComponent(pushDeviceId())),options);
 const data=await res.json();if(!res.ok)throw Error(data.error||'Could not connect notifications.');return data;
}
async function preparePush(){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return;
 try{
  pushRegistration=await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});
  const config=await pushApi();pushPublicKey=config.publicKey;pushLead=config.leadMinutes;
  const subscription=await pushRegistration.pushManager.getSubscription();
  pushEnabled=!!(subscription&&Notification.permission==='granted'&&config.enabled);
  if(config.enabled&&!subscription)pushStatus('This device needs to reconnect. Tap Enable notifications.');
  if(pushEnabled)await savePushSubscription(subscription);
  if(view==='settings')render();
 }catch(e){pushStatus(e.message||'Notifications could not connect. Try enabling again.');}
}
function publicKeyBytes(key){const text=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(text,c=>c.charCodeAt(0));}
async function savePushSubscription(subscription){return pushApi({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',deviceId:pushDeviceId(),subscription:subscription.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,leadMinutes:pushLead})});}
async function notifications(){
 if(pushIOS()&&!pushInstalled()){pushStatus('Add Little by Little to your Home Screen in Safari, then open that icon and enable notifications.');return toast(pushMessage);}
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){pushStatus('This browser does not support push notifications. Try the Home Screen app on iPhone or a supported browser.');return toast(pushMessage);}
 if(pushBusy)return;
 // Ask directly from the user's tap, before network calls can consume user activation.
 let permission;try{permission=await Notification.requestPermission();}catch{pushStatus('Your device could not open notification permission. Try opening the Home Screen app.');return;}
 if(permission!=='granted'){pushEnabled=false;pushStatus(permission==='denied'?'Notifications are blocked. Allow them in your device notification settings, then try again.':'Notifications were not enabled. You can try again anytime.');return;}
 pushBusy=true;render();
 try{
  if(!pushRegistration)pushRegistration=await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if(!pushPublicKey){const config=await pushApi();pushPublicKey=config.publicKey;}
  let sub=await pushRegistration.pushManager.getSubscription();
  if(!sub)sub=await pushRegistration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKeyBytes(pushPublicKey)});
  await savePushSubscription(sub);pushEnabled=true;state.notify=true;save();pushStatus('On for this device. Send a test below to check delivery.');
 }catch(e){pushStatus(e.message||'Could not enable notifications. Please try again.');toast(pushMessage);}
 finally{pushBusy=false;render();}
}
async function disableNotifications(){
 if(pushBusy)return;pushBusy=true;
 try{
  // Unsubscribe first so logging out cannot leave private reminders on a shared device.
  const reg=pushRegistration||await navigator.serviceWorker?.getRegistration();
  const sub=await reg?.pushManager.getSubscription();if(sub)await sub.unsubscribe();
  pushEnabled=false;state.notify=false;save();
  await pushApi({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'disable',deviceId:pushDeviceId()})});
  pushStatus('Off for this device.');
 }catch(e){pushStatus(e.message||'Could not update notification settings.');}
 finally{pushBusy=false;render();}
}
window.disablePlannerPush=async()=>{
 const reg=pushRegistration||await navigator.serviceWorker?.getRegistration();
 const sub=await reg?.pushManager.getSubscription();
 if(sub&&!await sub.unsubscribe())throw Error('Could not disconnect device notifications.');
 pushEnabled=false;
 try{await pushApi({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'disable',deviceId:pushDeviceId()})});}catch{}
};
async function setPushLead(value){
 pushLead=Number(value);if(!pushEnabled)return;
 try{const sub=await pushRegistration.pushManager.getSubscription();if(!sub)throw Error('Enable notifications again.');await savePushSubscription(sub);pushStatus('Reminder timing updated for this device.');}catch(e){pushStatus(e.message);}
}
async function testNotification(){
 try{await pushApi({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'test',deviceId:pushDeviceId()})});pushStatus('Test sent. Check your notification center.');}catch(e){pushStatus(e.message);}
}
// Register early without asking permission; only the Enable button requests permission.
preparePush();
