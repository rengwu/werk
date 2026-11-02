import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Service} from '../src/backend/service.ts';
import {normalizeRss} from '../src/backend/sources/discovery.ts';
import {collect} from '../src/backend/sources/connectors.ts';
import {rssSources} from '../src/backend/sources/catalog.ts';
import type {Source,IncomingJob} from '../src/backend/sources/types.ts';
import {sourceFeedFixtures} from './fixtures/source-feeds.ts';

test('expanded feeds preserve source attribution, locations, excerpt quality and escaped descriptions',async()=>{
  for(const fixture of sourceFeedFixtures){
    const source={...rssSources.find(s=>s.name===fixture.name)!,id:'fixture',checkpoint:{}} as Source;
    assert.ok(source.identifier,fixture.name);
    const jobs:IncomingJob[]=[];let requests=0;
    await collect(source,{requests:0,limit:1},job=>jobs.push(job),()=>{},async(url,ctx)=>{
      assert.equal(url,source.identifier);requests++;ctx.requests++;return fixture.xml;
    });
    assert.equal(requests,1);assert.equal(jobs.length,1,fixture.name);
    const job=jobs[0];
    for(const[key,value]of Object.entries(fixture.expected))assert.equal(job[key as keyof IncomingJob],value,`${fixture.name}: ${key}`);
    assert.match(job.description,/React/);assert.doesNotMatch(job.description,/<[a-z]|CDATA/);
    assert.equal(job.url,'https://example.com/jobs/feed?a=1&b=2');
    assert.ok(job.sourceItemId);
  }
});

test('missing feed metadata stays unknown and publishers are never treated as employers',()=>{
  for(const [host,description]of [['berlinstartupjobs.com','Summary without a location'],['startup.jobs','Build software for customers.'],['hasjob.co','An unstructured description']]){
    const job=normalizeRss(`<rss><channel><item><title>Engineer</title><link>https://example.com/job</link><dc:creator>Publisher</dc:creator><description>${description}</description></item></channel></rss>`,{identifier:`https://${host}/feed`} as Source)[0];
    assert.equal(job.company,'Not listed');assert.equal(job.location,'');
  }
});

test('catalog upgrades add the new feeds once and preserve disabled sources, cooldowns and custom boards',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'werk-source-upgrade-'));
  const init={type:'init' as const,dataDir:dir,version:'test',system:'test',electron:'test',chromium:'test',restartCount:0};
  let service=new Service(init,()=>{});
  try{
    const added=sourceFeedFixtures.map(f=>rssSources.find(s=>s.name===f.name)!);
    for(const source of added)service.store.db.prepare('DELETE FROM sources WHERE identifier=?').run(source.identifier);
    service.store.set('sourcesInitialized',true); // Old installations used this one-time flag.
    const old=service.sources.list().find(s=>s.name==='Remotive')!;
    service.sources.enable(old.id,false);
    service.store.db.prepare("UPDATE sources SET next_scan_at='2099-01-01T00:00:00Z',checkpoint='{\"_scans\":2}' WHERE id=?").run(old.id);
    await service.sources.add({kind:'greenhouse',value:'fictional-upgrade',name:'Custom board'});
    const before=service.store.db.prepare('SELECT * FROM sources WHERE id=?').get(old.id);
    await service.shutdown();service=new Service(init,()=>{});
    assert.equal(service.sources.list().length,51);
    assert.deepEqual(service.store.db.prepare('SELECT * FROM sources WHERE id=?').get(old.id),before);
    assert.ok(service.sources.list().some(s=>s.name==='Custom board'&&s.enabled));
    for(const source of added)assert.ok(service.sources.list().some(s=>s.identifier===source.identifier&&s.enabled));
    const moai=service.sources.list().find(s=>s.name==='MoAIJobs')!;service.sources.enable(moai.id,false);
    await service.shutdown();service=new Service(init,()=>{});
    assert.equal(service.sources.list().length,51);assert.equal(service.sources.list().find(s=>s.id===moai.id)!.enabled,false);
  }finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
});
