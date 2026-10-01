// Never cache account data or seat API responses. Offline counts must not look current.
const HOME=self.registration.scope;
const asset=name=>new URL(name,HOME).href;
const CACHE_PREFIX=`courseflow-shell:${HOME}:`;
const CACHE=`${CACHE_PREFIX}v3`;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['offline.html','offline.css','icon-192.png'].map(asset)))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||event.request.method!=='GET')return;
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request,{cache:'no-store'}).catch(async()=>{
    const fallback=await caches.match(asset('offline.html'));
    if(!fallback)return Response.error();
    const html=(await fallback.text()).replace('<!-- COURSEFLOW_BASE -->',`<base href="${new URL(HOME).pathname}">`);
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }));
  else if(['offline.css','icon-192.png'].map(asset).includes(url.href))event.respondWith(caches.match(event.request).then(c=>c||fetch(event.request)));
});
self.addEventListener('push',event=>{
  let body={title:'CourseFlow',body:'There is an update to a tracked course.',id:'courseflow'};
  try{body={...body,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(body.title,{body:body.body,icon:asset('icon-192.png'),badge:asset('icon-192.png'),tag:body.id,data:{url:HOME}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    for(const client of windows)if(client.url.startsWith(HOME))return client.focus();
    return clients.openWindow(HOME);
  }));
});
