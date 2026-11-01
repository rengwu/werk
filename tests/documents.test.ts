import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Service} from '../src/backend/service.ts';
import {fictionalProfile,fixtureJob} from './fixtures/profile.ts';
import {validateGeneration} from '../src/backend/letters/generate.ts';
import {renderCv,latexEscape} from '../src/backend/cv/template.ts';
import {fictionalLetter} from './fixtures/letter.ts';

test('letter evidence validation and master CV escaping preserve supported claims',()=>{const p=fictionalProfile(),j=fixtureJob('letter');const generated=validateGeneration(fictionalLetter,p,j);assert.match(generated.body,/^Dear hiring team,/);assert.match(generated.body,/Best regards,\n\nAlex Example$/);assert.ok(generated.reviewNotes.length);assert.throws(()=>validateGeneration({...fictionalLetter,paragraphs:fictionalLetter.paragraphs.map((x,i)=>i?x:{...x,text:'I have 12 years of AI experience.'})},p,j),/unsupported number|numeric claim|tenure/);assert.throws(()=>validateGeneration({...fictionalLetter,paragraphs:fictionalLetter.paragraphs.map((x,i)=>i?x:{...x,evidenceIds:['nonexistent']})},p,j),/missing evidence/);p.basics.name='Alex & Example % \\input{private}';const source=renderCv(p);assert.ok(source.includes(latexEscape(p.basics.name)));assert.ok(!source.includes('\\input{private}'));assert.ok(source.includes('Example planner'));});
test('saving queues one letter; edits and restores append versions; failed CV compile preserves the PDF and source',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'werk-documents-'));const service=new Service({type:'init',dataDir:dir,version:'test',electron:'test',chromium:'test',system:'test',restartCount:0},()=>{});
 try{service.profiles.save(fictionalProfile(),0,'user','Fictional');const source=service.sources.sourceRecord(service.sources.list().find(s=>s.kind==='rss')!.id);service.jobs.ingest(source,fixtureJob('saved'));const id=service.jobs.list({view:'new'}).jobs[0].id;
 service.ai.infer=async()=>structuredClone(fictionalLetter) as never;
 service.jobs.status(id,'saved');service.jobs.status(id,'saved');await new Promise<void>(resolve=>setTimeout(resolve,30));assert.equal(service.letters.current(id)?.version,1);assert.equal(service.queue.list().filter(t=>t.kind==='cover_letter').length,1);
 const first=service.letters.current(id)!;service.letters.edit(id,first.body+'\nUser edit.',1);assert.throws(()=>service.letters.edit(id,'Stale',1),/changed/);service.letters.restore(id,1,2);assert.equal(service.letters.current(id)?.body,first.body);assert.equal(service.letters.current(id)?.version,3);
 const pdf=Buffer.from('%PDF-1.4\nfictional');service.cv.compiler=async()=>({pdf,diagnostics:[]});service.cv.generate(0);await service.cv.active;assert.deepEqual(Buffer.from(service.cv.pdf(1)),pdf);
 service.cv.compiler=async()=>{throw new Error('simulated compiler failure');};service.cv.edit('invalid source',1);await service.cv.active;assert.equal(service.cv.current()?.compileStatus,'failed');assert.equal(service.cv.current()?.source,'invalid source');assert.equal(service.cv.state().pdfVersion,1);assert.deepEqual(Buffer.from(service.cv.pdf(1)),pdf);service.cv.restore(1,2);await service.cv.active;assert.equal(service.cv.current()?.version,3);
 }finally{service.close();rmSync(dir,{recursive:true,force:true});}
});
