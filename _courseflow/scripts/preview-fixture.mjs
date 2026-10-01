// Browser-only simulator for PREVIEW.html. Never imported into the real app.
// Everything stays in memory and resets on reload; no real monitoring or email.
export function installPreview(){
  const banner=document.createElement('div');
  banner.textContent='交互预览 · 全部为模拟数据 · 不查询学校，不发送邮件，不在后台监控 · 刷新即重置';
  banner.className='preview-notice';document.body.prepend(banner);
  const terms=[{code:'202710',description:'Fall 2026 · Demo'}];
  const titles={CS3000:'Algorithms and Data',CS3100:'Program Design and Implementation',CS3200:'Database Design'};
  const sections=new Map(),histories=new Map();
  let watches=[],notices=[],email='',signedIn=false;
  const now=()=>new Date().toISOString();
  function search(code){
    if(!titles[code])return [];
    return [0,6,0].map((available,i)=>{
      const id=`demo:202710:DEMO-${code.slice(2)}${i+1}`;
      if(!sections.has(id)){
        const stamp=now(),seat={id,source:'demo',term:'202710',crn:`DEMO-${code.slice(2)}${i+1}`,code,title:titles[code],sectionNumber:`0${i+1}`,instructor:'Demo instructor',meetingSummary:'Mon · Wed 14:50–16:30',capacity:100,available,checkedAt:stamp,lastAttemptAt:stamp,errorMessage:null};
        sections.set(id,seat);histories.set(id,[{available,capacity:100,checkedAt:stamp}]);
      }
      return sections.get(id);
    });
  }
  function evaluate(watch){
    const match=watch.enabled&&watch.section.available>=watch.threshold;
    if(match&&!watch.matched)notices.unshift({id:String(Math.random()),sectionId:watch.sectionId,body:`${watch.section.code} · CRN ${watch.section.crn} has ${watch.section.available} available seat(s).`,createdAt:now(),readAt:null,delivery:'SIMULATED',attempts:0});
    watch.matched=match;
  }
  const response=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
  window.fetch=async(input,options={})=>{
    const url=new URL(String(input),'https://preview.invalid'),path=url.pathname.slice(4),method=options.method||'GET';
    if(!url.pathname.startsWith('/api/'))return response({message:'External requests are disabled in this preview.'},503);
    const data=options.body?JSON.parse(options.body):{};
    if(path==='/status')return response({demo:true,source:'demo',pollSeconds:300,staleSeconds:900,lastPoll:null,officialUrl:'https://nubanner.neu.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search',version:'0.2.0 · UI preview'});
    if(path==='/auth/csrf')return response({headerName:'X-CSRF-TOKEN',token:'preview-only'});
    if(path==='/auth/me')return response({signedIn,email});
    if(path==='/auth/request-code'){email=String(data.email);return response({message:'仅用于界面演示，不发送邮件。',demoCode:'123456'});}
    if(path==='/auth/verify'){
      if(data.code!=='123456')return response({message:'The preview code is 123456.'},400);
      signedIn=true;return response({signedIn,email});
    }
    if(path==='/auth/logout'){signedIn=false;return response({});}
    if(path==='/catalog/terms')return response(terms);
    if(path==='/catalog/sections')return response({sections:search((url.searchParams.get('q')||'').replace(/\s/g,'').toUpperCase()),truncated:false,fetchedAt:now()});
    if(!signedIn)return response({message:'Sign in to use the preview watchlist.'},401);
    if(path==='/watchlist'&&method==='GET')return response(watches);
    if(path==='/watchlist'&&method==='POST'){
      let watch=watches.find(w=>w.sectionId===data.sectionId);
      if(!watch){watch={id:String(Math.random()),sectionId:data.sectionId,section:sections.get(data.sectionId),threshold:data.threshold,enabled:true,matched:false};watches.unshift(watch);evaluate(watch);}
      return response(watch);
    }
    if(path.startsWith('/watchlist/')){
      const id=path.split('/').pop(),watch=watches.find(w=>w.id===id);
      if(!watch)return response({message:'Watch not found.'},404);
      if(method==='DELETE')watches=watches.filter(w=>w.id!==id);
      else if(method==='PATCH'){Object.assign(watch,{threshold:data.threshold,enabled:data.enabled});evaluate(watch);}
      return response({});
    }
    if(path==='/notifications')return response(notices);
    if(path==='/notifications/read'){notices.forEach(n=>n.readAt=now());return response({});}
    if(path.startsWith('/history/'))return response(histories.get(decodeURIComponent(path.slice(9)))||[]);
    if(path==='/demo/seats'){
      const seat=sections.get(data.sectionId),stamp=now();
      Object.assign(seat,{available:data.available,checkedAt:stamp,lastAttemptAt:stamp});
      histories.get(seat.id).unshift({available:seat.available,capacity:100,checkedAt:stamp});
      watches.filter(w=>w.sectionId===seat.id).forEach(evaluate);return response({});
    }
    if(path==='/push/config')return response({enabled:false,publicKey:''});
    return response({message:'This feature needs the running Java backend. PREVIEW.html only demonstrates the interface.'},503);
  };
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a');
    if(link?.getAttribute('href')==='/'){event.preventDefault();location.reload();}
  });
}
