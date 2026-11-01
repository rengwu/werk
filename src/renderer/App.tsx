import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { call } from './rpc.ts';
import type { Theme } from '../shared/api.ts';

export function App() {
  const [page, setPage] = useState('Inbox');
  const [connection, setConnection] = useState<{ state: string; restartCount?: number; version?: string }>({ state: 'connecting' });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings.get', undefined) });
  const { data: update } = useQuery({ queryKey: ['update'], queryFn: () => call('update.get', undefined) });
  useEffect(() => { const listener = (e: Event) => setConnection((e as CustomEvent).detail); window.addEventListener('werk:connection', listener); return () => window.removeEventListener('werk:connection', listener); }, []);
  useEffect(() => { const mode = settings?.appearance || 'system'; document.documentElement.dataset.mode = mode; window.werk.setTheme(mode); }, [settings?.appearance]);
  return <div className="app">
    <aside className="sidebar"><div className={`brand ${window.werk.platform}`}>werk</div><nav aria-label="Main">{['Inbox','Saved','Profile','CV'].map(name => <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => setPage(name)}>{name}</button>)}</nav><div className="grow" />
      {update?.state === 'available' && <div className="update">werk {update.version}<a href={update.url} target="_blank" rel="noreferrer">Download</a></div>}
      <nav><button aria-current={page === 'Settings' ? 'page' : undefined} onClick={() => setPage('Settings')}>Settings</button></nav>
    </aside>
    <main><header><b>{page}</b></header>
      {connection.state === 'failed' ? <div className="empty" role="alert"><p>The backend could not restart.</p><button onClick={() => void navigator.clipboard.writeText(JSON.stringify(connection, null, 2))}>Copy diagnostics</button> <button onClick={() => { setConnection({ state: 'connecting' }); window.werk.connect(); }}>Restart</button></div> : <>
      {connection.state === 'restarting' && <div role="status" className="notice">Restarting the backend…</div>}
      {page === 'Settings' ? <SettingsPage /> : <div className="empty">{({ Inbox: 'No jobs yet.', Saved: 'No saved jobs.', Profile: 'No profile yet.', CV: 'No CV yet.' } as Record<string,string>)[page]}</div>}
      </>}
    </main>
  </div>;
}
function SettingsPage() {
  const [tab, setTab] = useState('General');
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings.get', undefined) });
  const change = useMutation({ mutationFn: (appearance: Theme) => call('settings.set', { appearance }) });
  return <><div className="tabs" role="tablist" aria-label="Settings">{['General','Diagnostics'].map(name => <button role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <section className="settings" role="tabpanel">{tab === 'General' ? <><label className="setting">Appearance<select aria-label="Appearance" value={data?.appearance || 'system'} onChange={e => change.mutate(e.target.value as Theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>{change.error && <p role="alert">{change.error.message}</p>}</> : <DiagnosticsPage />}</section></>;
}
function DiagnosticsPage() {
  const { data, error } = useQuery({ queryKey: ['diagnostics'], queryFn: () => call('diagnostics.get', undefined) });
  const [copied, setCopied] = useState(false);
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p role="status">Loading diagnostics…</p>;
  const rows: [string, string | number][] = [ ['werk', data.version], ['Electron', data.electron], ['Chromium', data.chromium], ['Node', data.node], ['SQLite', data.sqlite], ['FTS5', data.fts5 ? 'Available' : 'Unavailable'], ['Schema', data.schema], ['Database size', `${data.databaseBytes.toLocaleString()} bytes`], ['System', data.system], ['Data folder', data.dataFolder], ['Backend', data.backend], ['Started', data.startedAt], ['Restarts', data.restartCount], ['Update', data.update.state], ['Last checked', data.update.checkedAt || 'Not checked'] ];
  return <><div className="actions"><button onClick={async () => { await navigator.clipboard.writeText(rows.map(([k,v]) => `${k}: ${v}`).join('\n') + '\n' + data.events.map(e => `${e.at} ${e.level} ${e.scope}: ${e.message}`).join('\n')); setCopied(true); }}>Copy diagnostics</button>{copied && <span role="status">Copied</span>}</div><dl className="diagnostics">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd data-testid={`diagnostic-${name.toLowerCase().replaceAll(' ','-')}`}>{value}</dd></div>)}</dl>{data.events.length > 0 && <><h2>Recent warnings and errors</h2>{data.events.map((e,i) => <p key={i}>{e.at} · {e.scope} · {e.message}</p>)}</>}</>;
}
