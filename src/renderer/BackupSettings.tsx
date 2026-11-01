import {useEffect,useRef,useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {call} from './rpc.ts';

export function BackupSettings(){
  const input=useRef<HTMLInputElement>(null);
  const [restored]=useState(()=>sessionStorage.getItem('werk:backup-restored')==='1');
  useEffect(()=>{sessionStorage.removeItem('werk:backup-restored');},[]);
  const [message,setMessage]=useState(restored?'Backup restored.':'');
  const exporting=useMutation({mutationFn:async()=>{
    setMessage('');const file=await call('backup.export',undefined);
    if(await window.werk.saveFile(file))setMessage('Backup exported.');
  }});
  const restoring=useMutation({mutationFn:async(file:File)=>{
    setMessage('');if(file.size>128*1024*1024)throw new Error('Choose a ZIP backup no larger than 128 MiB.');
    await call('backup.restore',{bytes:new Uint8Array(await file.arrayBuffer())});
    for(const key of Object.keys(localStorage))if(key.startsWith('assistant-draft:'))localStorage.removeItem(key);
    sessionStorage.setItem('werk:backup-restored','1');location.reload();
  }});
  const busy=exporting.isPending||restoring.isPending;
  return <><p>Back up your current profile, jobs, latest letters and master CV. Sign-in, settings, sources and conversation history are excluded.</p>
    <p>Restoring replaces your personal records, document history, conversation and pending tasks. It keeps this installation’s sign-in and settings. Export first if you want to keep the current records.</p>
    <div className="actions"><button disabled={busy} onClick={()=>exporting.mutate()}>Export backup</button><button disabled={busy} onClick={()=>{sessionStorage.removeItem('werk:backup-restored');input.current?.click();}}>Restore backup</button></div>
    <input hidden ref={input} type="file" accept=".zip,application/zip" aria-label="Backup ZIP" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)restoring.mutate(file);}}/>
    {(exporting.error||restoring.error)&&<p role="alert">{(exporting.error||restoring.error)?.message}</p>}
    <p role="status">{exporting.isPending?'Exporting…':restoring.isPending?'Restoring…':message}</p>
  </>;
}
