import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { call } from './rpc.ts';
import type { Theme } from '../shared/api.ts';
import { ProfilePage } from './ProfilePage.tsx';
import { AssistantPane } from './AssistantPane.tsx';
import { AiSettings } from './AiSettings.tsx';
import { hasDirtyEdits } from './editing.ts';
import { JobsPage } from './JobsPage.tsx';
import { SourcesSettings } from './SourcesSettings.tsx';

export function App() {
  const [page, setPage] = useState('Inbox');
  const [selected,setSelected]=useState<number|null>(null);
  const [assistantOpen,setAssistantOpen]=useState(false),[settingsTab,setSettingsTab]=useState('General'),[dirty,setDirty]=useState(false);
  const assistantButton=useRef<HTMLButtonElement>(null);
  const closeAssistant=useCallback(()=>{setAssistantOpen(false);assistantButton.current?.focus();},[]);
  const navigate=(name:string)=>{if(hasDirtyEdits()&&!window.confirm('Discard unsaved changes?'))return;setPage(name);};
  const [connection, setConnection] = useState<{ state: string; restartCount?: number; version?: string }>({ state: 'connecting' });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings.get', undefined) });
  const { data: update } = useQuery({ queryKey: ['update'], queryFn: () => call('update.get', undefined) });
  const {data:scan}=useQuery({queryKey:['scan'],queryFn:()=>call('scan.get',undefined)});
  const {data:counts}=useQuery({queryKey:['jobs','counts'],queryFn:()=>call('jobs.list',{view:'new',limit:1})});
  const {data:sources}=useQuery({queryKey:['sources'],queryFn:()=>call('sources.get',undefined)});
  const {data:ai}=useQuery({queryKey:['ai'],queryFn:()=>call('ai.get',undefined)});
  useEffect(() => { const listener = (e: Event) => setConnection((e as CustomEvent).detail); window.addEventListener('werk:connection', listener); return () => window.removeEventListener('werk:connection', listener); }, []);
  useEffect(() => { const mode = settings?.appearance || 'system'; document.documentElement.dataset.mode = mode; window.werk.setTheme(mode); }, [settings?.appearance]);
  useEffect(()=>{const update=()=>setDirty(hasDirtyEdits());window.addEventListener('werk:dirty',update);return()=>window.removeEventListener('werk:dirty',update);},[]);
  return <div className="app">
    <aside className="sidebar"><div className={`brand ${window.werk.platform}`}>werk</div><nav aria-label="Main">{['Inbox','Saved','Profile','CV'].map(name => <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => navigate(name)}>{name}{name==='Inbox'&&!!counts?.newCount&&<span className="nav-count">{counts.newCount}</span>}{name==='Saved'&&!!counts?.savedCount&&<span className="nav-count">{counts.savedCount}</span>}</button>)}</nav><div className="grow" />
      {update?.state === 'available' && <div className="update">werk {update.version}<a href={update.url} target="_blank" rel="noreferrer">Download</a></div>}
      <nav><button aria-current={page === 'Settings' ? 'page' : undefined} onClick={() => navigate('Settings')}>Settings{(sources?.some(s=>s.enabled&&s.lastError)||['signed_out','unavailable'].includes(ai?.connection.state||''))&&<span className="attention-dot" aria-label="Needs attention"/>}</button></nav>
    </aside>
    <main><header><b>{page}</b><span className="grow"/><button ref={assistantButton} aria-label="Open assistant" onClick={()=>setAssistantOpen(true)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg></button></header>
      {connection.state === 'failed' ? <div className="empty" role="alert"><p>The backend could not restart.</p><button onClick={() => void navigator.clipboard.writeText(JSON.stringify(connection, null, 2))}>Copy diagnostics</button> <button onClick={() => { setConnection({ state: 'connecting' }); window.werk.connect(); }}>Restart</button></div> : <>
      {connection.state === 'restarting' && <div role="status" className="notice">Restarting the backend…</div>}
      {page === 'Settings' ? <SettingsPage tab={settingsTab} setTab={setSettingsTab}/> : page==='Profile'?<ProfilePage openAssistant={()=>setAssistantOpen(true)}/>:page==='Inbox'&&!scan?.firstScanCompleted?<Setup openAssistant={()=>setAssistantOpen(true)} openProfile={()=>navigate('Profile')} openAi={()=>{setSettingsTab('AI');navigate('Settings');}} openSources={()=>{setSettingsTab('Sources');navigate('Settings');}}/>:page==='Inbox'||page==='Saved'?<JobsPage key={page} saved={page==='Saved'} selected={selected} setSelected={setSelected} shortcuts={!assistantOpen}/>:<div className="empty">No CV yet.</div>}
      </>}
    </main>
    <AssistantPane open={assistantOpen} onClose={closeAssistant} context={{page,jobId:['Inbox','Saved'].includes(page)?selected||undefined:undefined,document:page==='Profile'?'profile':page==='CV'?'cv':page==='Saved'?'letter':undefined,dirty}}/>
  </div>;
}
function SettingsPage({tab,setTab}:{tab:string;setTab:(value:string)=>void}) {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings.get', undefined) });
  const change = useMutation({ mutationFn: (appearance: Theme) => call('settings.set', { appearance }) });
  const schedule=useMutation({mutationFn:(scanInterval:0|4|12)=>call('settings.set',{scanInterval})});
  return <><div className="tabs" role="tablist" aria-label="Settings">{['General','Sources','AI','Diagnostics'].map(name => <button role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <section className={`settings ${tab==='Sources'?'wide':''}`} role="tabpanel">{tab === 'General' ? <><label className="setting">Appearance<select aria-label="Appearance" value={data?.appearance || 'system'} onChange={e => change.mutate(e.target.value as Theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label className="setting">Scan schedule<select aria-label="Scan schedule" value={data?.scanInterval||0} onChange={e=>schedule.mutate(Number(e.target.value) as 0|4|12)}><option value="0">Manual</option><option value="4">Every 4 hours</option><option value="12">Every 12 hours</option></select></label>{(change.error||schedule.error) && <p role="alert">{(change.error||schedule.error)?.message}</p>}</> :tab==='AI'?<AiSettings/>:tab==='Sources'?<SourcesSettings/>: <DiagnosticsPage />}</section></>;
}
function Setup({openAssistant,openProfile,openAi,openSources}:{openAssistant:()=>void;openProfile:()=>void;openAi:()=>void;openSources:()=>void}) {
  const {data:profile}=useQuery({queryKey:['profile'],queryFn:()=>call('profile.get',undefined)});
  const {data:ai}=useQuery({queryKey:['ai'],queryFn:()=>call('ai.get',undefined)});
  const ready=profile?.readiness.ready;
  const {data:scan}=useQuery({queryKey:['scan'],queryFn:()=>call('scan.get',undefined)});
  const start=useMutation({mutationFn:()=>call('scan.start',{})});
  return <div className="setup"><h2>Set up werk</h2><div className="step"><span className="step-number">1</span><b>Connect ChatGPT</b>{ai?.connection.state==='connected'?<span className="ok">Connected</span>:<button onClick={openAi}>Sign in</button>}<p>Used for your profile, cover letters and the assistant.</p></div><div className="step"><span className="step-number">2</span><b>Build your profile</b><button onClick={openAssistant}>{ready?'Edit with assistant':'Open assistant'}</button><p>{ready?'Ready for discovery.':'Needed: name, location, target roles, background and work arrangement.'}</p></div><div className="step"><span className="step-number">3</span><b>Set search criteria</b><button onClick={openProfile}>Edit criteria</button><p>Roles, locations, work arrangement and working-hours overlap decide what is collected.</p></div><div className="step"><span className="step-number">4</span><b>Choose sources</b><button onClick={openSources}>Review sources</button></div><div className="step"><span className="step-number">5</span><b>Run the first scan</b><button disabled={!ready||scan?.running} onClick={()=>start.mutate()}>Scan now</button>{scan?.running&&<p role="status">Scanning {scan.source}…</p>}{start.error&&<p role="alert">{start.error.message}</p>}</div></div>;
}
function DiagnosticsPage() {
  const { data, error } = useQuery({ queryKey: ['diagnostics'], queryFn: () => call('diagnostics.get', undefined) });
  const [copied, setCopied] = useState(false);
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p role="status">Loading diagnostics…</p>;
  const rows: [string, string | number][] = [ ['werk', data.version], ['Electron', data.electron], ['Chromium', data.chromium], ['Node', data.node], ['SQLite', data.sqlite], ['FTS5', data.fts5 ? 'Available' : 'Unavailable'], ['Schema', data.schema], ['Database size', `${data.databaseBytes.toLocaleString()} bytes`], ['System', data.system], ['Data folder', data.dataFolder], ['Backend', data.backend], ['Started', data.startedAt], ['Restarts', data.restartCount], ['Update', data.update.state], ['Last checked', data.update.checkedAt || 'Not checked'] ];
  return <><div className="actions"><button onClick={async () => { await navigator.clipboard.writeText(rows.map(([k,v]) => `${k}: ${v}`).join('\n') + '\n' + data.events.map(e => `${e.at} ${e.level} ${e.scope}: ${e.message}`).join('\n')); setCopied(true); }}>Copy diagnostics</button>{copied && <span role="status">Copied</span>}</div><dl className="diagnostics">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd data-testid={`diagnostic-${name.toLowerCase().replaceAll(' ','-')}`}>{value}</dd></div>)}</dl>{data.events.length > 0 && <><h2>Recent warnings and errors</h2>{data.events.map((e,i) => <p key={i}>{e.at} · {e.scope} · {e.message}</p>)}</>}</>;
}
