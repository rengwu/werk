import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { call } from './rpc.ts';
import type { AssistantContext, Attachment } from '../shared/ai.ts';

export function AssistantPane({open,onClose,context}:{open:boolean;onClose:()=>void;context:AssistantContext}) {
  const {data}=useQuery({queryKey:['assistant'],queryFn:()=>call('assistant.get',undefined)});
  const [text,setText]=useState(''),[files,setFiles]=useState<Attachment[]>([]),[error,setError]=useState(''),[uploading,setUploading]=useState(false);
  const composer=useRef<HTMLTextAreaElement>(null),scroller=useRef<HTMLDivElement>(null),picker=useRef<HTMLInputElement>(null);
  const task=data?.tasks.find(t=>['queued','running','paused'].includes(t.state));
  const failed=data?.tasks.find(t=>t.state==='failed');
  const send=useMutation({mutationFn:()=>call('assistant.send',{text,attachments:files.map(f=>f.id),context,clientId:crypto.randomUUID()}),onSuccess:()=>{setText('');setFiles([]);setError('');},onError:e=>setError(e.message)});
  useEffect(()=>{if(open)composer.current?.focus();},[open]);
  useEffect(()=>{if(scroller.current)scroller.current.scrollTop=scroller.current.scrollHeight;},[data?.messages.length]);
  useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,onClose]);
  async function attach(list:FileList|File[]) {
    setUploading(true);setError('');
    try { for(const file of Array.from(list)){const saved=await call('attachments.add',{name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});setFiles(old=>[...old,saved]);} }
    catch(e){setError(e instanceof Error?e.message:'Could not attach file.');}finally{setUploading(false);}
  }
  return <aside className={`assistant-pane ${open?'open':''}`} aria-label="Assistant" hidden={!open}>
    <header><b>Assistant</b><span className="grow"/><button onClick={async()=>{try{await call('assistant.new',undefined);setText('');setFiles([]);setError('');}catch(e){setError(String(e));}}}>New chat</button><button aria-label="Close assistant" onClick={onClose}>×</button></header>
    <div className="assistant-context">{context.page}{context.jobId?` · Job ${context.jobId}`:''}{context.dirty?' · Unsaved edits':''}</div>
    <div className="messages" ref={scroller} role="log" aria-live="polite">
      {!data?.messages.length&&<p className="muted">Attach your CV or describe your experience. I can help build your profile.</p>}
      {data?.messages.map(message=><article className={`message ${message.role}`} key={message.id}><span className="message-role">{message.role==='user'?'You':'Assistant'}</span><div className="message-text">{message.text}</div>{message.attachments.map(a=><span className="chip" key={a.id}>{a.name}</span>)}{message.receipts.map((r,i)=><p className="receipt" key={i}>{r.record} saved · version {r.version}{r.detail?` · ${r.detail}`:''}</p>)}</article>)}
      {task&&<div role="status" className="task-state">{task.state==='running'?'Thinking…':task.state==='queued'?'Queued':task.error}<div className="actions">{task.state==='paused'&&<button onClick={()=>void call('tasks.retry',{id:task.id}).catch(e=>setError(e.message))}>Retry</button>}<button onClick={()=>void call('tasks.stop',{id:task.id})}>Stop</button></div></div>}
      {!task&&failed&&<div role="alert">{failed.error}<button onClick={()=>void call('tasks.retry',{id:failed.id}).catch(e=>setError(e.message))}>Retry</button></div>}
    </div>
    <form className="composer" onSubmit={e=>{e.preventDefault();if(text.trim()&&!task&&!uploading)send.mutate();}}>
      {files.length>0&&<div className="attachments">{files.map(f=><span className="chip" key={f.id}>{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={async()=>{await call('attachments.remove',{id:f.id});setFiles(old=>old.filter(a=>a.id!==f.id));}}>×</button></span>)}</div>}
      <textarea ref={composer} aria-label="Message assistant" value={text} onChange={e=>setText(e.target.value)} placeholder="Message assistant…" rows={3} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(text.trim()&&!task&&!uploading)send.mutate();}}} onPaste={e=>{const images=Array.from(e.clipboardData.files).filter(f=>f.type.startsWith('image/'));if(images.length){e.preventDefault();void attach(images);}}}/>
      {error&&<p role="alert">{error}</p>}<div className="actions"><input ref={picker} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,.json,.tex,.png,.jpg,.jpeg,.webp" onChange={e=>{if(e.target.files)void attach(e.target.files);e.target.value='';}}/><button type="button" disabled={uploading} onClick={()=>picker.current?.click()}>{uploading?'Attaching…':'Attach files'}</button><span className="grow"/><button type="submit" disabled={!text.trim()||!!task||uploading||send.isPending}>Send</button></div>
    </form>
  </aside>;
}
