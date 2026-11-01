import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';

export function fictionalPdf() {
  const lines=['Alex Example','Kuala Lumpur, Malaysia','I build accessible TypeScript applications and contribute to open source projects.','Target role: Software engineer','Work arrangement: remote'];
  const stream=`BT /F1 10 Tf 40 780 Td ${lines.map((line,i)=>`${i?'0 -20 Td ':''}(${line}) Tj`).join('\n')} ET`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=pdf.length;
  pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf);
}
const exe=process.env.WERK_EXE;if(!exe)throw new Error('Set WERK_EXE to a packaged test build.');
const dir=await mkdtemp(join(tmpdir(),'werk-profile-smoke-')),output=resolve('smoke-output/profile');await mkdir(output,{recursive:true});
const pdf=join(dir,'fictional-cv.pdf');await writeFile(pdf,fictionalPdf());
const env={...process.env,WERK_DATA_DIR:dir,WERK_FAKE_AI:'1',WERK_AI_FIXTURES:resolve('tests/fixtures/ai.json')} as Record<string,string>;delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,env,timeout:20000});
const results:{result:string;scenarios:string[];error?:string}={result:'Failed',scenarios:[]};
try{
  const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.getByRole('heading',{name:'Set up werk',exact:true}).waitFor();
  const before=await page.locator('main').boundingBox();
  await page.getByRole('button',{name:'Open assistant',exact:true}).first().click();
  const pane=page.getByRole('complementary',{name:'Assistant'});assert.equal((await pane.boundingBox())?.width,520);assert.deepEqual(await page.locator('main').boundingBox(),before);
  await page.locator('input[type=file]').setInputFiles(pdf);
  await pane.getByRole('button',{name:'Remove fictional-cv.pdf',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Message assistant'}).fill('Build my profile from this CV.');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await pane.getByText('Profile saved · version 1',{exact:true}).waitFor({timeout:20000});
  results.scenarios.push('PDF attachment text supports assistant-built ready profile with an actual save receipt');
  await page.getByRole('textbox',{name:'Message assistant'}).fill('No changes');
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Message assistant'}).inputValue(),'No changes');
  await page.keyboard.press('Escape');assert.equal(await pane.isVisible(),false);assert.equal(await page.getByRole('button',{name:'Open assistant',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByText('Alex Example',{exact:true}).waitFor();
  results.scenarios.push('Overlay does not resize page; conversation and draft survive navigation; Escape returns focus');
  await page.getByRole('button',{name:'Edit basics',exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Taylor Example');
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Revision 2',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Previous versions',exact:true}).click();
  await page.locator('.versions .queue-row').filter({hasText:'Revision 1 ·'}).getByRole('button',{name:'Restore'}).click();
  await page.getByText('Revision 3',{exact:true}).waitFor();await page.getByText('Alex Example',{exact:true}).waitFor();
  results.scenarios.push('Direct form edit appends revision; restoring older facts appends another revision');
  await page.getByRole('button',{name:'Edit search criteria',exact:true}).click();
  await page.getByText(/countries meet the overlap/).waitFor();
  page.once('dialog',dialog=>void dialog.dismiss());await page.getByRole('button',{name:'Inbox',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Save',exact:true}).count(),1);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  results.scenarios.push('Overlap preview and unsaved-edit navigation guard');
  await page.getByText('Revision 3',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:join(output,'profile.png')});
  await page.getByRole('button',{name:'Open assistant',exact:true}).click();
  await page.getByRole('textbox',{name:'Message assistant'}).fill('simulate allowance');await page.getByRole('button',{name:'Send',exact:true}).click();
  await pane.getByRole('status').filter({hasText:'Your ChatGPT subscription allowance is unavailable. Retry after it resets.'}).waitFor();
  await page.screenshot({path:join(output,'assistant-paused.png')});
  results.scenarios.push('Allowance error pauses queued work while retaining the conversation and profile');
  results.result='Passed';
}catch(error){results.error=error instanceof Error?error.message:String(error);const page=await app.firstWindow();await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));await app.close();await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify(results,null,2));
