import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Service } from '../src/backend/service.ts';

async function until(check:()=>boolean, timeout=15000) { const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('Timed out');await delay(20);} }
test('pi runs real local and network tools, repairs validation, streams, steers, interrupts, and restores the session', async () => {
  (globalThis as unknown as {WERK_TEST_BUILD:boolean}).WERK_TEST_BUILD=true;
  const dir=mkdtempSync(join(tmpdir(),'werk-pi-test-')),file=join(dir,'fictional.txt'),output=join(dir,'written.txt'),fixturePath=join(dir,'ai.json');
  const evidence='Alex Example builds TypeScript software.';writeFileSync(file,evidence);
  const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<h1>Fictional project</h1><p>Alex Example contributed a keyboard shortcut.</p>');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/project`;
  const action=(name:string,args:unknown)=>({name,argsJson:JSON.stringify(args)});
  const edit=(quote:string)=>action('edit_profile',{expectedRevision:0,edits:[{op:'set',path:'/basics/name',valueJson:'"Alex Example"',evidenceQuote:quote}]});
  const fixtures=[
    {when:'exercise tools',steps:[{actions:[action('read',{path:file})]},{actions:[edit('invented unsupported quote')]},{actions:[edit('Alex Example')]},{actions:[action('write',{path:output,content:'Written by pi'})]},{actions:[action('read_url',{url})]},{reply:'Finished with **verified evidence**.'}]},
    {when:'take a while',steps:[{delayMs:1500,reply:'First response.'}]},
    {when:'change direction',result:{reply:'Changed direction immediately after the current turn.'}},
    {when:'interrupt target',steps:[{delayMs:10000,reply:'This response must be stopped.'}]},
    {when:'new direction',result:{reply:'The interrupted request is replaced.'}},
    {when:'resume check',result:{reply:'Conversation restored.'}},
    {when:'simulate allowance',error:'Your ChatGPT subscription allowance is unavailable. Retry after it resets.'},
  ];writeFileSync(fixturePath,JSON.stringify(fixtures));
  process.env.WERK_FAKE_AI='1';process.env.WERK_AI_FIXTURES=fixturePath;process.env.WERK_BUNDLE_DIR=resolve('out');
  const init={type:'init' as const,dataDir:dir,version:'test',system:'test',electron:'test',chromium:'test',restartCount:0};
  let service=new Service(init,()=>{});
  const send=(text:string,mode:'steer'|'interrupt'|'followUp'='steer')=>service.assistant.send(text,[],{page:'Profile'},randomUUID(),mode);
  try {
    const first=await send('exercise tools');await until(()=>['done','failed','paused'].includes(service.queue.list().find(t=>t.id===first)!.state));
    assert.equal(service.queue.list().find(t=>t.id===first)?.state,'done',JSON.stringify(service.queue.list()));
    assert.equal(readFileSync(output,'utf8'),'Written by pi');assert.equal(service.profiles.get().basics.name,'Alex Example',JSON.stringify(service.assistant.state().messages.flatMap(m=>m.tools||[]),null,2));assert.equal(service.profiles.get().revision,1);
    const tools=service.assistant.state().messages.flatMap(m=>m.tools||[]);
    assert.ok(tools.some(t=>t.name==='edit_profile'&&t.state==='failed'&&t.output.includes('supporting quote')));
    assert.ok(tools.some(t=>t.name==='read_url'&&t.output.includes('keyboard shortcut')));
    assert.equal(service.assistant.state().messages.filter(m=>m.receipts.length).length,1);
    const a=await send('take a while');await until(()=>!!service.assistant.session?.isStreaming);
    const b=await send('change direction');assert.equal(service.queue.list().find(t=>t.id===b)?.state,'running');
    await until(()=>service.queue.list().find(t=>t.id===a)?.state==='done');assert.equal(service.queue.list().find(t=>t.id===b)?.state,'done');
    assert.ok(service.assistant.state().messages.some(m=>m.text.includes('Changed direction')));
    const c=await send('interrupt target');await until(()=>!!service.assistant.session?.isStreaming);
    const d=await send('new direction','interrupt');await until(()=>service.queue.list().find(t=>t.id===d)?.state==='done');
    assert.equal(service.queue.list().find(t=>t.id===c)?.state,'failed');assert.ok(!service.assistant.state().messages.some(m=>m.text.includes('must be stopped')));
    const sessionFile=service.assistant.session!.sessionManager.getSessionFile()!,count=service.assistant.session!.messages.length;
    service.close();service=new Service(init,()=>{});
    const e=await send('resume check');await until(()=>service.queue.list().find(t=>t.id===e)?.state==='done');
    assert.equal(service.assistant.session!.sessionManager.getSessionFile(),sessionFile);assert.ok(service.assistant.session!.messages.length>count);
    const f=await send('simulate allowance');await until(()=>service.queue.list().find(t=>t.id===f)?.state==='paused');assert.match(service.store.get('aiPause',''),/allowance/);
  } finally {await service.assistant.stop();service.close();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});delete process.env.WERK_FAKE_AI;delete process.env.WERK_AI_FIXTURES;}
});
