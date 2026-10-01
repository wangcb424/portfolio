import type {SearchResult,Seat,Status} from './api';
import {addWatch,editWatch,failed,finishPoll,lastPoll,localHistory,localNotices,localWatches,markRead,observe,parseImport,recordStorageWarning,removeWatch,validSeat} from './freeStore';

const PUBLIC_URL=import.meta.env.VITE_PUBLIC_API_URL||'';
const catalog=new Map<string,Seat>();
let checking:Promise<{checked:number;failed:number}>|undefined;
const inflight=new Map<string,Promise<SearchResult>>();

async function publicGet<T>(path:string):Promise<T>{
  if(!PUBLIC_URL)throw new Error('The public course lookup service is not configured yet. Your saved watchlist is still on this device.');
  const base=new URL(PUBLIC_URL);
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw new Error('The course lookup service must use HTTPS.');
  if(base.username||base.password||base.search||base.hash)throw new Error('Invalid course lookup service URL.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{
    const response=await fetch(`${PUBLIC_URL.replace(/\/$/,'')}/api${path}`,{credentials:'omit',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.details?.join(' ')||error.message||`Course lookup is unavailable (${response.status}). Try again in a few minutes.`);}
    return await response.json();
  }catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new Error('Course lookup timed out. Try again in a few minutes.');throw error;}
  finally{clearTimeout(timer);}
}
async function search(term:string,query:string):Promise<SearchResult>{
  const code=query.replace(/\s+/g,'').toUpperCase();
  if(!/^\d{6}$/.test(term)||!/^[A-Z]{2,6}\d{4}[A-Z]?$/.test(code))throw new Error('Use a course code such as CS3100 and choose a term.');
  const key=`${term}:${code}`,existing=inflight.get(key);if(existing)return existing;
  const request=(async()=>{
    try{
      const result=await publicGet<SearchResult>(`/catalog/sections?term=${encodeURIComponent(term)}&q=${encodeURIComponent(code)}`);
      if(!Array.isArray(result.sections)||result.sections.length>50||!result.sections.every(seat=>validSeat(seat)&&seat.term===term&&seat.code===code)||typeof result.truncated!=='boolean'||!Number.isFinite(Date.parse(result.fetchedAt)))throw new Error('The course source returned an unexpected response. No saved seat counts were changed.');
      for(const seat of result.sections)catalog.set(seat.id,seat);
      while(catalog.size>300)catalog.delete(catalog.keys().next().value!);
      // A truncated page cannot reliably establish that a watched CRN disappeared.
      try{observe(term,code,result.sections,!result.truncated);}catch(error){recordStorageWarning((error as Error).message);}
      return result;
    }catch(error){try{failed(term,code);}catch{/* Public lookup errors remain readable if site storage is blocked. */}throw error;}
  })();
  inflight.set(key,request);try{return await request;}finally{inflight.delete(key);}
}
export async function freeApi<T>(path:string,method:string,body?:unknown):Promise<T>{
  const url=new URL(path,'https://local.invalid');
  let value:unknown;
  if(method==='GET'&&url.pathname==='/status'){const status=await publicGet<Status>(path);value={...status,demo:false,source:'banner',pollSeconds:300,lastPoll:lastPoll()};}
  else if(method==='GET'&&url.pathname==='/catalog/terms')value=await publicGet(path);
  else if(method==='GET'&&url.pathname==='/catalog/sections')value=await search(url.searchParams.get('term')||'',url.searchParams.get('q')||'');
  else if(method==='GET'&&path==='/auth/me')value={signedIn:true};
  else if(method==='GET'&&path==='/watchlist')value=localWatches();
  else if(method==='POST'&&path==='/watchlist'){
    const input=body as {sectionId:string;threshold:number},seat=catalog.get(input.sectionId);
    if(!seat)throw new Error('Search for this section again before tracking it.');value=addWatch(seat,input.threshold);
  }else if(/^\/watchlist\/[^/]+$/.test(path)&&method==='PATCH'){
    const input=body as {threshold:number;enabled:boolean};editWatch(path.split('/').pop()!,input.threshold,input.enabled);
  }else if(/^\/watchlist\/[^/]+$/.test(path)&&method==='DELETE')removeWatch(path.split('/').pop()!);
  else if(method==='GET'&&path==='/notifications')value=localNotices();
  else if(method==='POST'&&path==='/notifications/read')markRead();
  else if(method==='GET'&&path.startsWith('/history/'))value=localHistory(decodeURIComponent(path.slice(9)));
  else throw new Error('This feature requires the full hosted version. The free version stores watches on this device.');
  return value as T;
}
export function checkLocalWatches():Promise<{checked:number;failed:number}>{
  if(checking)return checking;
  checking=(async()=>{
    const run=async()=>{
      const groups=new Map(localWatches().filter(w=>w.enabled).map(w=>[`${w.section.term}:${w.section.code}`,{term:w.section.term,code:w.section.code}]));
      let checked=0,failures=0;
      for(const group of groups.values()){
        if(!navigator.onLine||document.visibilityState!=='visible')break;
        try{await search(group.term,group.code);checked++;}catch{failures++;}
      }
      if(checked)finishPoll();return {checked,failed:failures};
    };
    // Only one visible tab performs the polling pass where Web Locks are available.
    if(navigator.locks)return navigator.locks.request('courseflow-free-poll',{ifAvailable:true},lock=>lock?run():Promise.resolve({checked:0,failed:0}));
    return run();
  })().finally(()=>{checking=undefined;});return checking;
}
export async function importWatches(text:string){
  const configs=parseImport(text),existing=new Set(localWatches().map(w=>`${w.section.term}:${w.section.crn}`));
  const unique=configs.filter((item,index,all)=>all.findIndex(other=>other.term===item.term&&other.crn===item.crn)===index&&!existing.has(`${item.term}:${item.crn}`));
  if(existing.size+unique.length>20)throw new Error('Import would exceed 20 sections. Remove some watches first.');
  const groups=new Map<string,SearchResult>();
  // Resolve all sections first. Never trust a seat count or source URL from an uploaded file.
  for(const item of unique){const key=`${item.term}:${item.code}`;if(!groups.has(key))groups.set(key,await search(item.term,item.code));}
  const seats=unique.map(item=>{
    const seat=groups.get(`${item.term}:${item.code}`)!.sections.find(s=>s.crn===item.crn);
    if(!seat)throw new Error(`CRN ${item.crn} was not found for ${item.code}. No new watches were imported.`);
    return {item,seat};
  });
  for(const {item,seat} of seats)addWatch(seat,item.threshold,item.enabled);
  return seats.length;
}
