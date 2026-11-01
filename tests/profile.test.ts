import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/backend/db/store.ts';
import { Profiles } from '../src/backend/profile/store.ts';
import { emptyProfile,profileReadiness } from '../src/backend/profile/facts.ts';
import { applyProfileEdits } from '../src/backend/profile/edits.ts';
import { overlapHours,countryOverlaps } from '../src/backend/geo/overlap.ts';
import { ModelQueue } from '../src/backend/ai/queue.ts';
import { AiUnavailable } from '../src/backend/ai/runtime.ts';
import { isPublicAddress,publicUrl } from '../src/backend/http.ts';

test('profile starts empty, edits and restores append attributed revisions, conflicts leave facts untouched',()=>{
  const dir=mkdtempSync(join(tmpdir(),'werk-profile-')),store=new Store(dir),profiles=new Profiles(store,()=>{});
  try{
    assert.equal(profiles.get().revision,0);assert.equal(profiles.versions().length,0);
    const first=profiles.edit('basics',{...profiles.get().basics,name:'Alex Example'},0);
    assert.equal(first.revision,1);assert.equal(first.basics.sources.length,1);
    profiles.edit('basics',{...first.basics,name:'Taylor Example'},1);
    assert.throws(()=>profiles.edit('basics',first.basics,1),/changed/);
    assert.equal(profiles.restore(1,2).basics.name,'Alex Example');
    assert.deepEqual(profiles.versions().map(v=>v.revision),[3,2,1]);
    assert.equal(profiles.versions()[0].changedBy,'restore');
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('readiness needs useful background and preferences, not citizenship or a visa answer',()=>{
  const profile=emptyProfile();assert.equal(profileReadiness(profile).ready,false);
  profile.basics.name='Alex Example';profile.basics.location='Kuala Lumpur, Malaysia';profile.basics.summary='I build accessible TypeScript applications and contribute to open source projects.';profile.criteria.targetRoles=['Software engineer'];profile.criteria.arrangements=['remote'];
  assert.equal(profileReadiness(profile).ready,true);assert.equal(profile.basics.citizenship,'');
});
test('assistant profile patches require exact evidence and reject prototype paths and broad replacement',()=>{
  const profile=emptyProfile(),evidence=[{id:'chat:1',text:'My name is Alex Example.'}];
  const edit={op:'set',path:'/basics/name',valueJson:'"Alex Example"',evidenceQuote:'My name is Alex Example.'};
  assert.equal(applyProfileEdits(profile,[edit],evidence).basics.name,'Alex Example');
  assert.throws(()=>applyProfileEdits(profile,[{...edit,evidenceQuote:'I have ten years of AI experience.'}],evidence),/supporting quote/);
  for(const path of ['/basics','/__proto__/polluted','/facts/constructor','/revision/value']) assert.throws(()=>applyProfileEdits(profile,[{...edit,path}],evidence));
  assert.equal(profile.basics.name,'');
});
test('country overlap uses local working hours, half hour offsets and unknown-safe results',()=>{
  assert.equal(overlapHours(8,8),9);assert.equal(overlapHours(8,0),1);assert.equal(overlapHours(8,5.5),6.5);
  assert.equal(overlapHours(8,8,'10:00','16:00'),6);
  assert.equal(overlapHours(8,-4,'21:00','06:00'),9);
  const criteria=emptyProfile().criteria;criteria.timezone='Asia/Kuala_Lumpur';assert.equal(countryOverlaps(criteria).get('MY'),9);
});
test('model work serializes, pauses on allowance errors and retains later queued work',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'werk-queue-')),store=new Store(dir);
  let notified=()=>{};const queue=new ModelQueue(store,()=>notified());let running=0,max=0,fail=true;
  queue.handlers.cover_letter=async()=>{running++;max=Math.max(max,running);await new Promise(resolve=>setTimeout(resolve,5));running--;if(fail){fail=false;throw new AiUnavailable('Allowance unavailable.');}};
  const waitFor=(condition:()=>boolean)=>new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Queue timeout')),2000);notified=()=>{if(condition()){clearTimeout(timeout);resolve();}};notified();});
  try{
    const a=queue.enqueue('cover_letter','1',{},'a'),b=queue.enqueue('cover_letter','2',{},'b');queue.kick();
    await waitFor(()=>queue.list().some(t=>t.state==='paused'));
    assert.equal(queue.list().find(t=>t.id===b)?.state,'queued');assert.equal(max,1);
    const done=waitFor(()=>queue.list().every(t=>t.state==='done'));queue.retry(a);await done;assert.equal(max,1);
  }finally{queue.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
test('public reads reject local addresses and non-web capabilities',async()=>{
  for(const address of ['127.0.0.1','::1','169.254.169.254','192.168.1.1','10.0.0.1','::ffff:127.0.0.1'])assert.equal(isPublicAddress(address),false);
  assert.equal(isPublicAddress('8.8.8.8'),true);
  for(const url of ['file:///etc/passwd','http://127.0.0.1','https://user:pass@example.com','https://example.com:3000'])await assert.rejects(publicUrl(url));
});
