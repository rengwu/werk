import { useQuery } from '@tanstack/react-query';
import { useEffect,useState } from 'react';
import { call } from './rpc.ts';
export function AiSettings() {
  const {data}=useQuery({queryKey:['ai'],queryFn:()=>call('ai.get',undefined)});
  const [code,setCode]=useState(''),[error,setError]=useState('');
  const connection=data?.connection;
  async function action(fn:()=>Promise<unknown>){try{setError('');await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}}
  useEffect(()=>{if(connection?.url)window.open(connection.url,'_blank');},[connection?.url]);
  return <><dl className="diagnostics"><div><dt>ChatGPT</dt><dd>{connection?.state==='connected'?'Connected':connection?.state==='connecting'?'Connecting…':'Not connected'}</dd></div><div><dt>Model</dt><dd>gpt-5.6-sol</dd></div><div><dt>Reasoning</dt><dd>High</dd></div></dl>
    {connection?.message&&<p role="status">{connection.message}</p>}
    <div className="actions">{connection?.state==='connecting'?<button onClick={()=>void action(()=>call('ai.cancel',undefined))}>Cancel sign-in</button>:<button onClick={()=>void action(()=>call('ai.login',undefined))}>Sign in with ChatGPT</button>}{connection?.state==='connected'&&<button onClick={()=>void action(()=>call('ai.logout',undefined))}>Sign out</button>}</div>
    {connection?.url&&<p><a href={connection.url} target="_blank" rel="noreferrer">Open sign-in page</a></p>}
    {connection?.manual&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void action(async()=>{await call('ai.callback',{value:code});setCode('');});}}><label>Callback URL or code<input type="password" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></label><button disabled={!code} type="submit">Finish sign-in</button></form>}
    {error&&<p role="alert">{error}</p>}
    <h2>Queue</h2>{data?.paused&&<p role="status">{data.paused}</p>}{!data?.tasks.length?<p className="muted">No queued work.</p>:data.tasks.filter(t=>t.state!=='done').map(t=><div className="queue-row" key={t.id}><span>{t.kind==='assistant_turn'?'Assistant':t.kind==='cover_letter'?'Cover letter':'CV'} · {t.state}{t.error?` · ${t.error}`:''}</span>{['paused','failed'].includes(t.state)&&<button onClick={()=>void action(()=>call('tasks.retry',{id:t.id}))}>Retry</button>}{['running','queued','paused'].includes(t.state)&&<button onClick={()=>void action(()=>call('tasks.stop',{id:t.id}))}>Stop</button>}</div>)}
  </>;
}
