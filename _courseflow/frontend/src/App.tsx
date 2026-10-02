import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,clearCsrf,dateTime,isStale,FREE_MODE,type Seat,type Watch,type Notice,type Status,type User,type Term,type SearchResult} from './api';
import {checkLocalWatches,importWatches} from './freeApi';
import {exportWatches,storageWarning} from './freeStore';
import type {Schedule} from './types';
import Assistant from './Assistant';

type Page='explore'|'watchlist'|'alerts'|'planner'|'assistant';
type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const glyphs:Record<Page,string>={explore:'⌕',watchlist:'☆',alerts:'◉',planner:'▦',assistant:'✦'};
const params=new URLSearchParams(window.location.search);
const initialCourse=/^[A-Z]{2,6}[0-9]{4}[A-Z]?$/.test(params.get('course')||'')?params.get('course')!:'CS3100';

export default function App(){
  const [page,setPage]=useState<Page>('explore');
  const [status,setStatus]=useState<Status>(); const [user,setUser]=useState<User>({signedIn:FREE_MODE});
  const [terms,setTerms]=useState<Term[]>([]);const [term,setTerm]=useState('');const [query,setQuery]=useState(initialCourse);
  const [result,setResult]=useState<SearchResult>();const [watches,setWatches]=useState<Watch[]>([]);const [notices,setNotices]=useState<Notice[]>([]);
  const [loading,setLoading]=useState(false);const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [login,setLogin]=useState(false);const [email,setEmail]=useState('');const [code,setCode]=useState('');const [codeSent,setCodeSent]=useState(false);const [demoCode,setDemoCode]=useState('');
  const [install,setInstall]=useState<InstallEvent>();const [installHelp,setInstallHelp]=useState(false);const [online,setOnline]=useState(navigator.onLine);
  const [history,setHistory]=useState<{seat:Seat;rows:{available:number;capacity:number;checkedAt:string}[]}>();
  const [planCodes,setPlanCodes]=useState('CS3000, CS3100');const [plans,setPlans]=useState<Schedule[]>([]);
  const [earliest,setEarliest]=useState('10:00');const [latest,setLatest]=useState('17:00');const [noFriday,setNoFriday]=useState(true);
  const [pushState,setPushState]=useState('');
  const [checking,setChecking]=useState(false);const [lastCheck,setLastCheck]=useState<string|null>(null);
  const importInput=useRef<HTMLInputElement>(null);
  const [,setClock]=useState(Date.now());
  const dialog=useRef<HTMLDialogElement>(null);const historyDialog=useRef<HTMLDialogElement>(null);const searchSerial=useRef(0);
  const unread=notices.filter(n=>!n.readAt).length;
  const active=watches.filter(w=>w.enabled).length;
  const available=watches.filter(w=>w.enabled&&!isStale(w.section,status?.staleSeconds)&&w.section.available>=w.threshold).length;

  async function refreshPrivate(){
    const [w,n]=await Promise.all([api<Watch[]>('/watchlist'),api<Notice[]>('/notifications')]);setWatches(w);setNotices(n);
  }
  async function search(value=term,text=query){
    const serial=++searchSerial.current;setLoading(true);setError('');setResult(undefined);
    try {const found=await api<SearchResult>(`/catalog/sections?term=${encodeURIComponent(value)}&q=${encodeURIComponent(text)}`);if(serial===searchSerial.current)setResult(found);}
    catch(e){if(serial===searchSerial.current)setError((e as Error).message);}
    finally{if(serial===searchSerial.current)setLoading(false);}
  }
  useEffect(()=>{let mounted=true;
    Promise.all([api<Status>('/status'),api<User>('/auth/me')]).then(([s,u])=>{if(mounted){setStatus(s);setUser(u);}}).catch(e=>setError(e.message));
    api<Term[]>('/catalog/terms').then(t=>{if(mounted){setTerms(t);if(t.length){const chosen=t.find(item=>item.code===params.get('term'))?.code||t[0].code;setTerm(chosen);void search(chosen,initialCourse);}}}).catch(e=>setError(e.message));
    const offer=(e:Event)=>{e.preventDefault();setInstall(e as InstallEvent);};
    const network=()=>setOnline(navigator.onLine);
    window.addEventListener('beforeinstallprompt',offer);window.addEventListener('online',network);window.addEventListener('offline',network);
    return()=>{mounted=false;window.removeEventListener('beforeinstallprompt',offer);window.removeEventListener('online',network);window.removeEventListener('offline',network);};
  },[]);
  useEffect(()=>{if(!user.signedIn)return;let alive=true;
    const refresh=()=>{if(alive&&document.visibilityState==='visible')refreshPrivate().catch(e=>setError(e.message));};
    refresh();const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
    return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[user.signedIn]);
  useEffect(()=>{if(login)dialog.current?.showModal();else dialog.current?.close();},[login]);
  useEffect(()=>{if(!FREE_MODE)return;
    const refresh=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void checkNow(false);};
    const local=()=>{void refreshPrivate().catch(e=>setError(e.message));};
    refresh();const timer=setInterval(refresh,300000);
    document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
    window.addEventListener('storage',local);window.addEventListener('courseflow-local-change',local);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);window.removeEventListener('storage',local);window.removeEventListener('courseflow-local-change',local);};
  },[]);
  useEffect(()=>{if(history)historyDialog.current?.showModal();else historyDialog.current?.close();},[history]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),6000);return()=>clearTimeout(timer);},[message]);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer);},[]);
  async function action(key:string,fn:()=>Promise<void>){setBusy(key);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
  function signIn(){setCodeSent(false);setCode('');setDemoCode('');setLogin(true);}
  async function track(seat:Seat){if(!user.signedIn){signIn();return;}await action(seat.id,async()=>{await api('/watchlist','POST',{sectionId:seat.id,threshold:1});await refreshPrivate();setMessage(`${seat.code} · ${seat.crn} added to your watchlist.`);});}
  async function requestCode(e:FormEvent){e.preventDefault();await action('login',async()=>{const r=await api<{message:string;demoCode?:string}>('/auth/request-code','POST',{email});setCodeSent(true);setDemoCode(r.demoCode||'');setMessage(r.message);});}
  async function verify(e:FormEvent){e.preventDefault();await action('login',async()=>{const u=await api<User>('/auth/verify','POST',{email,code});clearCsrf();setUser(u);setLogin(false);setMessage('Signed in. Your watchlist syncs across devices.');});}
  async function editWatch(w:Watch,threshold=w.threshold,enabled=!w.enabled){await action(w.id,async()=>{await api(`/watchlist/${w.id}`,'PATCH',{threshold,enabled});await refreshPrivate();});}
  async function showHistory(seat:Seat){await action(seat.id,async()=>setHistory({seat,rows:await api(`/history/${encodeURIComponent(seat.id)}`)}));}
  async function installApp(){if(install){await install.prompt();await install.userChoice;setInstall(undefined);}else setInstallHelp(v=>!v);}
  async function checkNow(report=true){setChecking(true);try{const checked=await checkLocalWatches();await refreshPrivate();if(checked.checked)setLastCheck(new Date().toISOString());if(checked.failed)setError(`${checked.failed} course lookup(s) failed. Last known counts are marked as unverified.`);else if(report)setMessage(checked.checked?`Checked ${checked.checked} course(s).`:'No active watches to check, or another tab is already checking.');}catch(e){setError((e as Error).message);}finally{setChecking(false);}}
  function downloadWatchlist(){void action('export',async()=>{const url=URL.createObjectURL(new Blob([exportWatches()],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='CourseFlow_Watchlist.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
  async function uploadWatchlist(file?:File){if(!file)return;await action('import',async()=>{if(file.size>100000)throw new Error('Choose a CourseFlow JSON backup smaller than 100 KB.');const count=await importWatches(await file.text());await refreshPrivate();setMessage(`Imported ${count} section(s) after a fresh course lookup. Existing watches were kept.`);});if(importInput.current)importInput.current.value='';}
  async function enableLocalNotifications(){await action('notification',async()=>{if(!('Notification' in window))throw new Error('This browser does not support device notifications. Keep this page open and check the Alerts tab.');const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Device notifications were not allowed. In-app alerts still work while this page is open.');setPushState('Device notifications enabled');setMessage('Notifications enabled. Keep this page open; sleeping or suspended browsers cannot check seats.');});}
  async function enablePush(){await action('push',async()=>{
    if(!user.signedIn){signIn();return;}
    if(!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('Push is not available in this browser. Email reminders still work.');
    const config=await api<{enabled:boolean;publicKey:string}>('/push/config');
    if(!config.enabled)throw new Error('Push is not configured on this server. Use email and the Alerts tab.');
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notifications were not allowed. You can change this in browser settings.');
    const registration=await navigator.serviceWorker.ready;
    const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
    const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await api('/push/subscriptions','POST',subscription.toJSON());setPushState('Push enabled on this device');setMessage('Push enabled on this device.');
  });}
  function card(seat:Seat,watch?:Watch){
    const latest=watches.find(item=>item.sectionId===seat.id)?.section;
    if(latest&&Date.parse(latest.lastAttemptAt)>=Date.parse(seat.lastAttemptAt))seat=latest;
    const stale=!online||isStale(seat,status?.staleSeconds),open=!stale&&seat.available>0,tracked=watches.some(w=>w.sectionId===seat.id);
    return <article className="seat-card" key={seat.id}>
      <div className="card-top"><div><span className="course-code">{seat.code}</span><span className="section-label">Section {seat.sectionNumber}</span></div><span className={`badge ${stale?'warn':open?'green':'neutral'}`}>{stale?'Needs update':open?'Seats open':'Full'}</span></div>
      <h3>{seat.title}</h3><p className="crn">CRN {seat.crn} <span>· {seat.source==='demo'?'Synthetic data':'Banner public search'}</span></p>
      <div className="seat-count"><strong>{stale?'—':Math.max(0,seat.available)}</strong><span>available <small>of {seat.capacity} seats</small></span></div>
      {stale&&<p className="stale-note">Last known: {seat.available} seats. {seat.errorMessage||'Reconnect or wait for a fresh check.'}</p>}
      <div className="class-details"><p><span>◷</span>{seat.meetingSummary}</p><p><span>♙</span>{seat.instructor}</p></div>
      <p className="checked">Checked {dateTime(seat.checkedAt)}</p>
      {watch?<><div className="watch-options"><label>Alert when ≥ <input aria-label={`Seat threshold for ${seat.crn}`} type="number" min="1" max="100" value={watch.threshold} disabled={!!busy} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=100)void editWatch(watch,n,watch.enabled);}}/> seats</label><span className={watch.enabled?'active-watch':'muted'}>{watch.enabled?'Watching':'Paused'}</span></div>
        <div className="card-actions"><button className="secondary" disabled={!!busy} onClick={()=>void editWatch(watch)}>{watch.enabled?'Pause':'Resume'}</button><button className="text-button" disabled={!!busy} onClick={()=>void showHistory(seat)}>History</button><button className="text-button danger" disabled={!!busy} onClick={()=>void action(watch.id,async()=>{await api(`/watchlist/${watch.id}`,'DELETE');await refreshPrivate();})}>Remove</button></div>
        {status?.demo&&<div className="demo-controls"><span>Test this watch</span><button disabled={!!busy} onClick={()=>void action('demo',async()=>{await api('/demo/seats','POST',{sectionId:seat.id,available:seat.available>0?0:2});await refreshPrivate();setMessage('Demo updated. Open Alerts to inspect the notification.');})}>{seat.available>0?'Set to full':'Open 2 seats'}</button></div>}</>
        :<button className={tracked?'secondary full':'primary full'} disabled={tracked||!!busy||!online} onClick={()=>void track(seat)}>{tracked?'✓ In your watchlist':busy===seat.id?'Adding…':'＋ Track this section'}</button>}
    </article>;
  }

  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href={import.meta.env.BASE_URL} aria-label="CourseFlow home"><span className="brand-mark">C<span>↗</span></span>CourseFlow<span className="brand-dot">.</span></a>
      <p className="sidebar-label">YOUR NEXT SEMESTER</p><nav aria-label="Main navigation">{(FREE_MODE?['explore','watchlist','alerts','assistant']:['explore','watchlist','alerts','planner'] as Page[]).map(value=>{const p=value as Page;return <button key={p} className={page===p?'nav-item selected':'nav-item'} aria-current={page===p?'page':undefined} onClick={()=>{setPage(p);setError('');setHistory(undefined);}}><span className="nav-glyph">{glyphs[p]}</span>{({explore:'Explore courses',watchlist:'My watchlist',alerts:'Alerts',planner:'Schedule lab',assistant:'AI assistant'})[p]}{p==='watchlist'&&watches.length>0&&<span className="nav-count">{watches.length}</span>}{p==='alerts'&&unread>0&&<span className="nav-count">{unread}</span>}</button>;})}</nav>
      <div className="sidebar-bottom"><div className="monitor-note"><span className="live-dot"/> {FREE_MODE?'Free · Saved on this device':status?.demo?'Demo workspace':'Server-side monitoring'}<p>{FREE_MODE?'Checks run while this page is open and active. Export your watchlist to move it to another device.':status?.demo?'Practice the whole flow with synthetic seats.':'Your watches keep running when you close this page.'}</p></div><button className="secondary full" onClick={()=>void installApp()}>＋ Add to your device</button>{installHelp&&<p className="help-text">On iPhone: Share → Add to Home Screen. On desktop or Android: use your browser’s install option. You can always use this website directly.</p>}<p className="version">CourseFlow {status?.version||''} · Independent student project</p></div>
    </aside>
    <main className="main"><header className="topbar"><span>NORTHEASTERN <span className="topbar-divider">/</span> COURSE AVAILABILITY</span><div className="account">{FREE_MODE?<span className="local-account">Free · No account needed</span>:user.signedIn?<><span className="email-label">{user.email}</span><button className="text-button" onClick={()=>void action('logout',async()=>{await api('/auth/logout','POST');clearCsrf();setUser({signedIn:false});setWatches([]);setNotices([]);})}>Sign out</button></>:<button className="secondary" onClick={signIn}>Sign in</button>}</div></header>
      {FREE_MODE&&<div className="banner local-banner"><span>FREE</span><div>Saved on this device · Checks every 5 minutes while this page is open and active.<br/><small>本机保存 · 仅网页打开时检查。Sleeping devices and suspended mobile tabs cannot check or notify; returning to this page triggers a fresh check.</small></div></div>}
      {FREE_MODE&&storageWarning()&&<div className="banner warning storage-warning" role="status">{storageWarning()}</div>}
      {!online&&<div className="banner warning" role="status">You’re offline. Seat counts cannot be verified. {FREE_MODE?'Checks resume when you reconnect and return to this page.':'Server-side watches continue if the server is running.'}</div>}
      {status?.demo&&<div className="banner demo-banner"><span>DEMO</span> These are synthetic seats. Demo sign-in does not verify email ownership and sends no email.</div>}
      {error&&<div className="banner error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>}
      {message&&<div className="toast" role="status">✓ {message}</div>}

      {page==='explore'&&<><section className="hero"><p className="eyebrow">LESS REFRESHING. MORE PLANNING.</p><h1>Your next seat,<br/><span>worth watching.</span></h1><p>{FREE_MODE?'Find a course. Save a section on this device. Keep this page open to check for seats.':'Find your course. Pick a section. We’ll keep an eye on its available seats.'}</p></section>
        <div className="stats"><div><span>ACTIVE WATCHES</span><strong>{active.toString().padStart(2,'0')}</strong></div><div><span>MATCHING YOUR ALERTS</span><strong>{available.toString().padStart(2,'0')}</strong></div><div><span>CHECK INTERVAL</span><strong>{status?Math.round(status.pollSeconds/60):'—'}<small> min + processing</small></strong></div></div>
        <section className="search-panel" aria-label="Course search"><form onSubmit={e=>{e.preventDefault();void search();}}><label>Term<select value={term} onChange={e=>setTerm(e.target.value)} disabled={!terms.length}>{terms.map(t=><option key={t.code} value={t.code}>{t.description}</option>)}</select></label><label className="search-field">Course code<input value={query} maxLength={30} onChange={e=>setQuery(e.target.value)} placeholder="e.g. CS3100" autoComplete="off"/></label><button className="primary search-button" disabled={loading||!term||!online}>{loading?'Searching…':'Find sections ↗'}</button></form><p>Search by course code, then choose the exact CRN. Times shown are the school’s local times.</p></section>
        <div className="section-heading"><h2>{loading?'Looking up sections…':result?`${result.sections.length} sections found`:'Course sections'}</h2><span>{result?`Updated ${dateTime(result.fetchedAt)}`:''}</span></div>
        {result?.truncated&&<p className="banner warning">Only the first 50 results are shown. Refine your course code.</p>}
        {loading?<div className="loading-state" role="status"><span className="spinner"/> Checking the course source…</div>:result&&result.sections.length===0?<div className="empty"><h3>No sections found</h3><p>{FREE_MODE?'Check the term and course code. Some terms have not published their sections yet.':'Check the term and course code. In demo mode, try CS3000, CS3100, or CS3200.'}</p></div>:<div className="cards">{result?.sections.map(s=>card(s))}</div>}
      </>}

      {page==='watchlist'&&<><section className="page-heading"><p className="eyebrow">YOUR SHORTLIST</p><h1>My watchlist<span>.</span></h1><p>Choose your alert threshold. Pause a watch whenever you need.</p></section>{FREE_MODE&&<div className="transfer-panel"><div><strong>Your watchlist stays in this browser</strong><p>Export a backup, then import it on another device. Import checks each section again. Clearing site data removes this device’s saved watches.</p></div><div className="transfer-actions"><button className="secondary" disabled={!!busy} onClick={downloadWatchlist}>Export watchlist</button><button className="secondary" disabled={!!busy} onClick={()=>importInput.current?.click()}>{busy==='import'?'Importing…':'Import watchlist'}</button><input ref={importInput} type="file" accept=".json,application/json" aria-label="Import watchlist file" className="file-input" onChange={e=>void uploadWatchlist(e.target.files?.[0])}/></div></div>}{!user.signedIn?<div className="empty"><h3>Keep your courses together</h3><p>Sign in with email to sync your watchlist across devices. No school password needed.</p><button className="primary" onClick={signIn}>Sign in to start</button></div>:watches.length===0?<div className="empty"><h3>Your next semester starts here</h3><p>Find a course and click “Track this section”. You can track up to 20 sections.</p><button className="primary" onClick={()=>setPage('explore')}>Explore courses</button></div>:<><div className="section-heading"><div><h2>{watches.length} tracked sections</h2>{FREE_MODE&&lastCheck&&<small>Last check {dateTime(lastCheck)}</small>}</div><button className="text-button" disabled={!!busy||checking||!online} onClick={()=>FREE_MODE?void checkNow():void action('refresh',refreshPrivate)}>{FREE_MODE?(checking?'Checking…':'Check seats now ↻'):'Refresh saved status ↻'}</button></div><div className="cards">{watches.map(w=>card(w.section,w))}</div></>}</>}

      {page==='alerts'&&<><section className="page-heading"><p className="eyebrow">WHEN THINGS CHANGE</p><h1>Your alerts<span>.</span></h1><p>We alert when a section reaches your threshold, then wait for it to drop below before alerting again.</p></section><div className="notification-settings"><div><strong>{FREE_MODE?'In-app + optional device notifications':'Email + in-app alerts'}</strong><p>{FREE_MODE?'No email is sent. Notifications depend on browser support and permission, and checks stop when this page closes or the browser suspends it.':user.signedIn?`Email address: ${user.email}`:'Sign in to enable alerts.'}{status?.demo?' Email is simulated in this demo.':''}</p></div><button className="secondary" disabled={!!busy} onClick={()=>FREE_MODE?void enableLocalNotifications():void enablePush()}>{pushState||(FREE_MODE?'Enable notifications':'Enable device push')}</button></div>{!user.signedIn?<div className="empty"><h3>Sign in to see your alerts</h3><button className="primary" onClick={signIn}>Sign in</button></div>:<><div className="section-heading"><h2>{unread} unread</h2><button className="text-button" disabled={!unread||!!busy} onClick={()=>void action('read',async()=>{await api('/notifications/read','POST');await refreshPrivate();})}>Mark all as read</button></div>{notices.length===0?<div className="empty"><h3>All quiet for now</h3><p>Alerts will appear here when a tracked section meets your threshold.</p></div>:<div className="notice-list">{notices.map(n=><article key={n.id} className={`notice ${n.readAt?'':'unread'}`}><span className="notice-icon">↗</span><div><p>{n.body}</p><small>{dateTime(n.createdAt)} · {FREE_MODE?'Saved on this device':`Email: ${n.delivery.toLowerCase()}`}</small></div><a className="text-link" href={status?.officialUrl} target="_blank" rel="noreferrer">Open Banner ↗</a></article>)}</div>}</>}</>}

      {page==='planner'&&<><section className="page-heading"><p className="eyebrow">ALGORITHM SANDBOX</p><h1>Schedule lab<span>.</span></h1><p>The original conflict-checking algorithm is preserved here with the original synthetic courses. It is separate from live seat tracking.</p></section><form className="planner-form" onSubmit={e=>{e.preventDefault();if(!user.signedIn){signIn();return;}void action('plan',async()=>setPlans(await api('/schedules/generate','POST',{courseCodes:planCodes.split(',').map(s=>s.trim()).filter(Boolean),term:'Fall 2026',earliestStart:earliest,latestEnd:latest,avoidFriday:noFriday,maxResults:5})));}}><label>Demo course codes<input value={planCodes} onChange={e=>setPlanCodes(e.target.value)}/></label><div className="time-fields"><label>Prefer starting after<input type="time" value={earliest} onChange={e=>setEarliest(e.target.value)}/></label><label>Prefer finishing before<input type="time" value={latest} onChange={e=>setLatest(e.target.value)}/></label></div><label className="checkbox"><input type="checkbox" checked={noFriday} onChange={e=>setNoFriday(e.target.checked)}/> Prefer no Friday classes</label><button className="primary" disabled={!!busy}>{busy==='plan'?'Generating…':'Generate schedules'}</button></form>{plans.map((p,i)=><article className="plan" key={i}><h3>Option {i+1} <span>Preference score {p.score}/100</span></h3>{p.sections.map(s=><p key={s.id}><strong>{s.courseCode}</strong> · {s.crn}<br/>{s.meetings.map(m=>`${m.day} ${m.start}–${m.end}`).join(' / ')}</p>)}{p.warnings.map(w=><small key={w}>{w}<br/></small>)}</article>)}</>}
      {FREE_MODE&&<div hidden={page!=='assistant'}><Assistant active={page==='assistant'} context={{terms,selectedTerm:term,watches,freeMode:FREE_MODE,staleSeconds:status?.staleSeconds}} renderSeat={seat=>card(seat)}/></div>}
      <footer>Availability is a snapshot, not a registration guarantee. Check prerequisites, reserved seats, and enrollment restrictions in <a href={status?.officialUrl} target="_blank" rel="noreferrer">Banner ↗</a>.</footer>
    </main>
    <dialog ref={dialog} className="login-dialog" onCancel={()=>setLogin(false)} onClick={e=>{if(e.target===dialog.current)setLogin(false);}}><div className="dialog-header"><span className="eyebrow">YOUR COURSES, EVERYWHERE</span><button className="icon-button" aria-label="Close sign in" onClick={()=>setLogin(false)}>×</button></div><h2>{codeSent?'Check your inbox':'Welcome to CourseFlow'}</h2><p>{codeSent?`Enter the 6-digit code for ${email}.`:'Use your email to save your watchlist. Your school account is not connected.'}</p>{error&&<p className="inline-error" role="alert">{error}</p>}{!codeSent?<form onSubmit={e=>void requestCode(e)}><label>Email address<input autoFocus type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required placeholder="you@example.com"/></label><button className="primary full" disabled={!!busy}>{busy?'Sending…':'Send sign-in code'}</button></form>:<form onSubmit={e=>void verify(e)}>{demoCode&&<div className="demo-code">Demo only · No email sent<br/><strong>{demoCode}</strong></div>}<label>Sign-in code<input autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} autoComplete="one-time-code" required/></label><button className="primary full" disabled={!!busy}>{busy?'Verifying…':'Continue'}</button><button type="button" className="text-button full" onClick={()=>setCodeSent(false)}>Use a different email or request a new code</button></form>}<p className="help-text">Codes expire after 10 minutes. No password to remember.</p></dialog>
    <dialog ref={historyDialog} aria-label="Seat history" className="history-panel" onCancel={()=>setHistory(undefined)} onClick={e=>{if(e.target===historyDialog.current)setHistory(undefined);}}>{history&&<><div className="dialog-header"><h2>{history.seat.code} · Seat history</h2><button className="icon-button" aria-label="Close history" onClick={()=>setHistory(undefined)}>×</button></div><p>CRN {history.seat.crn} · Only changed observations are recorded.</p><table><thead><tr><th>Checked</th><th>Available</th><th>Capacity</th></tr></thead><tbody>{history.rows.map((r,i)=><tr key={i}><td>{dateTime(r.checkedAt)}</td><td>{r.available}</td><td>{r.capacity}</td></tr>)}</tbody></table></>}</dialog>
  </div>;
}
