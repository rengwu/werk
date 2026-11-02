import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Store} from '../src/backend/db/store.ts';
import {Profiles} from '../src/backend/profile/store.ts';
import {fictionalProfile,fixtureJob} from './fixtures/profile.ts';
import {discoverySources} from '../src/backend/sources/catalog.ts';
import {sourceFeedFixtures} from './fixtures/source-feeds.ts';
const exe=process.env.WERK_EXE;if(!exe)throw new Error('Set WERK_EXE to the packaged test app.');
const dir=await mkdtemp(join(tmpdir(),'werk-discovery-smoke-')),output=resolve('smoke-output/discovery');await mkdir(output,{recursive:true});
const seed=new Store(dir),profiles=new Profiles(seed,()=>{});seed.transaction(()=>profiles.save(fictionalProfile(),0,'user','Fictional verification profile'));
// Keep the catalog present but disabled so this recorded scan is isolated.
for(const source of discoverySources)seed.db.prepare('INSERT INTO sources(kind,identifier,name,enabled,config) VALUES(?,?,?,0,?)').run(source.type,source.identifier,source.name,JSON.stringify({requestLimit:source.requestLimit,intervalHours:source.intervalHours}));
seed.db.prepare("INSERT INTO sources(kind,identifier,name,config) VALUES('greenhouse','fictional','Example board',?)").run(JSON.stringify({requestLimit:2,intervalHours:4}));seed.close();
const fixture=join(dir,'sources.json');await writeFile(fixture,JSON.stringify({'https://boards-api.greenhouse.io/v1/boards/fictional/jobs?content=true':{body:JSON.stringify({jobs:[['one','Frontend engineer'],['two','Software engineer'],['three','Backend engineer'],['unrelated','Mechanical engineer']].map(([id,title])=>({id,title,location:{name:'Remote · Worldwide'},absolute_url:`https://example.com/jobs/${id}`,content:fixtureJob(id).description+` Requisition: ${id}.`,first_published:new Date().toISOString()}))})},'https://www.moaijobs.com/ai-jobs.rss':{body:sourceFeedFixtures.find(f=>f.name==='MoAIJobs')!.xml}}));
const env={...process.env,WERK_DATA_DIR:dir,WERK_SOURCE_FIXTURES:fixture,WERK_FAKE_AI:'1',WERK_AI_FIXTURES:resolve('tests/fixtures/ai.json')} as Record<string,string>;delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:process.env.WERK_DEV_APP?['.']:[],env,timeout:20000});const result:{result:string;scenarios:string[];error?:string}={result:'Failed',scenarios:[]};
try{
  const page=await app.firstWindow();await page.getByRole('heading',{name:'Set up werk',exact:true}).waitFor();
  await page.getByRole('button',{name:'Scan now',exact:true}).click();await page.getByRole('tab',{name:'New (3)',exact:true}).waitFor();assert.equal(await page.locator('.job-row').count(),3);result.scenarios.push('A recorded company-board scan keeps three qualifying jobs and fingerprints an unrelated role');
  const savedTitle=(await page.locator('.job-row .job-title').first().textContent())!;await page.keyboard.press('j');await page.getByRole('heading',{name:savedTitle,exact:true}).waitFor();await page.keyboard.press('s');await page.getByRole('tab',{name:'New (2)',exact:true}).waitFor();await page.keyboard.press('x');await page.getByRole('tab',{name:'New (1)',exact:true}).waitFor();result.scenarios.push('J selects, S saves and X skips, selecting the next New job');
  await page.keyboard.press('/');assert.equal(await page.getByRole('searchbox',{name:'Search jobs'}).evaluate(el=>el===document.activeElement),true);await page.getByRole('searchbox',{name:'Search jobs'}).fill('nothing matches');await page.getByText('No matching jobs.',{exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('tab',{name:'All matches',exact:true}).click();await page.getByRole('searchbox',{name:'Search jobs'}).fill('calendar');await page.waitForFunction(()=>document.querySelectorAll('.job-row').length===3);result.scenarios.push('Slash focuses FTS search, typing does not trigger triage, Escape clears, and All matches retains saved/skipped jobs');
  await page.getByRole('button',{name:'Filters',exact:true}).click();await page.getByRole('combobox',{name:'Match level'}).selectOption('strong');await page.waitForFunction(()=>document.querySelectorAll('.job-row').length===2);await page.getByRole('combobox',{name:'Match level'}).selectOption('');await page.getByRole('searchbox',{name:'Search jobs'}).fill('');
  await page.locator('.job-row').filter({hasText:savedTitle}).click();await page.getByRole('tab',{name:'Notes',exact:true}).click();await page.getByRole('textbox',{name:'Job notes'}).fill('Fictional review note.');await page.locator('.job-notes [role=status]').filter({hasText:'Saved'}).waitFor();await page.getByRole('tab',{name:'Description',exact:true}).click();assert.ok(await page.locator('mark.matched').count()>0);result.scenarios.push('Filters narrow the current view, notes autosave and matched clauses are highlighted');
  await page.screenshot({path:join(output,'inbox.png')});
  await page.getByRole('button',{name:'Hide company',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.job-row').length===1);await page.getByRole('button',{name:/^Saved/}).click();await page.locator('.job-row').filter({hasText:savedTitle}).waitFor();result.scenarios.push('Hide company appends a criteria revision, removes unsaved matches and preserves the saved job');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Sources',exact:true}).click();await page.getByRole('cell',{name:'Example board',exact:true}).waitFor();assert.equal(await page.locator('.source-table tbody tr td').nth(1).textContent(),'1');assert.equal(await page.locator('.source-table tbody tr td').nth(2).textContent(),'1');await page.screenshot({path:join(output,'sources.png')});await page.getByRole('tab',{name:'General',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'Scan schedule'}).inputValue(),'0');await page.getByRole('combobox',{name:'Scan schedule'}).selectOption('12');result.scenarios.push('Source counters and cooldown are visible; manual scheduling can be changed');
  await page.getByRole('tab',{name:'Sources',exact:true}).click();
  for(const name of ['NoDesk · Engineering','Python Job Board','Hasjob','MoAIJobs'])await page.getByRole('checkbox',{name:`Enable ${name}`,exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Enable MoAIJobs',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('input[aria-label="Enable MoAIJobs"]')?.checked===true);
  await page.getByRole('button',{name:/^Inbox/}).click();await page.getByRole('button',{name:'Scan now',exact:true}).click();
  await page.getByRole('tab',{name:'New (1)',exact:true}).waitFor();
  await page.locator('.job-row').filter({hasText:'Example Studio'}).click();
  await page.getByRole('heading',{name:'Frontend engineer',exact:true}).waitFor();
  assert.ok(await page.locator('mark.matched').count()>0);
  result.scenarios.push('Expanded feeds appear in Settings; enabling MoAIJobs and scanning imports a matching role through its nested-CDATA description');
  result.result='Passed';
}catch(error){result.error=error instanceof Error?error.message:String(error);await(await app.firstWindow()).screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(join(output,'results.json'),JSON.stringify(result,null,2));await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});await app.close();await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify(result,null,2));
