import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCredentialStore } from '../src/backend/ai/credentials.ts';

test('app-owned credentials serialize SDK mutations, persist privately, and delete without touching other folders',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'werk-auth-test-'));
  try{
    const {credentials,hostId}=createCredentialStore(dir);
    assert.equal(await credentials.read('openai'),undefined);
    await credentials.modify('openai',async()=>({type:'oauth',access:'fictional-access',refresh:'fictional-refresh',expires:1,counter:0}));
    await Promise.all(Array.from({length:5},()=>credentials.modify('openai',async current=>({...current!,counter:Number(current!.counter)+1}))));
    assert.equal((await credentials.read('openai'))?.counter,5);
    assert.deepEqual(await credentials.list(),[{providerId:'openai',type:'oauth'}]);
    assert.equal(await hostId(),await hostId());
    if(process.platform!=='win32')assert.equal((await stat(join(dir,'pi-auth/credentials.json'))).mode&0o777,0o600);
    await credentials.delete('openai');assert.equal(await credentials.read('openai'),undefined);
    await assert.rejects(credentials.modify('other',async()=>undefined));
  }finally{await rm(dir,{recursive:true,force:true});}
});
