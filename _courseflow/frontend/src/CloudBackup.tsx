import {useState} from 'react';
import {AWS_BACKUP_ENABLED,uploadCloudBackup,downloadCloudBackup,deleteCloudBackup} from './awsBackup';
import {importWatches} from './freeApi';

export default function CloudBackup(){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  if(!AWS_BACKUP_ENABLED)return null;
  async function run(action:()=>Promise<void>,success:string){
    setBusy(true);setError('');setMessage('');
    try{await action();setMessage(success);}catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  return <section className="cloud-backup transfer-panel" aria-label="Optional AWS cloud backup"><div><strong>Optional cloud backup · AWS</strong><p>Back up course choices and recent searches only when you click Save. This browser holds a private backup key. Clearing site data loses cloud access; use Export watchlist to move saved data to another device. Cloud backups expire 90 days after saving. Restoring merges saved choices and checks seats again.</p>{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}</div><div className="transfer-actions"><button className="secondary" disabled={busy} onClick={()=>void run(uploadCloudBackup,'Saved to AWS. Local data is also retained.')}>Save cloud backup</button><button className="secondary" disabled={busy} onClick={()=>void run(async()=>{await importWatches(await downloadCloudBackup());},'Cloud choices restored after checking the course source.')}>Restore cloud backup</button><button className="text-button danger" disabled={busy} onClick={()=>void run(deleteCloudBackup,'Cloud backup deleted. Local watches and searches were kept.')}>Delete cloud backup</button></div></section>;
}
