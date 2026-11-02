import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Service } from '../src/backend/service.ts';
import { fictionalProfile, fixtureJob } from './fixtures/profile.ts';
import { resetMarker } from '../src/main/reset.ts';

const exe = process.env.WERK_EXE;
if (!exe) throw new Error('Set WERK_EXE to the fixture package.');
const root = await mkdtemp(join(tmpdir(), 'werk-reset-smoke-'));
const dir = join(root, 'app'), output = resolve('smoke-output/reset');
await mkdir(dir); await mkdir(output, { recursive: true });
const original = join(root, 'original.md'), exported = join(dir, 'export.zip');
await writeFile(original, 'Original fictional evidence'); await writeFile(exported, 'Exported backup');
const service = new Service({type:'init',dataDir:dir,version:'test',system:'test',electron:'test',chromium:'test',restartCount:0}, () => {});
service.queue.closed = true;
service.profiles.save(fictionalProfile(), 0, 'user', 'Fictional profile');
service.store.set('firstScanCompleted', true); service.store.set('appearance', 'dark'); service.sources.schedule(12);
const source = service.sources.sourceRecord(service.sources.list().find(s => s.kind === 'rss')!.id);
service.jobs.ingest(source, fixtureJob('reset')); const id = service.jobs.list({view:'new'}).jobs[0].id;
service.jobs.status(id, 'saved'); service.letters.edit(id, 'Fictional letter to erase.', 0);
service.cv.save('Fictional CV source to erase.', 0);
await writeFile(join(dir, 'cv', '1.pdf'), 'Fictional PDF to erase.');
const attachment = await service.assistant.attachments.add(service.assistant.chatId(), 'original.md', new TextEncoder().encode('Copied fictional evidence'));
service.assistant.send('Fictional conversation to erase.', [attachment.id], {page:'Profile'}, randomUUID());
service.store.set('aiPause', 'Paused fixture');
await service.sources.add({kind:'greenhouse',value:'fictional-reset-board'});
await service.ai.auth.credentials.modify('openai', async () => ({type:'oauth',access:'fictional-access',refresh:'fictional-refresh',expires:4102444800000}));
await service.shutdown();
await mkdir(join(dir, 'pi', 'sessions'), {recursive:true}); await writeFile(join(dir, 'pi', 'sessions', 'old.jsonl'), 'Fictional session');
await mkdir(join(dir, 'logs'), {recursive:true}); await writeFile(join(dir, 'logs', 'old.log'), 'Fictional log');

let app: ElectronApplication | undefined;
const results: { result:string; scenarios:string[]; error?:string } = {result:'Failed',scenarios:[]};
async function launch(fake = false, fixtures?: string) {
  const env = {...process.env,WERK_DATA_DIR:dir,WERK_RELEASES_URL:'http://127.0.0.1:9/none'} as Record<string,string>;
  delete env.ELECTRON_RUN_AS_NODE; delete env.WERK_FAKE_AI; delete env.WERK_AI_FIXTURES;
  if (fake) { env.WERK_FAKE_AI='1'; env.WERK_AI_FIXTURES=fixtures!; }
  app = await electron.launch({executablePath:exe!,args:process.env.WERK_DEV_APP?['.']:[],env,timeout:20000});
  const page = await app.firstWindow(); page.setDefaultTimeout(20000); return page;
}
async function settings(page: Page) {
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('tab',{name:'General',exact:true}).click();
}
async function respond(response: number, failClear = false) {
  await app!.evaluate(({dialog,session},{response,failClear}) => {
    const state = globalThis as typeof globalThis & { resetDialogs: unknown[] };
    state.resetDialogs=[];
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args.at(-1) as {message:string}; state.resetDialogs.push(options);
      return {response:options.message==='Factory reset could not finish.'?1:response,checkboxChecked:false};
    }) as typeof dialog.showMessageBox;
    if (failClear) session.defaultSession.clearData = async () => { throw new Error('Injected storage failure'); };
  }, {response,failClear});
}
async function reset(page: Page) {
  const opened = app!.waitForEvent('window');
  await page.getByRole('button',{name:'Reset werk',exact:true}).click();
  const fresh = await opened; fresh.setDefaultTimeout(20000);
  await fresh.getByRole('heading',{name:'Set up werk',exact:true}).waitFor(); return fresh;
}
function records() {
  const db = new DatabaseSync(join(dir,'werk.db'), {readOnly:true});
  try {
    const counts = Object.fromEntries(['profile_versions','jobs','cover_letter_versions','cv_versions','assistant_messages','attachments','tasks'].map(table=>[table,Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n)]));
    const sources = db.prepare('SELECT count(*) AS n,sum(enabled) AS enabled FROM sources').get()!;
    return {counts,sources:{total:Number(sources.n),enabled:Number(sources.enabled)}};
  } finally { db.close(); }
}
async function freshState(page: Page) {
  await page.getByRole('heading',{name:'Set up werk',exact:true}).waitFor();
  // Setup renders before its queries finish. Wait for an actual backend reply
  // before opening SQLite, especially on slower packaged CI launches.
  await settings(page); await page.getByRole('tab',{name:'Diagnostics',exact:true}).click();
  assert.equal(await page.getByTestId('diagnostic-backend').textContent(),'running');
  assert.equal(await page.evaluate(()=>localStorage.getItem('reset-probe')),null);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('werk:backup-restored')),null);
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('Draft to erase'))),false);
  for (const count of Object.values(records().counts)) assert.equal(count,0);
  assert.deepEqual(records().sources,{total:50,enabled:30});
  await assert.rejects(access(join(dir,'pi-auth','credentials.json')));
  for (const file of ['pi/sessions/old.jsonl','cv/1.pdf','logs/old.log',resetMarker]) await assert.rejects(access(join(dir,file)));
  assert.equal(await readFile(original,'utf8'),'Original fictional evidence');
  assert.equal(await readFile(exported,'utf8'),'Exported backup');
  assert.equal((await app!.evaluate(({session})=>session.defaultSession.cookies.get({name:'reset-probe'}))).length,0);
  await settings(page);
  assert.equal(await page.getByRole('combobox',{name:'Appearance'}).inputValue(),'system');
  assert.equal(await page.getByRole('combobox',{name:'Scan schedule'}).inputValue(),'0');
  await page.getByRole('tab',{name:'AI',exact:true}).click();
  await page.getByText('Not connected',{exact:true}).waitFor();
  await page.getByText('No queued work.',{exact:true}).waitFor();
}
try {
  let page = await launch(); await settings(page);
  await page.getByRole('tab',{name:'AI',exact:true}).click(); await page.getByText('Connected',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'General',exact:true}).click();
  await page.getByRole('button',{name:'Open assistant',exact:true}).click();
  await page.getByRole('textbox',{name:'Message assistant'}).fill('Draft to erase'); await page.keyboard.press('Escape');
  await page.evaluate(()=>{localStorage.setItem('reset-probe','old');sessionStorage.setItem('werk:backup-restored','1');});
  await app!.evaluate(({session})=>session.defaultSession.cookies.set({url:'https://fixture.invalid',name:'reset-probe',value:'old'}));
  await page.screenshot({path:join(output,'settings.png')});
  const before=records(); await respond(0);
  await page.getByRole('button',{name:'Reset werk',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Waiting for confirmation or reset…'}).waitFor({state:'hidden'});
  const dialogs = await app!.evaluate(()=>(globalThis as unknown as {resetDialogs:Array<{message:string;detail:string;buttons:string[];defaultId:number;cancelId:number}>}).resetDialogs);
  assert.equal(dialogs[0].message,'Factory reset werk?');assert.equal(dialogs[0].defaultId,0);assert.equal(dialogs[0].cancelId,0);assert.deepEqual(dialogs[0].buttons,['Cancel','Reset werk']);assert.match(dialogs[0].detail,/ChatGPT connection/);
  assert.deepEqual(records(),before);await access(join(dir,'pi-auth','credentials.json'));await assert.rejects(access(join(dir,resetMarker)));
  results.scenarios.push('Settings exposes factory reset; native confirmation defaults to Cancel; cancellation preserves records and sign-in');
  await respond(1); page=await reset(page); await freshState(page);
  results.scenarios.push('Confirmed reset clears records, copied files, credentials, drafts, cookies, logs and custom settings/sources; originals and exports survive');
  await page.getByRole('button',{name:'Inbox',exact:true}).click();await page.screenshot({path:join(output,'fresh.png')});
  await app!.close(); app=undefined; page=await launch();await freshState(page);
  results.scenarios.push('Fresh setup, sign-out and defaults persist after quitting and reopening');

  await settings(page); await page.getByRole('combobox',{name:'Appearance'}).selectOption('dark');
  await mkdir(join(dir,'attachments'),{recursive:true});await writeFile(join(dir,'attachments','recovery.txt'),'Pending removal');
  await respond(1,true);const closed=app!.waitForEvent('close');await page.getByRole('button',{name:'Reset werk',exact:true}).click();await closed;app=undefined;
  await access(join(dir,resetMarker));await access(join(dir,'attachments','recovery.txt'));
  page=await launch();await freshState(page);await assert.rejects(access(join(dir,'attachments','recovery.txt')));
  results.scenarios.push('Storage failure leaves a pending reset; next launch completes it before opening the backend or old UI');
  await app!.close();app=undefined;

  for(const name of ['werk.db','werk.db-wal','werk.db-shm'])await rm(join(dir,name),{force:true,maxRetries:3,retryDelay:100});
  await writeFile(join(dir,'werk.db'),'Not a SQLite database');
  page=await launch();await page.getByText('The backend could not restart.',{exact:true}).waitFor();
  await respond(1);page=await reset(page);await freshState(page);
  results.scenarios.push('Factory reset remains available after a corrupt database stops the backend and restores a working first-run app');
  await app!.close();app=undefined;

  const late=join(root,'late-shell-write.txt'),fixtures=join(root,'ai.json');
  const command=process.platform==='win32'?`Start-Sleep -Seconds 8; [IO.File]::WriteAllText('${late.replaceAll("'","''")}','late')`:`sleep 8; printf late > '${late.replaceAll("'", "'\\''")}'`;
  await writeFile(fixtures,JSON.stringify([{when:'reset running shell',steps:[{actions:[{name:process.platform==='win32'?'powershell':'bash',argsJson:JSON.stringify({command,timeout:20})}]},{reply:'Command finished.'}]}]));
  page=await launch(true,fixtures);await page.getByRole('button',{name:'Open assistant',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Message assistant'}).fill('reset running shell');await page.getByRole('button',{name:'Send',exact:true}).click();await page.locator('.tool-call.running').waitFor();
  await page.keyboard.press('Escape');await settings(page);await respond(1);page=await reset(page);
  await page.waitForTimeout(9000);await assert.rejects(access(late));assert.equal(records().counts.tasks,0);assert.equal(records().counts.assistant_messages,0);
  results.scenarios.push('Reset aborts a real running pi shell command before its delayed write and prevents old work from returning');
  results.result='Passed';
} catch(error) {
  results.error=error instanceof Error?error.message:String(error);
  const page=app?.windows()[0];if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;
} finally {
  await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));
  if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});await app.close().catch(()=>{});}
  await rm(root,{recursive:true,force:true});
}
console.log(JSON.stringify(results,null,2));
