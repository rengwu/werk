import { useState } from 'react';
import { useMutation,useQuery } from '@tanstack/react-query';
import { call } from './rpc.ts';
import { timeLabel } from './JobsPage.tsx';
export function SourcesSettings(){
  const {data}=useQuery({queryKey:['sources'],queryFn:()=>call('sources.get',undefined)}),{data:scan}=useQuery({queryKey:['scan'],queryFn:()=>call('scan.get',undefined)});
  const [adding,setAdding]=useState(false),[value,setValue]=useState(''),[name,setName]=useState(''),[kind,setKind]=useState<'rss'|'greenhouse'|'ashby'|'lever'>('rss');
  const enable=useMutation({mutationFn:(p:{id:number;enabled:boolean})=>call('sources.enable',p)}),retry=useMutation({mutationFn:(id:number)=>call('scan.start',{id})});
  const add=useMutation({mutationFn:()=>call('sources.add',{value,name,kind}),onSuccess:()=>{setAdding(false);setValue('');setName('');}});
  return <><div className="actions"><button onClick={()=>setAdding(!adding)}>Add source</button><span className="muted">{data?.filter(s=>s.enabled).length||0} of {data?.length||0} enabled</span></div>
    {adding&&<form className="form-stack" onSubmit={e=>{e.preventDefault();add.mutate();}}><label>Type<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="rss">RSS / Atom or company board URL</option><option value="greenhouse">Greenhouse</option><option value="ashby">Ashby</option><option value="lever">Lever</option></select></label><label>URL or board slug<input required value={value} onChange={e=>setValue(e.target.value)}/></label><label>Name<input value={name} onChange={e=>setName(e.target.value)}/></label><div className="actions"><button type="submit" disabled={add.isPending}>Add</button><button type="button" onClick={()=>setAdding(false)}>Cancel</button></div></form>}
    {(add.error||enable.error||retry.error)&&<p role="alert">{(add.error||enable.error||retry.error)?.message}</p>}
    <table className="source-table"><thead><tr><th scope="col">Source</th><th scope="col">Kept</th><th scope="col">Saved</th><th scope="col">Last scan</th><th scope="col">Next allowed</th><th scope="col">Enabled</th></tr></thead><tbody>{data?.map(source=><tr key={source.id}><td>{source.name}{source.kind==='public_board'&&<span className="muted"> · Public board</span>}{source.lastError&&<div className="source-error" role="status">{source.lastError} <button disabled={scan?.running||!source.enabled||!!source.nextScanAt&&Date.parse(source.nextScanAt)>Date.now()} onClick={()=>retry.mutate(source.id)}>Retry</button></div>}</td><td>{source.kept}</td><td>{source.saved}</td><td>{timeLabel(source.lastScanAt)}</td><td>{source.enabled?(source.nextScanAt?timeLabel(source.nextScanAt):'Now'):'Off'}</td><td><input type="checkbox" aria-label={`Enable ${source.name}`} checked={source.enabled} onChange={e=>enable.mutate({id:source.id,enabled:e.target.checked})}/></td></tr>)}</tbody></table>
  </>;
}
