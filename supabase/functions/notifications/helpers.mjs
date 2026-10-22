export function validSubscription(s) {
 try {
  const url=new URL(s?.endpoint);
  const host=url.hostname;
  return url.protocol==='https:' && !url.port && !url.username && !url.password && s.endpoint.length<=4096 && (host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.apple.com')) && /^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh||'') && /^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth||'');
 } catch { return false; }
}
export function validPreferences(body) {
 if(!/^[0-9a-f-]{36}$/i.test(body?.deviceId||'')||![0,5,10,15,30].includes(body.leadMinutes))return false;
 try{new Intl.DateTimeFormat('en-US',{timeZone:body.timezone}).format();return typeof body.timezone==='string'&&body.timezone.length<=100;}catch{return false;}
}
export function notificationPayload(job) {
 return {title:job.lead_minutes?'Coming up in '+job.lead_minutes+' minutes':'Your next little thing',body:String(job.title||'A planned task').slice(0,180),tag:'lbl-'+job.device_id+'-'+job.item_id+'-'+job.scheduled_at,url:'./'};
}
