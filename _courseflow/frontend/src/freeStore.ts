import type {Notice,Seat,Watch} from './api';

export type Sample={available:number;capacity:number;checkedAt:string};
type State={version:1;watches:Watch[];notices:Notice[];history:Record<string,Sample[]>;lastPoll:string|null};
export type WatchConfig={term:string;code:string;crn:string;threshold:number;enabled:boolean};
const KEY='courseflow.free.v1';
const STALE_MS=900000;
const empty=():State=>({version:1,watches:[],notices:[],history:{},lastPoll:null});
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const stamp=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
let warning='';
let memoryOnly=false;
let memory=JSON.stringify(empty());
export function storageWarning(){return warning;}
export function recordStorageWarning(message:string){warning=message;window.dispatchEvent(new Event('courseflow-local-change'));}
export function validConfig(value:unknown):value is WatchConfig {
  return object(value)&&typeof value.term==='string'&&/^\d{6}$/.test(value.term)&&typeof value.code==='string'&&/^[A-Z]{2,6}\d{4}[A-Z]?$/.test(value.code)&&typeof value.crn==='string'&&/^\d{1,10}$/.test(value.crn)&&Number.isInteger(value.threshold)&&Number(value.threshold)>=1&&Number(value.threshold)<=100&&typeof value.enabled==='boolean';
}
export function validSeat(value:unknown):value is Seat {
  return object(value)&&value.source==='banner'&&validConfig({...value,threshold:1,enabled:true})&&typeof value.id==='string'&&value.id===`banner:${value.term}:${value.crn}`&&['title','sectionNumber','instructor','meetingSummary'].every(k=>typeof value[k]==='string'&&(value[k] as string).length<=3000)&&Number.isInteger(value.capacity)&&Number(value.capacity)>=0&&Number(value.capacity)<=100000&&Number.isInteger(value.available)&&Math.abs(Number(value.available))<=100000&&stamp(value.checkedAt)&&stamp(value.lastAttemptAt)&&(value.errorMessage===null||typeof value.errorMessage==='string');
}
function validWatch(value:unknown):value is Watch {
  return object(value)&&typeof value.id==='string'&&value.id.length<=100&&validSeat(value.section)&&value.sectionId===value.section.id&&validConfig({...value.section,threshold:value.threshold,enabled:value.enabled})&&typeof value.matched==='boolean';
}
function validNotice(value:unknown):value is Notice {
  return object(value)&&typeof value.id==='string'&&value.id.length<=100&&typeof value.sectionId==='string'&&/^banner:\d{6}:\d{1,10}$/.test(value.sectionId)&&typeof value.body==='string'&&value.body.length<=1000&&stamp(value.createdAt)&&(value.readAt===null||stamp(value.readAt))&&value.delivery==='LOCAL'&&value.attempts===0;
}
function load():State {
  let raw:string|null;
  if(memoryOnly)raw=memory;
  else try{raw=localStorage.getItem(KEY);}catch{memoryOnly=true;warning='Site storage is blocked. Watches are saved only in memory for this tab and will be lost on reload. Export a backup before leaving.';raw=memory;}
  if(!raw)return empty();
  try{
    if(raw.length>2000000)throw new Error();
    const data:unknown=JSON.parse(raw);
    if(!object(data)||data.version!==1||!Array.isArray(data.watches)||!Array.isArray(data.notices)||!object(data.history))throw new Error();
    const watches=data.watches.filter(validWatch).slice(0,20).filter((watch,index,all)=>all.findIndex(item=>item.sectionId===watch.sectionId)===index);
    const history:Record<string,Sample[]>={};
    for(const watch of watches){
      const rows=data.history[watch.sectionId];
      history[watch.sectionId]=Array.isArray(rows)?rows.filter(row=>object(row)&&Number.isInteger(row.available)&&Number.isInteger(row.capacity)&&stamp(row.checkedAt)).slice(-100) as Sample[]:[];
    }
    if(watches.length!==data.watches.length)warning='Some invalid saved entries were ignored. Import a backup if a course is missing.';
    return {version:1,watches,history,notices:data.notices.filter(validNotice).slice(0,100),lastPoll:stamp(data.lastPoll)?data.lastPoll:null};
  }catch{warning='Saved data could not be read. Your next change will start a new watchlist; import a backup if you have one.';return empty();}
}
function save(state:State){
  memory=JSON.stringify(state);
  if(!memoryOnly)try{localStorage.setItem(KEY,memory);}
  catch{memoryOnly=true;warning='Site storage is full or blocked. Watches are saved only in memory for this tab and will be lost on reload. Export a backup before leaving.';}
  window.dispatchEvent(new Event('courseflow-local-change'));
}
function fresh(seat:Seat){const age=Date.now()-Date.parse(seat.checkedAt);return !seat.errorMessage&&age>=-300000&&age<=STALE_MS;}
function match(state:State,watch:Watch,pending:Notice[]){
  // Unknown/stale observations preserve the last known edge, never pretend to be zero.
  if(!fresh(watch.section))return;
  const matches=watch.enabled&&watch.section.available>=watch.threshold;
  if(matches&&!watch.matched){
    const notice:Notice={id:crypto.randomUUID(),sectionId:watch.sectionId,body:`${watch.section.code} · CRN ${watch.section.crn} has ${watch.section.available} available seat(s).`,createdAt:new Date().toISOString(),readAt:null,delivery:'LOCAL',attempts:0};
    state.notices.unshift(notice);state.notices=state.notices.slice(0,100);pending.push(notice);
  }
  watch.matched=matches;
}
function notify(pending:Notice[]){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  for(const notice of pending){
    const options={body:notice.body,tag:notice.id,icon:`${import.meta.env.BASE_URL}icon-192.png`};
    if('serviceWorker' in navigator)void navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL).then(registration=>{
      if(registration)return registration.showNotification('CourseFlow · Seats available',options);
      try{new Notification('CourseFlow · Seats available',options);}catch{/* In-app alert is always retained. */}
    }).catch(()=>{});
    else try{new Notification('CourseFlow · Seats available',options);}catch{/* In-app alert is always retained. */}
  }
}
export function localWatches(){return load().watches;}
export function localNotices(){return load().notices;}
export function localHistory(id:string){return load().history[id]||[];}
export function lastPoll(){return load().lastPoll;}
export function markRead(){const state=load();state.notices.forEach(notice=>notice.readAt||=new Date().toISOString());save(state);}
export function addWatch(seat:Seat,threshold=1,enabled=true){
  if(!validSeat(seat)||!validConfig({...seat,threshold,enabled}))throw new Error('Search for a valid section before adding it.');
  const state=load(),existing=state.watches.find(w=>w.sectionId===seat.id);if(existing)return existing;
  if(state.watches.length>=20)throw new Error('You can track up to 20 sections. Remove one before adding another.');
  const watch:Watch={id:crypto.randomUUID(),sectionId:seat.id,section:seat,threshold,enabled,matched:false};
  state.watches.push(watch);state.history[seat.id]=[{available:seat.available,capacity:seat.capacity,checkedAt:seat.checkedAt}];
  const pending:Notice[]=[];match(state,watch,pending);save(state);notify(pending);return watch;
}
export function editWatch(id:string,threshold:number,enabled:boolean){
  const state=load(),watch=state.watches.find(w=>w.id===id);if(!watch)throw new Error('This watch no longer exists.');
  if(!validConfig({...watch.section,threshold,enabled}))throw new Error('Choose a threshold between 1 and 100.');
  watch.threshold=threshold;watch.enabled=enabled;if(!enabled)watch.matched=false;
  const pending:Notice[]=[];match(state,watch,pending);save(state);notify(pending);
}
export function removeWatch(id:string){const state=load(),watch=state.watches.find(w=>w.id===id);state.watches=state.watches.filter(w=>w.id!==id);if(watch)delete state.history[watch.sectionId];save(state);}
export function observe(term:string,code:string,seats:Seat[],complete=true){
  const state=load(),pending:Notice[]=[];const now=new Date().toISOString();
  const watched=state.watches.filter(w=>w.section.term===term&&w.section.code===code);if(!watched.length)return;
  for(const watch of watched){
    const seat=seats.find(s=>s.id===watch.sectionId);
    if(!seat){if(complete)watch.section={...watch.section,lastAttemptAt:now,errorMessage:'This section was missing from the latest search. Check Banner.'};continue;}
    if(Date.parse(seat.checkedAt)<Date.parse(watch.section.checkedAt))continue;
    const previous=watch.section;watch.section=seat;
    if(previous.available!==seat.available||previous.capacity!==seat.capacity){
      state.history[seat.id]=[...(state.history[seat.id]||[]),{available:seat.available,capacity:seat.capacity,checkedAt:seat.checkedAt}].slice(-100);
    }
    match(state,watch,pending);
  }
  save(state);notify(pending);
}
export function failed(term:string,code:string){
  const state=load(),watched=state.watches.filter(w=>w.section.term===term&&w.section.code===code);if(!watched.length)return;for(const watch of watched)watch.section={...watch.section,lastAttemptAt:new Date().toISOString(),errorMessage:'Latest check failed. The last known count is not current.'};save(state);
}
export function finishPoll(){const state=load();state.lastPoll=new Date().toISOString();save(state);}
export function exportWatches(){
  const watches=load().watches.map(w=>({term:w.section.term,code:w.section.code,crn:w.section.crn,threshold:w.threshold,enabled:w.enabled}));
  return JSON.stringify({format:'courseflow-watchlist',version:1,exportedAt:new Date().toISOString(),watches},null,2);
}
export function parseImport(text:string):WatchConfig[]{
  if(text.length>100000)throw new Error('Choose a CourseFlow JSON backup smaller than 100 KB.');
  let data:unknown;try{data=JSON.parse(text);}catch{throw new Error('This file is not valid JSON.');}
  if(!object(data)||data.format!=='courseflow-watchlist'||data.version!==1||!Array.isArray(data.watches)||data.watches.length>20||!data.watches.every(validConfig))throw new Error('This is not a valid CourseFlow watchlist backup (maximum 20 sections).');
  return data.watches.map(({term,code,crn,threshold,enabled}:WatchConfig)=>({term,code,crn,threshold,enabled}));
}
