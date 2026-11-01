import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { call } from './rpc.ts';
import type { AssistantContext, Attachment, SendMode, ToolActivity } from '../shared/ai.ts';

function ToolCall({tool}:{tool:ToolActivity}) {
  const input=tool.input as Record<string,unknown>;
  const target=String(input?.path||input?.command||input?.url||input?.query||'');
  return <details className={`tool-call ${tool.state}`}>
    <summary><span className="tool-name">{tool.name}</span>{target&&<span className="tool-target" title={target}>{target}</span>}<span className="tool-state">{tool.state==='running'?'Running':tool.state==='failed'?'Failed':tool.state==='stopped'?'Stopped':'Done'}</span></summary>
    <pre aria-label={`${tool.name} input`}>{JSON.stringify(tool.input,null,2)}</pre>
    {tool.output&&<pre aria-label={`${tool.name} output`}>{tool.output}</pre>}
    {tool.durationMs!==undefined&&<span className="muted">{(tool.durationMs/1000).toFixed(1)} s</span>}
  </details>;
}
export function AssistantPane({open,onClose,context}:{open:boolean;onClose:()=>void;context:AssistantContext}) {
  const {data}=useQuery({queryKey:['assistant'],queryFn:()=>call('assistant.get',undefined)});
  const [text,setText]=useState(''),[files,setFiles]=useState<Attachment[]>([]),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[dragging,setDragging]=useState(false),[mode,setMode]=useState<SendMode>('steer');
  const composer=useRef<HTMLTextAreaElement>(null),scroller=useRef<HTMLDivElement>(null),picker=useRef<HTMLInputElement>(null),atBottom=useRef(true),dragDepth=useRef(0),loadedChat=useRef('');
  const task=data?.tasks.find(t=>t.state==='running')||data?.tasks.find(t=>['queued','paused'].includes(t.state));
  const latest=data?.tasks[0], failed=latest?.state==='failed'?latest:undefined;
  const send=useMutation({mutationFn:(value:{text:string;attachments:string[];mode:SendMode})=>call('assistant.send',{...value,context,clientId:crypto.randomUUID()}),onSuccess:(_,sent)=>{setText(current=>current===sent.text?'':current);setFiles(current=>current.filter(f=>!sent.attachments.includes(f.id)));setError('');atBottom.current=true;composer.current?.focus();},onError:e=>setError(e.message)});
  const stop=useMutation({mutationFn:()=>call('assistant.stop',undefined),onError:e=>setError(e.message)});
  const canSend=(!!text.trim()||files.length>0)&&!uploading&&!send.isPending&&!stop.isPending;
  function submit(choice=mode){if(canSend)send.mutate({text,attachments:files.map(f=>f.id),mode:choice});}
  useEffect(()=>{if(open){composer.current?.focus();if(scroller.current&&atBottom.current)scroller.current.scrollTop=scroller.current.scrollHeight;}},[open]);
  useEffect(()=>{if(data&&loadedChat.current!==data.chatId){loadedChat.current=data.chatId;setText(localStorage.getItem(`assistant-draft:${data.chatId}`)||'');setFiles(data.pendingAttachments);}},[data]);
  useEffect(()=>{if(data&&loadedChat.current===data.chatId)localStorage.setItem(`assistant-draft:${data.chatId}`,text);},[text,data?.chatId]);
  useEffect(()=>{if(scroller.current&&atBottom.current)scroller.current.scrollTop=scroller.current.scrollHeight;},[data]);
  useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,onClose]);
  async function attach(list:FileList|File[]) {
    setUploading(true);setError('');
    try { for(const file of Array.from(list)){if(file.size>32*1024*1024)throw new Error('Attach files up to 32 MB, or give the assistant a local path.');const saved=await call('attachments.add',{name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});setFiles(old=>[...old,saved]);} }
    catch(e){setError(e instanceof Error?e.message:'Could not attach file.');}finally{setUploading(false);}
  }
  return <aside className={`assistant-pane ${open?'open':''} ${dragging?'drop-active':''}`} aria-label="Assistant" hidden={!open}
    onDragEnter={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth.current++;setDragging(true);}}}
    onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}}
    onDragLeave={e=>{e.preventDefault();if(--dragDepth.current<=0){dragDepth.current=0;setDragging(false);}}}
    onDrop={e=>{e.preventDefault();dragDepth.current=0;setDragging(false);if(e.dataTransfer.files.length)void attach(e.dataTransfer.files);}}>
    <header><b>Assistant</b><span className="grow"/><button onClick={async()=>{try{await call('assistant.new',undefined);setText('');setFiles([]);setError('');}catch(e){setError(String(e));}}}>New chat</button><button aria-label="Close assistant" onClick={onClose}>×</button></header>
    <div className="assistant-context"><span>{context.page}{context.jobId?` · Job ${context.jobId}`:''}{context.dirty?' · Unsaved edits':''}</span><details className="assistant-access"><summary>Full access</summary><div><p>Read and write files, run shell commands, and access the network.</p><code>{data?.cwd}</code><p>{data?.tools.join(' · ')}</p></div></details></div>
    <div className="messages" ref={scroller} role="log" aria-live="polite" aria-relevant="additions" onScroll={()=>{const el=scroller.current;if(el)atBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>
      {!data?.messages.length&&<p className="muted">Ask a question, drop files, or share a local path or URL.</p>}
      {data?.messages.map(message=><article className={`message ${message.role}`} key={message.id}>
        <span className="message-role">{message.role==='user'?'You':'Assistant'}{message.pending?' · Queued':''}</span>
        {message.text&&(message.role==='user'?<div className="message-text">{message.text}</div>:<div className="message-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{a:props=><a {...props} target="_blank" rel="noreferrer"/>}}>{message.text}</Markdown></div>)}
        {message.attachments.map(a=><span className="chip" key={a.id}>{a.name}</span>)}
        {message.tools?.map(tool=><ToolCall key={tool.id} tool={tool}/>)}
        {message.receipts.map((r,i)=><p className="receipt" key={i}>{r.record} saved · version {r.version}{r.detail?` · ${r.detail}`:''}</p>)}
      </article>)}
    </div>
    <form className="composer" onSubmit={e=>{e.preventDefault();submit();}}>
      {task&&<div role="status" className="task-state">{task.state==='running'?data?.activity||'Working…':task.state==='queued'?'Queued':task.error}{task.state==='paused'&&<button type="button" onClick={()=>void call('tasks.retry',{id:task.id}).catch(e=>setError(e.message))}>Retry</button>}</div>}
      {!task&&failed&&<div role="alert" className="task-state">{failed.error}{failed.error!=='Stopped.'&&<button type="button" onClick={()=>void call('tasks.retry',{id:failed.id}).catch(e=>setError(e.message))}>Retry</button>}</div>}
      {files.length>0&&<div className="attachments">{files.map(f=><span className="chip" key={f.id}>{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={async()=>{await call('attachments.remove',{id:f.id});setFiles(old=>old.filter(a=>a.id!==f.id));}}>×</button></span>)}</div>}
      <textarea ref={composer} aria-label="Message assistant" value={text} onChange={e=>setText(e.target.value)} placeholder={task?'Continue the conversation…':'Message assistant…'} rows={3} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit(e.altKey?'interrupt':mode);}}} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();void attach(e.clipboardData.files);}}}/>
      {error&&<p role="alert">{error}</p>}<div className="actions"><input ref={picker} type="file" multiple hidden onChange={e=>{if(e.target.files)void attach(e.target.files);e.target.value='';}}/><button type="button" disabled={uploading} onClick={()=>picker.current?.click()}>{uploading?'Attaching…':'Attach files'}</button><span className="grow"/>
      {task&&<><button type="button" onClick={()=>stop.mutate()} disabled={stop.isPending}>{stop.isPending?'Stopping…':'Stop'}</button><select aria-label="Send while working" value={mode} onChange={e=>setMode(e.target.value as SendMode)}><option value="steer">Steer</option><option value="interrupt">Interrupt</option><option value="followUp">Queue</option></select></>}
      <button type="submit" disabled={!canSend} title={task?'Send now; Alt+Enter interrupts first':'Enter to send; Shift+Enter for a new line'}>Send</button></div>
    </form>
    {dragging&&<div className="file-drop" role="status">Drop files to attach</div>}
  </aside>;
}
