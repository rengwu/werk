import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Service} from '../src/backend/service.ts';
import {fictionalProfile,fixtureJob} from './fixtures/profile.ts';
const exe=process.env.WERK_EXE;if(!exe)throw Error('Set WERK_EXE.');
const dir=await mkdtemp(join(tmpdir(),'werk-backup-smoke-')),output=resolve('smoke-output/backup');await mkdir(output,{recursive:true});
const service=new Service({type:'init',dataDir:dir,version:'test',system:'test',electron:'test',chromium:'test',restartCount:0},()=>{});service.queue.closed=true;
service.profiles.save(fictionalProfile(),0,'user','Fictional profile');service.store.set('firstScanCompleted',true);const source=service.sources.sourceRecord(service.sources.list().find(s=>s.kind==='rss')!.id);service.jobs.ingest(source,fixtureJob('backup-ui'));const id=service.jobs.list({view:'new'}).jobs[0].id;service.jobs.status(id,'saved');service.letters.edit(id,'Dear hiring team,\n\nFictional saved letter.\n\nAlex Example',0);service.store.db.exec('DELETE FROM tasks');service.close();
const env={...process.env,WERK_DATA_DIR:dir} as Record<string,string>;delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:process.env.WERK_DEV_APP?['.']:[],env,timeout:20000}),results:{result:string;scenarios:string[];error?:string}={result:'Failed',scenarios:[]};
try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('combobox',{name:'Appearance'}).selectOption('dark');await page.getByRole('tab',{name:'Backup',exact:true}).click();
 const path=join(dir,'export.zip');await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},path);await page.getByRole('button',{name:'Export backup',exact:true}).click();await page.getByText('Backup exported.',{exact:true}).waitFor();assert.equal((await readFile(path)).subarray(0,2).toString(),'PK');
 await page.getByRole('button',{name:/^Saved(?: \d+)?$/,exact:true}).click();await page.getByRole('textbox',{name:'Cover letter'}).fill('Changed after export');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>document.querySelector<HTMLSelectElement>('[aria-label="Letter version"]')?.value==='2');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Backup',exact:true}).click();const invalid=join(dir,'invalid.zip');await writeFile(invalid,'broken archive');await page.getByLabel('Backup ZIP').setInputFiles(invalid);await page.getByRole('alert').filter({hasText:'not a readable'}).waitFor();
 await page.getByLabel('Backup ZIP').setInputFiles(path);await page.getByText('Backup restored.',{exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Backup',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.evaluate(()=>document.documentElement.dataset.mode),'dark');await page.screenshot({path:join(output,'backup.png')});
 await page.getByRole('button',{name:/^Saved(?: \d+)?$/,exact:true}).click();await page.getByRole('textbox',{name:'Cover letter'}).waitFor();assert.match(await page.getByRole('textbox',{name:'Cover letter'}).inputValue(),/Fictional saved letter/);assert.equal(await page.getByRole('combobox',{name:'Letter version'}).locator('option').count(),1);
 results.scenarios.push('Native ZIP export, failed-import recovery, overwrite restore, reload confirmation, preserved appearance and latest saved letter');results.result='Passed';
}catch(error){results.error=error instanceof Error?error.message:String(error);await(await app.firstWindow()).screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});await app.close();await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify(results,null,2));
