import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Service } from '../src/backend/service.ts';
import { fictionalProfile, fixtureJob } from './fixtures/profile.ts';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'werk-filters-'));
  const init = {type:'init' as const,dataDir:dir,version:'test',electron:'test',chromium:'test',system:'test',restartCount:0};
  const service = new Service(init, () => {});
  service.queue.closed = true;
  service.profiles.save(fictionalProfile(), 0, 'user', 'Fictional filter profile');
  const source = service.sources.sourceRecord(service.sources.list().find(s => s.kind === 'rss')!.id);
  const add = (id:string, location='Worldwide') => {
    assert.equal(service.jobs.ingest(source, fixtureJob(id, {company:`Example ${id}`,location})), true);
    return Number(service.store.db.prepare('SELECT id FROM jobs WHERE company=?').get(`Example ${id}`)!.id);
  };
  return {service,dir,init,source,add,close:()=>{service.close();rmSync(dir,{recursive:true,force:true});}};
}

test('sorting uses discovery time, supports stable pagination and retains independent Saved/Applied and Skipped views', () => {
  const s=setup();
  try {
    const {jobs,store,profiles}=s.service, oldest=s.add('old'), newest=s.add('new'), middle=s.add('middle');
    const update=store.db.prepare('UPDATE jobs SET first_seen_at=?,posted_at=?,match_score=? WHERE id=?');
    update.run('2026-01-01T00:00:00Z','2026-03-01T00:00:00Z',99,oldest);
    update.run('2026-03-01T00:00:00Z','2026-01-01T00:00:00Z',70,newest);
    update.run('2026-02-01T00:00:00Z',null,80,middle);
    const revision=profiles.get().revision;
    assert.deepEqual(jobs.list({view:'all',sort:'match'}).jobs.map(j=>j.id),[oldest,middle,newest]);
    assert.deepEqual(jobs.list({view:'all',sort:'discovered'}).jobs.map(j=>j.id),[newest,middle,oldest]);
    assert.deepEqual(jobs.list({view:'all',sort:'discovered',limit:1,offset:1}).jobs.map(j=>j.id),[middle]);
    jobs.status(oldest,'saved');jobs.status(newest,'saved');jobs.status(newest,'applied');jobs.status(middle,'skipped');
    store.db.prepare('UPDATE jobs SET saved_at=? WHERE id=?').run('2026-01-01T00:00:00Z',oldest);
    store.db.prepare('UPDATE jobs SET saved_at=? WHERE id=?').run('2026-02-01T00:00:00Z',newest);
    assert.deepEqual(jobs.list({view:'saved'}).jobs.map(j=>j.id),[newest,oldest]);
    assert.deepEqual(jobs.list({view:'saved',sort:'match'}).jobs.map(j=>j.id),[oldest,newest]);
    assert.deepEqual(jobs.list({view:'saved',savedStatus:'saved'}).jobs.map(j=>j.id),[oldest]);
    assert.deepEqual(jobs.list({view:'saved',savedStatus:'applied'}).jobs.map(j=>j.id),[newest]);
    assert.deepEqual(jobs.list({view:'skipped'}).jobs.map(j=>j.id),[middle]);
    jobs.status(middle,'new');assert.equal(jobs.list({view:'skipped'}).total,0);
    assert.deepEqual(jobs.list({view:'new'}).jobs.map(j=>j.id),[middle]);
    assert.equal(profiles.get().revision,revision);
  } finally {s.close();}
});

test('locations match any selected country, region, city or explicit coverage and compose with other filters', () => {
  const s=setup();
  try {
    const {jobs,store}=s.service;
    const malaysia=s.add('malaysia','Kuala Lumpur, Malaysia'),singapore=s.add('singapore','Singapore'),germany=s.add('germany','Berlin, Germany');
    const apac=s.add('apac','APAC'),world=s.add('world'),unspecified=s.add('unspecified','Remote'),unresolved=s.add('unresolved','Fictional Island');
    const ids=(locations:string[])=>jobs.list({view:'all',locations}).jobs.map(j=>j.id).sort((a,b)=>a-b);
    assert.deepEqual(ids(['country:MY']),[malaysia]);
    assert.deepEqual(ids(['country:MY','country:SG']),[malaysia,singapore]);
    assert.deepEqual(ids(['region:apac']),[malaysia,singapore,apac]);
    assert.deepEqual(ids(['region:emea']),[germany]);
    assert.deepEqual(ids(['kuala lumpur']),[malaysia]);
    assert.deepEqual(ids(['__worldwide__']),[world]);
    assert.deepEqual(ids(['__unspecified__']),[unspecified]);
    assert.deepEqual(ids(['__unresolved__']),[unresolved]);
    assert.deepEqual(ids(['country:MY','__worldwide__','__unspecified__']),[malaysia,world,unspecified]);
    assert.equal(jobs.list({view:'all',locations:['region:apac'],search:'singapore',arrangement:'remote',days:7}).total,1);
    store.db.prepare("UPDATE jobs SET posted_at='2000-01-01T00:00:00Z' WHERE id=?").run(singapore);
    assert.equal(jobs.list({view:'all',locations:['region:apac'],search:'singapore',days:7}).total,0);
    jobs.status(malaysia,'saved');jobs.status(singapore,'applied');
    assert.equal(jobs.list({view:'saved',savedStatus:'saved',locations:['country:MY','country:SG']}).total,1);
    assert.equal(jobs.list({view:'saved',savedStatus:'applied',locations:['country:MY']}).total,0);
    assert.ok(jobs.locations().some(o=>o.kind==='place'&&o.value==='kuala lumpur'));
    assert.ok(jobs.locations().some(o=>o.value==='__worldwide__'));
    assert.equal(jobs.list({view:'all',locations:["') OR 1=1 --"]}).total,0);
  } finally {s.close();}
});

test('location indexes follow source changes, deletions and backup restoration without changing the backup format', () => {
  const s=setup();
  try {
    const {jobs,backups,store}=s.service;
    const id=s.add('moving','Malaysia');
    jobs.ingest(s.source,fixtureJob('moving',{company:'Example moving',location:'Singapore'}));
    assert.equal(jobs.list({view:'all',locations:['country:MY']}).total,0);
    assert.equal(jobs.list({view:'all',locations:['country:SG']}).total,1);
    const bytes=backups.export().bytes;
    backups.restore(bytes);
    assert.equal(jobs.list({view:'all',locations:['country:SG']}).total,1);
    assert.notEqual(jobs.list({view:'all'}).jobs[0].id,id);
    store.db.exec('DELETE FROM jobs');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM job_locations').get()!.n,0);
  } finally {s.close();}
});

test('schema 6 upgrades rebuild location facets from existing jobs', () => {
  const s=setup();let reopened:Service|undefined;
  try {
    s.add('existing','Malaysia');
    s.service.store.db.exec('DROP TABLE job_locations; DROP INDEX jobs_discovered; PRAGMA user_version=6;');
    s.service.close();
    reopened=new Service(s.init,()=>{});reopened.queue.closed=true;
    assert.equal(reopened.diagnostics().schema,7);
    assert.equal(reopened.jobs.list({view:'all',locations:['country:MY']}).total,1);
    assert.equal(reopened.profiles.get().revision,1);
  } finally {reopened?.close();rmSync(s.dir,{recursive:true,force:true});}
});

test('filter RPC validates sorting, view and bounded selections', async () => {
  const s=setup();
  try {
    for(const input of [{view:'bogus'},{view:'new',sort:'posted'},{view:'new',savedStatus:'closed'},{view:'all',locations:Array(51).fill('country:MY')},{view:'all',offset:-1}])
      await assert.rejects(s.service.call('jobs.list',input as never));
    s.add('rpc','Malaysia');
    assert.equal((await s.service.call('jobs.list',{view:'all',sort:'discovered',locations:['country:MY']})).total,1);
    assert.ok((await s.service.call('jobs.locations',undefined)).some(o=>o.value==='country:MY'));
  } finally {s.close();}
});
