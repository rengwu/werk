import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,writeFile,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createServer } from 'node:http';
const exe=process.env.WERK_EXE;if(!exe)throw new Error('Set WERK_EXE to a test build.');
const dir=await mkdtemp(join(tmpdir(),'werk-assistant-smoke-')),output=resolve('smoke-output/assistant');await mkdir(output,{recursive:true});
const local=join(dir,'fictional-profile.md');await writeFile(local,'Alex Example builds TypeScript software.');
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>Example project</h1><p>Alex Example contributed keyboard navigation.</p>');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/project`;
const tool=(name:string,args:unknown)=>({name,argsJson:JSON.stringify(args)});
const fixture=join(dir,'ai.json');await writeFile(fixture,JSON.stringify([
 {when:'Read the attached files.',result:{reply:'The dropped file is available.'}},
 {when:'read local and network',steps:[{actions:[tool('read',{path:local})]},{actions:[tool('read_url',{url})]},{reply:'Local file and network reference read.'}]},
 {when:'slow request',steps:[{delayMs:2000,reply:'First request finished.'}]},
 {when:'steer me',result:{reply:'Steering received.'}},
 {when:'shell interruption',steps:[{actions:[tool(process.platform==='win32'?'powershell':'bash',{command:process.platform==='win32'?"Write-Output 'running fixture'; Start-Sleep -Seconds 20":"printf 'running fixture\\n'; sleep 20",timeout:30})]},{reply:'Shell completed.'}]},
 {when:'replace request',result:{reply:'Replacement received.'}},
]));
const env={...process.env,WERK_DATA_DIR:dir,WERK_FAKE_AI:'1',WERK_AI_FIXTURES:fixture} as Record<string,string>;delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:process.env.WERK_DEV_APP?['.']:[],env,timeout:20000});
const results:{result:string;scenarios:string[];error?:string}={result:'Failed',scenarios:[]};
try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.getByRole('heading',{name:'Set up werk',exact:true}).waitFor();
 await page.getByRole('button',{name:'Open assistant',exact:true}).first().click();const pane=page.getByRole('complementary',{name:'Assistant'}),composer=pane.getByRole('textbox',{name:'Message assistant'});
 await pane.getByText('Full access',{exact:true}).click();await pane.getByText('Read and write files, run shell commands, and access the network.',{exact:true}).waitFor();await pane.getByText('Full access',{exact:true}).click();
 const data=await page.evaluateHandle(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['print("fictional")'],'example.py',{type:'text/x-python'}));return transfer;});
 await pane.dispatchEvent('dragenter',{dataTransfer:data});await pane.getByText('Drop files to attach',{exact:true}).waitFor();await pane.dispatchEvent('drop',{dataTransfer:data});await data.dispose();
 await pane.getByRole('button',{name:'Remove example.py'}).waitFor();await pane.getByRole('button',{name:'Send',exact:true}).click();await pane.getByText('The dropped file is available.',{exact:true}).waitFor();
 results.scenarios.push('Full-access tools are visible; drag and drop accepts arbitrary files; attachments can be sent without text');
 await composer.fill('read local and network');await pane.getByRole('button',{name:'Send',exact:true}).click();await pane.getByText('Local file and network reference read.',{exact:true}).waitFor();
 const read=pane.locator('.tool-call').filter({hasText:'read_url'});await read.locator('summary').click();await read.getByLabel('read_url output').filter({hasText:'keyboard navigation'}).waitFor();
 results.scenarios.push('Actual local-file and HTTP tools execute inside packaged pi; expandable tool inputs and results persist');
 await composer.fill('slow request');await pane.getByRole('button',{name:'Send',exact:true}).click();await pane.getByRole('button',{name:'Stop',exact:true}).waitFor();await composer.fill('steer me');assert.equal(await pane.getByRole('button',{name:'Send',exact:true}).isEnabled(),true);await pane.getByRole('button',{name:'Send',exact:true}).click();await pane.getByText('Steering received.',{exact:true}).waitFor();
 results.scenarios.push('Composer remains enabled and steering reaches the running pi session');
 await composer.fill('shell interruption');await pane.getByRole('button',{name:'Send',exact:true}).click();await pane.locator('.tool-call.running').waitFor();await composer.fill('replace request');await pane.getByRole('combobox',{name:'Send while working'}).selectOption('interrupt');await pane.getByRole('button',{name:'Send',exact:true}).click();await pane.getByText('Replacement received.',{exact:true}).waitFor();assert.equal(await pane.getByText('Shell completed.',{exact:true}).count(),0);
 results.scenarios.push('Interrupt-and-send aborts an executing shell command and runs the replacement request');
 await composer.fill('draft survives reload');await page.reload();await page.getByRole('button',{name:'Open assistant',exact:true}).first().click();await composer.waitFor();assert.equal(await composer.inputValue(),'draft survives reload');await pane.getByText('Replacement received.',{exact:true}).waitFor();
 results.scenarios.push('Conversation, tool history and unsent draft survive a renderer reload');
 await page.screenshot({path:join(output,'assistant.png')});results.result='Passed';
}catch(error){results.error=error instanceof Error?error.message:String(error);await (await app.firstWindow()).screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));await app.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify(results,null,2));
