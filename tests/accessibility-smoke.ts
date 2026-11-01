import {_electron as electron} from 'playwright-core';
import {AxeBuilder} from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Service} from '../src/backend/service.ts';
import {fictionalProfile,fixtureJob} from './fixtures/profile.ts';
const exe=process.env.WERK_EXE;if(!exe)throw Error('Set WERK_EXE.');
const dir=await mkdtemp(join(tmpdir(),'werk-accessibility-')),output=resolve('smoke-output/accessibility');await mkdir(output,{recursive:true});
const service=new Service({type:'init',dataDir:dir,version:'test',system:'test',electron:'test',chromium:'test',restartCount:0},()=>{});service.queue.closed=true;service.profiles.save(fictionalProfile(),0,'user','Fictional profile');service.store.set('firstScanCompleted',true);const source=service.sources.sourceRecord(service.sources.list().find(s=>s.kind==='rss')!.id);service.jobs.ingest(source,fixtureJob('accessibility'));const id=service.jobs.list({view:'new'}).jobs[0].id;service.jobs.status(id,'saved');service.letters.edit(id,'Fictional letter for keyboard and contrast checks.',0);service.store.db.exec('DELETE FROM tasks');service.cv.save('\\documentclass{article}\n\\begin{document}Alex Example\\end{document}',0);service.close();
const env={...process.env,WERK_DATA_DIR:dir} as Record<string,string>;delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:process.env.WERK_DEV_APP?['.']:[],env,timeout:20000}),results:{result:string;scenarios:unknown[];error?:string}={result:'Failed',scenarios:[]};
try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);
 async function audit(name:string){
   // Electron deliberately denies new browser windows. Run in its existing page;
   // embedded PDF viewer internals are outside this DOM audit.
   const result=await new AxeBuilder({page}).setLegacyMode().withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
   const violations=result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
   results.scenarios.push({name,violations,incomplete:result.incomplete.map(v=>v.id)});
 }
 for(const theme of ['light','dark']){
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'General',exact:true}).click();await page.getByRole('combobox',{name:'Appearance'}).selectOption(theme);await page.waitForFunction(theme=>document.documentElement.dataset.mode===theme,theme);
  for(const tab of ['General','Sources','AI','Backup','Diagnostics']){await page.getByRole('tab',{name:tab,exact:true}).click();await page.waitForTimeout(80);await audit(`${theme}:Settings/${tab}`);}
  for(const route of ['Inbox','Saved','Profile','CV']){await page.getByRole('button',{name:new RegExp('^'+route+'(?: \\d+)?$'),exact:true}).click();if(route==='Saved')await page.getByRole('textbox',{name:'Cover letter'}).waitFor();if(route==='CV')await page.getByRole('textbox',{name:'CV LaTeX'}).waitFor();await audit(`${theme}:${route}`);}
  await page.getByRole('button',{name:'Open assistant',exact:true}).click();await page.getByRole('textbox',{name:'Message assistant'}).waitFor();await audit(`${theme}:Assistant`);await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Open assistant',exact:true}).evaluate(el=>el===document.activeElement),true);
 }
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'General',exact:true}).click();await page.getByRole('tab',{name:'General',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Sources',exact:true}).getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'Diagnostics',exact:true}).getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'General',exact:true}).getAttribute('aria-selected'),'true');
 results.scenarios.push({name:'Keyboard tabs and assistant Escape/focus return',result:'Passed'});
 await page.screenshot({path:join(output,'settings-dark.png')});
 assert.equal(results.scenarios.filter((s:any)=>s.violations?.length).length,0,'Accessibility violations; see results.json');results.result='Passed';
}catch(error){results.error=error instanceof Error?error.message:String(error);await(await app.firstWindow()).screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});await app.close();await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify({result:results.result,scenarios:results.scenarios.length},null,2));
