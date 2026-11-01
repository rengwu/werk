import {useEffect,useRef,useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {EditorState} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap} from '@codemirror/commands';
import {StreamLanguage,syntaxHighlighting,HighlightStyle} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {stex} from '@codemirror/legacy-modes/mode/stex';
import {call} from './rpc.ts';
import {useDirty} from './editing.ts';

function LatexEditor({value,onChange,readOnly}:{value:string;onChange:(value:string)=>void;readOnly:boolean}) {
 const parent=useRef<HTMLDivElement>(null),editor=useRef<EditorView>(undefined),change=useRef(onChange);change.current=onChange;
 useEffect(()=>{const view=new EditorView({parent:parent.current!,state:EditorState.create({doc:value,extensions:[lineNumbers(),history(),highlightActiveLine(),keymap.of([...defaultKeymap,...historyKeymap]),StreamLanguage.define(stex),syntaxHighlighting(HighlightStyle.define([{tag:[tags.keyword,tags.name,tags.tagName],color:'var(--code-keyword)'},{tag:[tags.string,tags.number,tags.atom,tags.bool],color:'var(--code-value)'},{tag:tags.comment,color:'var(--muted)'}])),EditorView.lineWrapping,EditorState.readOnly.of(readOnly),EditorView.contentAttributes.of({'aria-label':'CV LaTeX','role':'textbox','aria-multiline':'true'}),EditorView.updateListener.of(update=>{if(update.docChanged)change.current(update.state.doc.toString());}),EditorView.theme({'&':{height:'100%',fontSize:'12px'},'.cm-scroller':{overflow:'auto'},'.cm-content':{fontFamily:'ui-monospace,SFMono-Regular,Consolas,monospace'},'.cm-gutters':{backgroundColor:'var(--panel)',color:'var(--muted)',borderColor:'var(--line)'},'.cm-activeLine':{backgroundColor:'var(--hover)'},'.cm-activeLineGutter':{backgroundColor:'var(--selected)'},'&.cm-focused':{outline:'none'}})]})});editor.current=view;return()=>{view.destroy();editor.current=undefined;};},[readOnly]);
 useEffect(()=>{const view=editor.current;if(view&&view.state.doc.toString()!==value)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:value}});},[value]);
 return <div className="latex-editor" ref={parent}/>;
}
export function CvPage(){
 const {data,error}=useQuery({queryKey:['cv'],queryFn:()=>call('cv.get',undefined)}),{data:profile}=useQuery({queryKey:['profile'],queryFn:()=>call('profile.get',undefined)});
 const [view,setView]=useState<number|null>(null),[source,setSource]=useState(''),[base,setBase]=useState({version:0,source:''}),[downloadError,setDownloadError]=useState(''),[pdfUrl,setPdfUrl]=useState('');
 const dirty=source!==base.source;useDirty(dirty);
 const shown=(view?data?.versions.find(v=>v.version===view):data?.current)||null;
 useEffect(()=>{if(!dirty&&shown){setSource(shown.source);setBase({version:shown.version,source:shown.source});}},[shown?.version,dirty]);
 const save=useMutation({mutationFn:()=>call('cv.edit',{source,expectedVersion:base.version}),onSuccess:state=>{setSource(state.current!.source);setBase({version:state.current!.version,source:state.current!.source});setView(null);}});
 const generate=useMutation({mutationFn:()=>call('cv.generate',{expectedVersion:data?.current?.version||0}),onSuccess:state=>{setView(null);setSource(state.current!.source);setBase({version:state.current!.version,source:state.current!.source});}});
 const compile=useMutation({mutationFn:()=>call('cv.compile',{version:shown!.version})});
 const restore=useMutation({mutationFn:()=>call('cv.restore',{version:view!,expectedVersion:data?.current?.version||0}),onSuccess:state=>{setView(null);setSource(state.current!.source);setBase({version:state.current!.version,source:state.current!.source});}});
 const pdfVersion=view&&shown?.compileStatus==='ok'?view:data?.pdfVersion;
 const {data:pdf}=useQuery({queryKey:['cv','pdf',pdfVersion,shown?.compileStatus,data?.compiling],queryFn:()=>call('cv.pdf',{version:pdfVersion!}),enabled:!!pdfVersion&&!data?.compiling});
 useEffect(()=>{if(!pdf)return;const url=URL.createObjectURL(new Blob([new Uint8Array(pdf)],{type:'application/pdf'}));setPdfUrl(url);return()=>URL.revokeObjectURL(url);},[pdf]);
 function discard(){return !dirty||window.confirm('Discard unsaved CV changes?');}
 async function download(name:string,bytes:Uint8Array){try{await window.werk.saveFile({name,bytes});setDownloadError('');}catch(e){setDownloadError(String(e));}}
 return <section className="cv-page"><div className="cv-toolbar"><select aria-label="CV version" value={view||data?.current?.version||''} onChange={e=>{if(!discard())return;const v=data?.versions.find(v=>v.version===Number(e.target.value));if(v){setView(v.version===data?.current?.version?null:v.version);setSource(v.source);setBase({version:v.version,source:v.source});}}}>{!data?.versions.length&&<option value="">No CV yet</option>}{data?.versions.map(v=><option key={v.version} value={v.version}>Version {v.version}</option>)}</select>
 <button disabled={data?.compiling||generate.isPending} onClick={()=>{if(discard())generate.mutate();}}>Generate from profile</button><button disabled={!shown||dirty||data?.compiling} onClick={()=>compile.mutate()}>Recompile</button>
 {view?<button disabled={data?.compiling||restore.isPending} onClick={()=>restore.mutate()}>Restore</button>:<button disabled={!dirty||!source.trim()||data?.compiling||save.isPending} onClick={()=>save.mutate()}>Save</button>}
 <span className="grow"/><button disabled={!source} onClick={()=>void download('werk-cv.tex',new TextEncoder().encode(source))}>Download .tex</button><button disabled={!pdf} onClick={()=>pdf&&void download('werk-cv.pdf',pdf)}>Download PDF</button></div>
 {(error||save.error||generate.error||compile.error||restore.error||downloadError)&&<p role="alert">{(error||save.error||generate.error||compile.error||restore.error)?.message||downloadError}</p>}
 {shown?.profileRevision!==null&&shown&&profile&&profile.profile.revision>shown.profileRevision!&&<p className="notice">The profile has changed since this CV was generated. Generate from profile to create a new version.</p>}
 <div className="cv-columns"><div className="cv-source">{shown?<LatexEditor value={source} onChange={setSource} readOnly={!!view}/>:<div className="empty">Generate a CV from your profile.</div>}<div className="compile-status" role="status">{data?.compiling?'Compiling…':dirty?'Unsaved changes':shown?.compileStatus==='ok'?'PDF compiled':shown?.compileStatus==='failed'?'Compilation failed. Your source and previous PDF are preserved.':shown?'Not compiled':''}{shown?.diagnostics.map((d,i)=><p key={i} className={d.severity==='error'?'error':''}>{d.line?`Line ${d.line}: `:''}{d.message}</p>)}</div></div><div className="cv-preview">{pdfUrl?<><div className="document-meta">PDF · version {pdfVersion}</div><iframe title="CV PDF preview" src={pdfUrl}/></>:<div className="empty">No PDF yet.</div>}</div></div></section>;
}
