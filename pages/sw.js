// No fetch/cache handler: private planner responses and sign-in pages stay out of caches.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Little by Little',{
  body:data.body||'A little reminder from your planner.',tag:data.tag||'lbl-reminder',icon:'icon-192.png',badge:'icon-192.png',data:{url:'./'},
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=new URL('./',self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const app=clients.find(client=>client.url.startsWith(self.registration.scope));
  if(app){await app.focus();return;}return self.clients.openWindow(url);
 }));
});
