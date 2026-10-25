import {exportWatches,parseBackup} from './freeStore';

const ENDPOINT=import.meta.env.VITE_AWS_BACKUP_URL||'';
const TOKEN_KEY='courseflow.aws-device-token.v1';
export const AWS_BACKUP_ENABLED=Boolean(ENDPOINT);
type CloudBackup={version:number;backup:ReturnType<typeof parseBackup>|null;updatedAt?:string;expiresAt?:number};

function deviceToken(){
  // Keys are never embedded in URLs, exports, logs, or course-lookup requests.
  const saved=localStorage.getItem(TOKEN_KEY);
  if(saved&&/^[0-9a-f]{64}$/.test(saved))return saved;
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(TOKEN_KEY,token);
  return token;
}
async function request(method:string,version?:number,body?:string):Promise<CloudBackup>{
  const url=new URL(ENDPOINT);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'&&/^[a-z0-9]+\.lambda-url\.[a-z0-9-]+\.on\.aws$/.test(url.hostname)||import.meta.env.DEV&&url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new Error('Cloud backup URL is not a valid AWS Lambda function URL.');
  const token=deviceToken();
  const headers:Record<string,string>={Authorization:`Bearer ${token}`};
  if(version!==undefined)headers['If-Match']=String(version);
  if(body!==undefined)headers['Content-Type']='application/json';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(`${url.origin}/backup`,{method,headers,body,credentials:'omit',cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||'Cloud backup is unavailable. Local data is unchanged.');
    if(method==='GET'&&(!Number.isSafeInteger(data.version)||data.version<0||!('backup' in data)))throw new Error('Unexpected cloud backup response.');
    if(method==='GET'&&data.backup!==null)parseBackup(JSON.stringify(data.backup));
    return data;
  }finally{clearTimeout(timer);}
}
export async function uploadCloudBackup(){const current=await request('GET');await request('PUT',current.version,exportWatches());}
export async function downloadCloudBackup(){const current=await request('GET');if(!current.backup)throw new Error('No cloud backup exists for this browser. Your local saved data is unchanged.');return JSON.stringify(current.backup);}
export async function deleteCloudBackup(){const current=await request('GET');await request('DELETE',current.version);}
