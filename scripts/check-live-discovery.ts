// One bounded public read, using fictional candidate facts and a temporary database.
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Service} from '../src/backend/service.ts';
import {fictionalProfile} from '../tests/fixtures/profile.ts';
const dir=await mkdtemp(join(tmpdir(),'werk-live-discovery-'));
const service=new Service({type:'init',dataDir:dir,version:'0.1.0',system:process.platform,electron:'Node verification',chromium:'n/a',restartCount:0},()=>{});
try{service.store.transaction(()=>service.profiles.save(fictionalProfile(),0,'user','Fictional verification profile'));const source=service.sources.list().find(s=>s.kind==='remotive')!;service.sources.start(source.id);await service.sources.active;const end=service.sources.list().find(s=>s.id===source.id)!;
  const result={result:end.lastError?'Untested':'Passed',source:source.name,requests:service.sources.requests,kept:service.jobs.list({view:'all'}).total,fingerprints:Number(service.store.db.prepare('SELECT count(*) n FROM fingerprints').get()!.n),databaseBytes:service.diagnostics().databaseBytes,error:end.lastError};const output=resolve('smoke-output/discovery');await mkdir(output,{recursive:true});await writeFile(join(output,'live.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{service.close();await rm(dir,{recursive:true,force:true});}
