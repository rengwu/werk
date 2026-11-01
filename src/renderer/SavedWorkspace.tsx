import {tabKeys} from './tabs.ts';
import {useEffect,useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {call} from './rpc.ts';
import {useDirty} from './editing.ts';
import {JobNotes,dateLabel} from './JobsPage.tsx';
import type {JobRecord} from '../shared/jobs.ts';

export function SavedWorkspace({job}:{job:JobRecord}) {
 const [tab,setTab]=useState('Posting'),[description,setDescription]=useState(''),[editing,setEditing]=useState(false);
 useDirty(editing&&!!description);
 const status=useMutation({mutationFn:(status:'saved'|'applied')=>call('jobs.status',{id:job.id,status})});
 const full=useMutation({mutationFn:()=>call('jobs.description',{id:job.id,description}),onSuccess:()=>{setEditing(false);setDescription('');}});
 return <section className="saved-workspace"><div className="saved-heading"><div><span className="muted">{job.company}</span><h1>{job.title}</h1></div><select aria-label="Application status" value={job.status} onChange={e=>status.mutate(e.target.value as 'saved'|'applied')}><option value="saved">Saved</option><option value="applied">Applied</option></select><a href={job.url} target="_blank" rel="noreferrer">Open posting ↗</a>{status.error&&<p role="alert">{status.error.message}</p>}</div>
 <div className="saved-columns"><div className="saved-posting"><div className="tabs" role="tablist" onKeyDown={tabKeys} aria-label="Saved job"><button role="tab" tabIndex={tab==='Posting'?0:-1} aria-selected={tab==='Posting'} onClick={()=>setTab('Posting')}>Posting</button><button role="tab" tabIndex={tab==='Notes'?0:-1} aria-selected={tab==='Notes'} onClick={()=>setTab('Notes')}>Notes</button></div><div className="saved-posting-content">{tab==='Notes'?<JobNotes job={job}/>:<>
 {job.appliedAt&&<p className="muted">Applied {dateLabel(job.appliedAt)} · Manual record</p>}{job.closedAt&&<p className="muted">Closed {dateLabel(job.closedAt)}</p>}
 {!job.descriptionComplete&&<><p>Description incomplete. Add the full posting to generate a letter.</p><button onClick={()=>setEditing(true)}>Add full description</button></>}
 {editing?<div className="form-stack"><label>Full description<textarea rows={12} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="actions"><button disabled={description.trim().length<80||full.isPending} onClick={()=>full.mutate()}>Save description</button><button onClick={()=>setEditing(false)}>Cancel</button></div>{full.error&&<p role="alert">{full.error.message}</p>}</div>:<div className="description">{job.savedDescription||job.description}</div>}
 </>}</div></div><LetterEditor job={job}/></div></section>;
}
function LetterEditor({job}:{job:JobRecord}) {
 const {data,error}=useQuery({queryKey:['letters',job.id],queryFn:()=>call('letters.get',{id:job.id})});
 const [view,setView]=useState<number|null>(null),[body,setBody]=useState(''),[base,setBase]=useState({version:0,body:''}),[notice,setNotice]=useState('');
 const dirty=body!==base.body;useDirty(dirty);
 const shown=(view?data?.versions.find(v=>v.version===view):data?.current)||null;
 // Saving already advances the editor base; an older query must not reset it.
 useEffect(()=>{if(!dirty&&shown&&shown.version>=base.version){setBody(shown.body);setBase({version:shown.version,body:shown.body});}},[shown?.version]);
 const save=useMutation({mutationFn:()=>call('letters.edit',{id:job.id,body,expectedVersion:base.version}),onSuccess:v=>{setBody(v.body);setBase({version:v.version,body:v.body});setView(null);setNotice('Saved');}});
 const generate=useMutation({mutationFn:()=>call('letters.generate',{id:job.id})});
 const restore=useMutation({mutationFn:()=>call('letters.restore',{id:job.id,version:view!,expectedVersion:data?.current?.version||0}),onSuccess:v=>{setBody(v.body);setBase({version:v.version,body:v.body});setView(null);}});
 const task=data?.tasks.find(t=>['queued','running','paused'].includes(t.state)),failed=data?.tasks[0]?.state==='failed'?data.tasks[0]:undefined;
 function discard(){return !dirty||window.confirm('Discard unsaved letter changes?');}
 return <div className="letter-editor"><div className="letter-toolbar"><select aria-label="Letter version" value={view||data?.current?.version||''} onChange={e=>{if(!discard())return;const v=data?.versions.find(v=>v.version===Number(e.target.value));if(v){setView(v.version===data?.current?.version?null:v.version);setBody(v.body);setBase({version:v.version,body:v.body});}}}>{!data?.versions.length&&<option value="">No letter yet</option>}{data?.versions.map(v=><option key={v.version} value={v.version}>Version {v.version}</option>)}</select>
 <button disabled={!!task||data?.needsDescription||generate.isPending} onClick={()=>{if(discard()){setBody(base.body);setView(null);generate.mutate();}}}>Regenerate</button>
 <button disabled={!body} onClick={()=>void window.werk.copyText(body).then(()=>setNotice('Copied')).catch(()=>setNotice('Could not copy. Select the text and copy it.'))}>Copy text</button>
 {view?<button disabled={restore.isPending} onClick={()=>restore.mutate()}>Restore</button>:<button disabled={!dirty||!body.trim()||save.isPending} onClick={()=>save.mutate()}>Save</button>}</div>
 {(error||save.error||generate.error||restore.error)&&<p role="alert">{(error||save.error||generate.error||restore.error)?.message}</p>}
 {task&&<div className="document-status" role="status">{task.state==='running'?'Writing letter…':task.state==='queued'?'Letter queued':task.error}{task.state==='paused'&&<button onClick={()=>void call('tasks.retry',{id:task.id})}>Retry</button>}<button onClick={()=>void call('tasks.stop',{id:task.id})}>Stop</button></div>}
 {!task&&failed&&<div role="alert">{failed.error}<button onClick={()=>void call('tasks.retry',{id:failed.id})}>Retry</button></div>}
 {!shown&&!task&&<p className="muted">{data?.needsDescription?'Needs full description.':'No letter yet.'}</p>}
 <textarea className="letter-text" aria-label="Cover letter" value={body} readOnly={!!view} onChange={e=>{setBody(e.target.value);setNotice('');}} spellCheck/>
 <div className="document-meta"><span>{body.trim()?body.trim().split(/\s+/).length:0} words</span>{shown&&<span>{shown.createdBy} · Profile revision {shown.profileRevision??'unknown'}</span>}<span role="status">{dirty?'Unsaved changes':notice}</span></div>
 {!!shown?.reviewNotes.length&&<details className="review-notes" open><summary>Review notes</summary><ul>{shown.reviewNotes.map((note,i)=><li key={i}>{note}</li>)}</ul></details>}
 </div>;
}
