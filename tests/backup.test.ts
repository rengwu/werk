import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {zipSync,unzipSync} from 'fflate';
import {Service} from '../src/backend/service.ts';
import {fictionalProfile,fixtureJob} from './fixtures/profile.ts';
import {createArchive,readArchive} from '../src/backend/backup/archive.ts';
const init=(dir:string)=>({type:'init' as const,dataDir:dir,version:'test',electron:'test',chromium:'test',system:'test',restartCount:0});
function app(){const dir=mkdtempSync(join(tmpdir(),'werk-backup-'));const service=new Service(init(dir),()=>{});service.queue.closed=true;return {dir,service,close(){service.close();rmSync(dir,{recursive:true,force:true});}};}
async function seed(s:Service){
  s.profiles.save(fictionalProfile(),0,'user','Fictional profile');const source=s.sources.sourceRecord(s.sources.list().find(s=>s.kind==='rss')!.id);
  s.jobs.ingest(source,fixtureJob('backup'));const id=s.jobs.list({view:'new'}).jobs[0].id;s.jobs.status(id,'saved');s.jobs.notes(id,'Reviewed — résumé');
  s.letters.edit(id,'First letter',0);s.letters.edit(id,'Latest letter — café',1);
  s.cv.compiler=async()=>({pdf:Buffer.from('%PDF-1.4\nfictional'),diagnostics:[]});s.cv.generate(0);await s.cv.active;
  s.store.db.prepare("INSERT INTO assistant_messages(chat_id,role,content,created_at) VALUES(?,'user',?,?)").run(s.assistant.chatId(),JSON.stringify({text:'private chat sentinel'}),new Date().toISOString());
  return {id,source};
}
test('backup restores latest content, preserves configuration/auth, remaps stale editors and keeps imported evidence across refresh/reopen',async()=>{
 const origin=app(),target=app();
 try{
  const {id:oldId,source}=await seed(origin.service);const s=target.service;await seed(s);
  s.store.set('appearance','dark');s.store.set('scanInterval',12);s.store.set('scanSentinel','keep');s.sources.enable(s.sources.list()[0].id,false);writeFileSync(join(target.dir,'credential-sentinel'),'keep');
  const config=s.sources.list(),archive=origin.service.backups.export(),files=readArchive(archive.bytes),text=files['data.json'].toString();
  assert.ok(!text.includes('private chat sentinel'));assert.ok(!text.includes('First letter'));assert.equal(JSON.parse(text).letters.length,1);assert.ok(files['cv.pdf']);assert.equal(JSON.parse(text).jobs.length,1);
  const beforeProfile=s.profiles.get().revision,beforeCv=s.cv.current()!.version;const result=s.backups.restore(archive.bytes);assert.deepEqual(result,{jobs:1,letters:1});
  assert.equal(s.settings().appearance,'dark');assert.equal(s.settings().scanInterval,12);assert.equal(s.store.get('scanSentinel',''),'keep');assert.equal(readFileSync(join(target.dir,'credential-sentinel'),'utf8'),'keep');assert.deepEqual(s.sources.list().map(x=>({id:x.id,enabled:x.enabled})),config.map(x=>({id:x.id,enabled:x.enabled})));
  assert.equal(s.queue.list().length,0);assert.equal(s.assistant.state().messages.length,0);assert.equal(s.profiles.versions().length,1);assert.ok(s.profiles.get().revision>beforeProfile);assert.ok(s.cv.current()!.version>beforeCv);assert.equal(s.cv.versions().length,1);
  const job=s.jobs.list({view:'saved'}).jobs[0];assert.notEqual(job.id,oldId);assert.equal(job.notes,'Reviewed — résumé');assert.equal(job.sources.length,1);assert.equal(s.letters.current(job.id)!.body,'Latest letter — café');assert.equal(s.letters.state(job.id).versions.length,1);
  assert.throws(()=>s.jobs.notes(oldId,'stale'),/not found/);assert.throws(()=>s.profiles.edit('basics',s.profiles.get().basics,beforeProfile),/changed/);assert.throws(()=>s.cv.save('stale',beforeCv),/changed/);
  assert.deepEqual(Buffer.from(s.cv.pdf(s.cv.current()!.version)),files['cv.pdf']);assert.equal(readdirSync(s.cv.directory).filter(f=>f.endsWith('.pdf')).length,1);
  assert.equal(s.store.db.prepare('SELECT count(*) n FROM job_listings').get()!.n,0);assert.equal(s.store.db.prepare('SELECT count(*) n FROM imported_listings').get()!.n,1);
  const live=s.sources.sourceRecord(Number(source.id));s.jobs.ingest(live,fixtureJob('backup'));assert.equal(s.jobs.get(job.id).sources.length,1);assert.equal(s.store.db.prepare('SELECT count(*) n FROM imported_listings').get()!.n,0);
  const second=s.backups.export();assert.equal(JSON.parse(readArchive(second.bytes)['data.json'].toString()).listings.length,1);
  s.close();const reopened=new Service(init(target.dir),()=>{});target.service=reopened;assert.equal(reopened.jobs.list({view:'saved'}).jobs[0].notes,'Reviewed — résumé');assert.equal(reopened.queue.list().length,0);reopened.close();
 }finally{origin.close();try{target.service.close();}catch{}rmSync(target.dir,{recursive:true,force:true});}
});
test('damaged archives, invalid relations, active work and transaction errors leave existing records unchanged',async()=>{
 const fixture=app();const s=fixture.service;
 try{
  await seed(s);const archive=s.backups.export(),files=readArchive(archive.bytes),before=s.profiles.get(),jobs=s.jobs.list({view:'saved'}),pdf=s.cv.pdf(1);
  const damaged=unzipSync(archive.bytes);damaged['data.json'][20]^=1;assert.throws(()=>s.backups.restore(zipSync(damaged)),/damaged/);
  assert.throws(()=>s.backups.restore(zipSync({...unzipSync(archive.bytes),'../escape':new Uint8Array([1])})),/unexpected|readable/);
  const invalid=JSON.parse(files['data.json'].toString());invalid.letters[0].job_id=99999;assert.throws(()=>s.backups.restore(createArchive({...files,'data.json':Buffer.from(JSON.stringify(invalid))}).bytes),/missing job/);
  s.sources.running=true;assert.throws(()=>s.backups.restore(archive.bytes),/Work is still running/);s.sources.running=false;
  s.activeEdits=1;assert.throws(()=>s.backups.restore(archive.bytes),/Work is still running/);s.activeEdits=0;
  s.store.db.exec("CREATE TRIGGER reject_import BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT,'injected restore failure'); END");assert.throws(()=>s.backups.restore(archive.bytes),/injected restore failure/);s.store.db.exec('DROP TRIGGER reject_import');
  assert.deepEqual(s.profiles.get(),before);assert.deepEqual(s.jobs.list({view:'saved'}),jobs);assert.deepEqual(s.cv.pdf(1),pdf);assert.equal(readdirSync(s.cv.directory).filter(f=>f.endsWith('.pdf')).length,1);
  const bomb=Buffer.from(archive.bytes),central=bomb.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bomb.writeUInt32LE(0xffffffff,central+24);assert.throws(()=>s.backups.restore(bomb),/size limit/);
  const encrypted=Buffer.from(archive.bytes);encrypted.writeUInt16LE(1,central+8);assert.throws(()=>s.backups.restore(encrypted),/readable/);
  const duplicate=Buffer.from(zipSync({'data.json':Buffer.from('{}'),'dada.json':Buffer.from('{}'),'manifest.json':Buffer.from('{}')}));
  for(let i=0;i<duplicate.length-9;i++)if(duplicate.subarray(i,i+9).toString()==='dada.json')duplicate.write('data.json',i);
  assert.throws(()=>readArchive(duplicate),/duplicate/);
  const symlink=Buffer.from(archive.bytes);symlink.writeUInt32LE((0o120777<<16)>>>0,central+38);assert.throws(()=>readArchive(symlink),/unsafe/);
  const understated=Buffer.from(archive.bytes);understated.writeUInt32LE(1,central+24);const local=understated.readUInt32LE(central+42);understated.writeUInt32LE(1,local+22);assert.throws(()=>readArchive(understated),/invalid size|damaged|too large/);

 }finally{fixture.close();}
});
test('empty and failed-CV backups never export an unrelated PDF or resurrect old history',async()=>{
 const origin=app(),target=app();
 try{
  const empty=origin.service.backups.export();await seed(target.service);target.service.backups.restore(empty.bytes);assert.equal(target.service.jobs.list({view:'saved'}).total,0);assert.equal(target.service.cv.current(),null);assert.equal(target.service.profiles.get().basics.name,'');assert.equal(target.service.queue.list().length,0);
  await seed(origin.service);origin.service.cv.compiler=async()=>{throw Error('simulated');};origin.service.cv.edit('invalid source',1);await origin.service.cv.active;
  const archive=origin.service.backups.export(),files=readArchive(archive.bytes);assert.equal(files['cv.pdf'],undefined);assert.equal(files['cv.tex'].toString(),'invalid source');target.service.backups.restore(archive.bytes);assert.equal(target.service.cv.state().pdfVersion,null);
 }finally{origin.close();target.close();}
});
