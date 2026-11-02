import { tabKeys } from './tabs.ts';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { call } from './rpc.ts';
import { hasDirtyEdits, useDirty } from './editing.ts';
import { jobFilterSchema, type JobRecord, type JobFilter, type JobStatus } from '../shared/jobs.ts';
import { SavedWorkspace } from './SavedWorkspace.tsx';
import { LocationFilter } from './LocationFilter.tsx';
export function dateLabel(value:string|null){if(!value)return 'Not listed';return new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
export function timeLabel(value:string|null){return value?new Date(value).toLocaleString():'Not scanned';}

function initialFilters(saved: boolean, key: string): JobFilter {
  try {
    const result = jobFilterSchema.safeParse(JSON.parse(sessionStorage.getItem(key) || 'null'));
    if (result.success && (result.data.view === 'saved') === saved) {
      const {limit, offset, ...filters} = result.data;
      return filters;
    }
  } catch { /* An unavailable or old session starts with the default view. */ }
  return {view: saved ? 'saved' : 'new', sort: saved ? 'saved' : 'match'};
}

export function JobsPage({saved=false,selected,setSelected,shortcuts=true}: {
  saved?:boolean;selected:number|null;setSelected:(id:number|null)=>void;shortcuts?:boolean;
}) {
  const storageKey = `werk:jobs:${saved ? 'saved' : 'inbox'}`;
  const [settings, setSettings] = useState(() => initialFilters(saved, storageKey));
  const [filtersOpen, setFiltersOpen] = useState(false), [offset, setOffset] = useState(0);
  const [undo, setUndo] = useState<number|null>(null);
  const input = useRef<HTMLInputElement>(null);
  const {view, search='', level='', arrangement='', locations=[], days, savedStatus, sort} = settings;
  const update = (patch: Partial<JobFilter>) => {setOffset(0); setSettings(current => ({...current, ...patch}));};
  const filter: JobFilter = {...settings, offset};
  const {data,error} = useQuery({queryKey:['jobs','list',filter],queryFn:()=>call('jobs.list',filter)});
  const locationOptions = useQuery({queryKey:['jobs','locations'],queryFn:()=>call('jobs.locations',undefined),enabled:filtersOpen});
  const {data:scan} = useQuery({queryKey:['scan'],queryFn:()=>call('scan.get',undefined)});
  const {data:detail} = useQuery({queryKey:['jobs','detail',selected],queryFn:()=>call('jobs.get',{id:selected!}),enabled:!!selected});
  const scanNow = useMutation({mutationFn:()=>call('scan.start',{})});
  const open = useMutation({mutationFn:(id:number)=>call('jobs.open',{id})});
  const change = useMutation({
    mutationFn:({id,status}:{id:number;status:JobStatus})=>call('jobs.status',{id,status}),
    onSuccess:(_job,p)=>{
      setUndo(p.status === 'new' ? null : p.id);
      if (!saved && (view === 'new' || view === 'skipped') && p.status !== view) {
        const rows=data?.jobs||[], index=rows.findIndex(j=>j.id===p.id), next=rows[index+1]||rows[index-1];
        setSelected(next?.id||null); if(next)open.mutate(next.id);
      }
    },
  });
  const choose = (id:number) => {if(hasDirtyEdits()&&!window.confirm('Discard unsaved changes?'))return;setSelected(id);open.mutate(id);};
  const activeFilters = Number(!!level)+Number(!!arrangement)+Number(!!locations.length || !!settings.country)+Number(!!days);
  useEffect(() => {try {sessionStorage.setItem(storageKey, JSON.stringify(settings));} catch { /* Keep working if storage is unavailable. */ }}, [settings,storageKey]);
  useEffect(()=>{if(saved&&data&&!data.jobs.some(j=>j.id===selected)&&!hasDirtyEdits())setSelected(data.jobs[0]?.id||null);},[saved,data,selected]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(!shortcuts||e.ctrlKey||e.metaKey||e.altKey||(e.target as HTMLElement).closest('input,textarea,select,summary,[contenteditable=true]'))return;
      const rows=data?.jobs||[],index=rows.findIndex(j=>j.id===selected);
      if(e.key==='/'){e.preventDefault();input.current?.focus();}
      else if(['j','k'].includes(e.key.toLowerCase())){e.preventDefault();const next=rows[Math.max(0,Math.min(rows.length-1,index+(e.key.toLowerCase()==='j'?1:-1)))];if(next)choose(next.id);}
      else if(selected&&e.key.toLowerCase()==='s'&&!change.isPending){e.preventDefault();change.mutate({id:selected,status:'saved'});}
      else if(selected&&e.key.toLowerCase()==='x'&&!change.isPending){e.preventDefault();change.mutate({id:selected,status:'skipped'});}
      else if(detail&&e.key.toLowerCase()==='o'){e.preventDefault();window.open(detail.url,'_blank');}
      else if(e.key==='Escape')update({search:''});
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[data,selected,detail,shortcuts,change.isPending]);
  const tabs = saved
    ? [{value:'',label:'All'},{value:'saved',label:'Saved'},{value:'applied',label:'Applied'}]
    : [{value:'new',label:`New${data?` (${data.newCount})`:''}`},{value:'all',label:'All matches'},{value:'skipped',label:'Skipped'}];
  return <div className="jobs-page"><div className="job-list-pane">
    <div className="tabs" role="tablist" onKeyDown={tabKeys} aria-label={saved?'Saved status':'Inbox'}>{tabs.map(tab => {
      const active = tab.value === (saved ? savedStatus || '' : view);
      return <button key={tab.value} role="tab" tabIndex={active?0:-1} aria-selected={active} onClick={()=>update(saved ? {savedStatus:tab.value as JobFilter['savedStatus'] || undefined} : {view:tab.value as JobFilter['view']})}>{tab.label}</button>;
    })}</div>
    <div className="job-tools">
      <select aria-label="Sort jobs" value={sort || (saved?'saved':'match')} onChange={e=>update({sort:e.target.value as JobFilter['sort']})}>
        {saved&&<option value="saved">Recently saved</option>}<option value="match">Best match</option><option value="discovered">Recently discovered</option>
      </select>
      <span className="grow"/>{!saved&&<button disabled={scan?.running||scanNow.isPending} onClick={()=>scanNow.mutate()}>Scan now</button>}
    </div>
    <div className="job-search"><input ref={input} type="search" maxLength={500} aria-label="Search jobs" placeholder="Search jobs" value={search} onChange={e=>update({search:e.target.value})} onKeyDown={e=>{if(e.key==='Escape'){update({search:''});input.current?.blur();}}}/><button aria-expanded={filtersOpen} aria-controls="job-filters" onClick={()=>setFiltersOpen(!filtersOpen)}>Filters{activeFilters ? ` (${activeFilters})` : ''}</button></div>
    {filtersOpen&&<div id="job-filters" className="job-filters">
      <select aria-label="Match level" value={level} onChange={e=>update({level:e.target.value as JobFilter['level'] || undefined})}><option value="">Any match</option><option value="strong">Strong</option><option value="adjacent">Adjacent</option></select>
      <select aria-label="Arrangement filter" value={arrangement} onChange={e=>update({arrangement:e.target.value as JobFilter['arrangement'] || undefined})}><option value="">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">Onsite</option></select>
      <select aria-label="Posted within" value={days || ''} onChange={e=>update({days:e.target.value?Number(e.target.value):undefined})}><option value="">Any date</option><option value="7">Past week</option><option value="30">Past month</option><option value="90">Past 3 months</option></select>
      {!!activeFilters&&<button className="clear-filters" onClick={()=>update({level:undefined,arrangement:undefined,country:undefined,locations:[],days:undefined})}>Clear filters</button>}
      <LocationFilter options={locationOptions.data || []} value={locations} onChange={locations=>update({locations,country:undefined})} loading={locationOptions.isPending} error={locationOptions.error} retry={()=>void locationOptions.refetch()}/>
    </div>}
    {scan?.running&&<p role="status" className="scan-status">Scanning {scan.source}… {scan.kept} kept</p>}
    {(error||scanNow.error||change.error)&&<p role="alert" className="scan-status">{(error||scanNow.error||change.error)?.message}</p>}
    {undo&&<div className="scan-status" role="status">{change.data?.status==='saved'?'Saved.':'Skipped.'} <button onClick={()=>{void call('jobs.status',{id:undo,status:'new'}).then(()=>{setSelected(undo);setUndo(null);});}}>Move back to New</button></div>}
    <div className="job-rows" role="list" aria-label={saved?'Saved jobs':'Jobs'}>{data?.jobs.map(job=><div role="listitem" key={job.id}><button className={`job-row ${selected===job.id?'selected':''}`} aria-current={selected===job.id?'true':undefined} onClick={()=>choose(job.id)}><span className={job.openedAt?'job-title':'job-title unopened'}>{job.title}</span><span className="muted">{job.company} · {job.location||'Location not listed'}</span>{saved&&<span className="muted">{job.letterState}</span>}<span className="row-bottom"><span className={`match ${job.matchLevel}`}>{job.matchLevel==='strong'?'Strong':job.matchLevel==='adjacent'?'Adjacent':job.matchLevel}</span><span>{job.status==='applied'?`Applied ${dateLabel(job.appliedAt)}`:dateLabel(job.postedAt)}</span></span></button></div>)}
      {data&&!data.jobs.length&&<div role="listitem" className="empty"><p>{search||activeFilters?'No matching jobs.':saved?savedStatus==='applied'?'No applied jobs.':'No saved jobs.':view==='new'?'No new jobs.':view==='skipped'?'No skipped jobs.':'No matches yet.'}</p>{!saved&&<p>{scan?.nextScanAt?`Next scan ${timeLabel(scan.nextScanAt)}`:`Last scan ${timeLabel(scan?.lastScanAt||null)}`}</p>}</div>}
    </div>{data&&data.total>100&&<div className="pagination"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-100))}>Previous</button><span>{offset+1}–{Math.min(offset+100,data.total)} of {data.total}</span><button disabled={offset+100>=data.total} onClick={()=>setOffset(offset+100)}>Next</button></div>}
  </div><div className="job-detail-pane">{detail?saved&&['saved','applied'].includes(detail.status)?<SavedWorkspace key={detail.id} job={detail}/>:<JobDetail key={detail.id} job={detail} onStatus={status=>change.mutate({id:detail.id,status})} onRemoved={()=>setSelected(null)}/>:<div className="empty">Select a job.</div>}</div></div>;
}
export function HighlightedDescription({job}:{job:JobRecord}) {
  let position=0;const parts:React.ReactNode[]=[];
  for(const span of [...(job.descriptionComplete?job.assessment.highlights||[]:[])].sort((a,b)=>a.start-b.start)){if(span.start<position||span.end>job.description.length)continue;parts.push(job.description.slice(position,span.start));parts.push(<mark className={span.kind} key={`${span.start}-${span.end}`}>{job.description.slice(span.start,span.end)}</mark>);position=span.end;}
  parts.push(job.description.slice(position));return <div className="description">{parts}</div>;
}
function JobDetail({job,onStatus,onRemoved}:{job:JobRecord;onStatus:(status:JobStatus)=>void;onRemoved:()=>void}) {
  const [tab,setTab]=useState('Description'),[adding,setAdding]=useState(false),[description,setDescription]=useState('');useDirty(adding&&!!description);
  const hide=useMutation({mutationFn:()=>call('jobs.hideCompany',{id:job.id}),onSuccess:onRemoved});
  const saveDescription=useMutation({mutationFn:()=>call('jobs.description',{id:job.id,description}),onSuccess:value=>{setAdding(false);setDescription('');if(!value)onRemoved();}});
  return <article className="job-detail"><div className="muted">{job.company}</div><h1>{job.title}</h1><div className="chips"><span className={`match ${job.matchLevel}`}>{job.matchLevel[0].toUpperCase()+job.matchLevel.slice(1)} · {job.matchScore}</span><span>{job.assessment.remoteEligibility==='possible'?'Remote location possible':job.assessment.remoteEligibility==='restricted'?'Remote location restricted':'Eligibility needs review'}</span><span>{job.overlapHours===null?'Overlap unknown':`${job.overlapHours}h overlap`}</span><span>{dateLabel(job.postedAt)}</span><span>{job.salary||'Salary not listed'}</span></div>
    <div className="actions detail-actions">{!['saved','applied'].includes(job.status)&&<button onClick={()=>onStatus('saved')}>Save</button>}{job.status==='new'?<button onClick={()=>onStatus('skipped')}>Skip</button>:<button onClick={()=>onStatus('new')}>Move back to New</button>}<a href={job.url} target="_blank" rel="noreferrer">Open posting ↗</a><span className="grow"/><button onClick={()=>hide.mutate()}>Hide company</button></div>
    {hide.error&&<p role="alert">{hide.error.message}</p>}{job.closedAt&&<p className="muted">Closed {dateLabel(job.closedAt)}.</p>}
    <div className="decision-summary"><h2>Match</h2>{job.assessment.reasons.map((reason,i)=><p key={i}>{reason}</p>)}{job.assessment.eligibilityNotes.map((note,i)=><p key={`e${i}`}>{note}</p>)}{job.assessment.gaps.length>0&&<><h3>Gaps</h3><ul>{job.assessment.gaps.map((gap,i)=><li key={i}>{gap}</li>)}</ul></>}{job.assessment.qualityNotes.map((note,i)=><p className="muted" key={`q${i}`}>{note}</p>)}</div>
    <div className="tabs" role="tablist" onKeyDown={tabKeys} aria-label="Job detail">{['Description','Notes'].map(name=><button role="tab" tabIndex={tab===name?0:-1} aria-selected={tab===name} key={name} onClick={()=>setTab(name)}>{name}</button>)}</div>
    {tab==='Notes'?<JobNotes key={job.id} job={job}/>:<>{job.descriptionComplete?<div className="highlight-legend"><span className="matched">Matched evidence</span><span className="missing">Missing requirement</span></div>:<div className="actions"><p>Description incomplete.</p><button onClick={()=>setAdding(true)}>Add full description</button></div>}{adding?<div className="form-stack"><label>Full description<textarea rows={12} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="actions"><button disabled={description.trim().length<80||saveDescription.isPending} onClick={()=>saveDescription.mutate()}>Save description</button><button onClick={()=>{setAdding(false);setDescription('');}}>Cancel</button></div>{saveDescription.error&&<p role="alert">{saveDescription.error.message}</p>}</div>:<HighlightedDescription job={job}/>}</>}
    <div className="provenance">{job.sources.map((source,i)=><p key={i}><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> · Checked {timeLabel(source.checkedAt)}</p>)}</div>
  </article>;
}
export function JobNotes({job}:{job:JobRecord}) {
  const [notes,setNotes]=useState(job.notes),[saved,setSaved]=useState(job.notes);const save=useMutation({mutationFn:(value:string)=>call('jobs.notes',{id:job.id,notes:value}),onSuccess:(_result,value)=>setSaved(value)});useDirty(notes!==saved);
  useEffect(()=>{if(notes===saved)return;const timer=setTimeout(()=>save.mutate(notes),700);return()=>clearTimeout(timer);},[notes,saved]);
  return <div className="job-notes"><textarea aria-label="Job notes" rows={12} value={notes} onChange={e=>setNotes(e.target.value)}/><span className="muted" role="status">{save.error?save.error.message:notes===saved?'Saved':'Saving…'}</span></div>;
}
