import {freeApi} from './freeApi';

export type Seat = {id:string;source:string;term:string;crn:string;code:string;title:string;sectionNumber:string;instructor:string;meetingSummary:string;capacity:number;available:number;checkedAt:string;lastAttemptAt:string;errorMessage:string|null};
export type Watch = {id:string;sectionId:string;threshold:number;enabled:boolean;matched:boolean;section:Seat};
export type Notice = {id:string;sectionId:string;body:string;createdAt:string;readAt:string|null;delivery:string;attempts:number};
export type Status = {demo:boolean;source:string;pollSeconds:number;staleSeconds:number;lastPoll:string|null;officialUrl:string;version:string};
export type User = {signedIn:boolean;email?:string};
export type Term = {code:string;description:string};
export type SearchResult = {sections:Seat[];truncated:boolean;fetchedAt:string};
export const FREE_MODE=import.meta.env.VITE_FREE_MODE==='true';
let csrf: {token:string;headerName:string}|undefined;
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
  if(FREE_MODE)return freeApi<T>(path,method,body);
  const headers:Record<string,string>={'Accept':'application/json'};
  if(body!==undefined) headers['Content-Type']='application/json';
  if(!['GET','HEAD'].includes(method)) {
    if(!csrf) csrf=await api('/auth/csrf');
    headers[csrf!.headerName]=csrf!.token;
  }
  if(path==='/auth/logout' && 'serviceWorker' in navigator && 'PushManager' in window) {
    const registration=await navigator.serviceWorker.getRegistration();
    const subscription=await registration?.pushManager.getSubscription();
    if(subscription) {await api('/push/subscriptions','DELETE',{endpoint:subscription.endpoint});await subscription.unsubscribe();}
  }
  const res=await fetch('/api'+path,{method,headers,credentials:'same-origin',cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});
  if(!res.ok) {
    if(res.status===401 || res.status===403) csrf=undefined;
    const error=await res.json().catch(()=>({}));
    throw new Error(error.details?.join(' ')||error.message||`Request failed (${res.status}).`);
  }
  return res.status===204?undefined as T:res.json();
}
export function clearCsrf(){csrf=undefined;}
export function dateTime(iso:string|null) {return iso?new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not yet';}
export function isStale(seat:Seat,seconds=900) {return Boolean(seat.errorMessage)||Date.now()-new Date(seat.checkedAt).getTime()>seconds*1000;}
