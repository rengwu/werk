import { _electron as electron } from 'playwright-core';
import { AxeBuilder } from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Service } from '../src/backend/service.ts';
import { fictionalProfile, fixtureJob } from './fixtures/profile.ts';

const exe=process.env.WERK_EXE;if(!exe)throw new Error('Set WERK_EXE to the packaged test app.');
const dir=await mkdtemp(join(tmpdir(),'werk-filter-smoke-')),output=resolve('smoke-output/job-filters');await mkdir(output,{recursive:true});
const service=new Service({type:'init',dataDir:dir,version:'test',system:'test',electron:'test',chromium:'test',restartCount:0},()=>{});
service.queue.closed=true;service.profiles.save(fictionalProfile(),0,'user','Fictional filter verification');service.store.set('firstScanCompleted',true);
service.store.db.exec('UPDATE sources SET enabled=0');
const source=service.sources.sourceRecord(service.sources.list().find(s=>s.kind==='rss')!.id);
const fixtures: [string,string,number,string][]=[
  ['Malaysia','Kuala Lumpur, Malaysia',99,'2026-01-01'],['Singapore','Singapore',70,'2026-03-01'],
  ['Germany','Berlin, Germany',80,'2026-02-01'],['APAC','APAC',65,'2026-01-04'],
  ['Worldwide','Worldwide',90,'2026-01-05'],['Unspecified','Remote',75,'2026-01-06'],
  ['Unresolved','Fictional Island',75,'2026-01-07'],['Saved','Malaysia',85,'2026-01-08'],['Applied','Worldwide',85,'2026-01-09'],
];
for(const [name,location,score,discovered] of fixtures) {
  const item=fixtureJob(name,{company:`Example ${name}`,location});service.jobs.ingest(source,item);
  const id=Number(service.store.db.prepare('SELECT id FROM jobs WHERE company=?').get(item.company)!.id);
  service.store.db.prepare('UPDATE jobs SET match_score=?,first_seen_at=? WHERE id=?').run(Number(score),`${discovered}T00:00:00Z`,id);
  if(name==='Saved'||name==='Applied') {
    service.jobs.status(id,'saved');service.letters.edit(id,'Dear hiring team,\n\nFictional letter for filter verification.\n\nAlex Example',0);
    if(name==='Applied')service.jobs.status(id,'applied');
  }
}
service.store.db.exec('DELETE FROM tasks');service.close();
const env={...process.env,WERK_DATA_DIR:dir,WERK_FAKE_AI:'1',WERK_AI_FIXTURES:resolve('tests/fixtures/ai.json')} as Record<string,string>;delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,env,timeout:20000});
const result:{result:string;scenarios:string[];accessibility:unknown[];error?:string}={result:'Failed',scenarios:[],accessibility:[]};
try {
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  const count=async(expected:number)=>page.waitForFunction(n=>document.querySelectorAll('.job-row').length===n,expected);
  const row=(name:string)=>page.locator('.job-row').filter({hasText:`Example ${name} ·`});
  const tab=(name:string)=>page.getByRole('tablist',{name:'Inbox',exact:true}).getByRole('tab',{name,exact:true});
  const filters=()=>page.getByRole('button',{name:/^Filters(?: \(\d+\))?$/});
  const locations=()=>page.locator('summary[aria-label="Locations"]');
  const locationSearch=()=>page.getByRole('searchbox',{name:'Search locations'});
  const selectLocation=async(name:string)=>{await locationSearch().fill(name);await page.getByRole('checkbox',{name,exact:true}).check();};
  await tab('New (7)').waitFor();await count(7);
  assert.match(await page.locator('.job-row').first().innerText(),/Example Malaysia/);
  await page.getByRole('combobox',{name:'Sort jobs'}).selectOption('discovered');
  await page.waitForFunction(()=>document.querySelector('.job-row')?.textContent?.includes('Example Singapore'));
  result.scenarios.push('Inbox defaults to best match; Recently discovered puts the newest discovery first');

  await row('Singapore').click();await page.keyboard.press('x');await tab('New (6)').waitFor();
  await tab('Skipped').click();await count(1);await row('Singapore').click();
  await page.locator('.job-detail').getByRole('button',{name:'Move back to New',exact:true}).click();
  await page.getByText('No skipped jobs.',{exact:true}).waitFor();await tab('New (7)').click();await count(7);
  result.scenarios.push('Skip removes a job from New; Skipped finds it and Move back to New restores it');

  await tab('All matches').click();await count(9);await filters().click();await locations().click();
  await selectLocation('Malaysia');await count(2);await selectLocation('Singapore');await count(3);
  await page.getByRole('searchbox',{name:'Search jobs'}).fill('calendar');
  await locationSearch().focus();await page.keyboard.press('Escape');
  assert.equal(await locations().evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.getByRole('searchbox',{name:'Search jobs'}).inputValue(),'calendar');
  await page.getByRole('combobox',{name:'Match level'}).selectOption('strong');await count(3);
  await page.getByRole('button',{name:'Filters (2)',exact:true}).waitFor();
  result.scenarios.push('Multiple countries match either country, compose with search/match, and Escape closes locations with focus return');

  await locations().click();await page.getByRole('button',{name:'Clear locations',exact:true}).click();
  await selectLocation('APAC');await count(4);
  await page.getByRole('button',{name:'Clear locations',exact:true}).click();
  await locationSearch().fill('Kuala Lumpur');await page.getByRole('checkbox',{name:'Kuala Lumpur, Malaysia',exact:true}).check();await count(1);
  await page.getByRole('button',{name:'Clear locations',exact:true}).click();await selectLocation('Worldwide');await count(2);
  await page.getByRole('button',{name:'Clear locations',exact:true}).click();await selectLocation('Unspecified');await count(1);await row('Unspecified').waitFor();
  await page.getByRole('button',{name:'Clear locations',exact:true}).click();await selectLocation('Unresolved');await count(1);await row('Unresolved').waitFor();
  await page.getByRole('button',{name:'Clear locations',exact:true}).click();await selectLocation('Malaysia');await selectLocation('Singapore');await count(3);
  result.scenarios.push('Regions include their countries; city, Worldwide, Unspecified and Unresolved selections remain distinct');

  await page.getByRole('button',{name:/^Saved \d+$/}).click();await count(2);
  assert.equal(await page.getByRole('combobox',{name:'Sort jobs'}).inputValue(),'saved');
  assert.equal(await page.getByRole('searchbox',{name:'Search jobs'}).inputValue(),'');
  const savedTabs=page.getByRole('tablist',{name:'Saved status'});
  await savedTabs.getByRole('tab',{name:'Saved',exact:true}).click();await count(1);await row('Saved').waitFor();
  await page.getByRole('combobox',{name:'Application status'}).selectOption('applied');await page.getByText('No saved jobs.',{exact:true}).waitFor();
  await savedTabs.getByRole('tab',{name:'Applied',exact:true}).click();await count(2);await row('Saved').click();
  await page.getByRole('combobox',{name:'Application status'}).selectOption('saved');await count(1);await row('Applied').waitFor();
  const letter=page.getByRole('textbox',{name:'Cover letter'}),draft='A fictional unsaved edit that filters must preserve.';
  await letter.fill(draft);await page.getByText('Unsaved changes',{exact:true}).waitFor();
  await savedTabs.getByRole('tab',{name:'Saved',exact:true}).click();await count(1);
  assert.equal(await letter.inputValue(),draft);
  page.once('dialog',dialog=>dialog.dismiss());await row('Saved').click();assert.equal(await letter.inputValue(),draft);
  page.once('dialog',dialog=>dialog.accept());await row('Saved').click();
  await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cover letter"]')?.value.includes('Fictional letter for filter verification'));
  await savedTabs.getByRole('tab',{name:'Applied',exact:true}).click();await count(1);
  await page.getByRole('combobox',{name:'Sort jobs'}).selectOption('match');
  await page.screenshot({path:join(output,'saved-applied.png')});
  result.scenarios.push('Saved/Applied tabs follow manual status changes and retain dirty letters until a row change is explicitly accepted');

  await page.getByRole('button',{name:/^Inbox \d+$/}).click();await count(3);await filters().waitFor();
  assert.equal(await tab('All matches').getAttribute('aria-selected'),'true');
  assert.equal(await page.getByRole('combobox',{name:'Sort jobs'}).inputValue(),'discovered');
  await page.reload();await count(3);assert.equal(await page.getByRole('searchbox',{name:'Search jobs'}).inputValue(),'calendar');
  await page.getByRole('button',{name:'Filters (2)',exact:true}).click();await locations().click();
  assert.equal(await page.getByRole('checkbox',{name:'Malaysia',exact:true}).isChecked(),true);
  assert.equal(await page.getByRole('checkbox',{name:'Singapore',exact:true}).isChecked(),true);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();await count(9);
  assert.equal(await page.getByRole('searchbox',{name:'Search jobs'}).inputValue(),'calendar');
  await page.getByRole('button',{name:'Filters',exact:true}).waitFor();
  result.scenarios.push('Each view remembers its controls across navigation/reload; Clear filters restores results and keeps search/sort');

  for(const theme of ['light','dark']) {
    await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);
    await page.getByRole('button',{name:/^Inbox \d+$/}).click();await filters().click();await locations().click();
    await selectLocation('Malaysia');await count(2);
    await locationSearch().fill('');
    if(theme==='dark') {
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(900,600));
      await page.waitForFunction(()=>window.innerWidth===900);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    const audit=await new AxeBuilder({page}).setLegacyMode().withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    const violations=audit.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));
    result.accessibility.push({theme,violations});assert.equal(violations.length,0);
    assert.equal(await page.getByRole('combobox',{name:'Match level'}).evaluate((el:HTMLSelectElement)=>el.selectedOptions[0].textContent),'Any match');
    assert.equal(await page.getByRole('combobox',{name:'Posted within'}).evaluate((el:HTMLSelectElement)=>el.selectedOptions[0].textContent),'Any date');
    assert.equal(await page.locator('.job-list-pane').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    assert.ok(await page.locator('.job-rows').evaluate(el=>el.clientHeight)>80);
    await page.screenshot({path:join(output,`filters-${theme}.png`)});
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  }
  result.scenarios.push('Expanded filters pass light/dark axe checks, keyboard controls and 900×600 layout bounds');
  result.result='Passed';
} catch(error) {
  result.error=error instanceof Error?error.message:String(error);await(await app.firstWindow()).screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;
} finally {
  await writeFile(join(output,'results.json'),JSON.stringify(result,null,2));
  await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});
  await app.close();await rm(dir,{recursive:true,force:true});
}
console.log(JSON.stringify(result,null,2));
