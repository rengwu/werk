import { _electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
const exe=process.env.WERK_EXE;if(!exe)throw new Error('Set WERK_EXE.');
const dir=await mkdtemp(join(tmpdir(),'werk-auth-smoke-'));
const env={...process.env,WERK_DATA_DIR:dir} as Record<string,string>;delete env.ELECTRON_RUN_AS_NODE;delete env.WERK_FAKE_AI;
const app=await _electron.launch({executablePath:exe,env,timeout:20000});
try{
  // Exercise the real SDK login until its browser handoff, without opening the browser in CI.
  await app.evaluate(({shell})=>{shell.openExternal=async()=>{};});
  const page=await app.firstWindow();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('tab',{name:'AI',exact:true}).click();
  await page.getByRole('button',{name:'Sign in with ChatGPT',exact:true}).click();
  const link=page.getByRole('link',{name:'Open sign-in page',exact:true});await link.waitFor({timeout:20000});
  const url=new URL((await link.getAttribute('href'))!);assert.equal(url.origin,'https://auth.openai.com');assert.ok(url.searchParams.get('code_challenge'));assert.ok(url.searchParams.get('state'));
  await page.getByRole('button',{name:'Cancel sign-in',exact:true}).click();
  await page.getByText('Sign-in was cancelled or timed out. Try again.',{exact:true}).waitFor();
  await mkdir(resolve('smoke-output/auth'),{recursive:true});
  await writeFile(resolve('smoke-output/auth/results.json'),JSON.stringify({result:'Passed',scenario:'Real packaged SDK starts the verified OAuth browser handoff and cancels cleanly; no authentication or inference performed.'},null,2));
  console.log('Packaged OAuth handoff and cancellation passed.');
}finally{await app.close();await rm(dir,{recursive:true,force:true});}
