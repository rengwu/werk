// Explicit source names keep this live check bounded. No inference or user data.
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Service} from '../src/backend/service.ts';
import {rssSources} from '../src/backend/sources/catalog.ts';
import {fictionalProfile} from '../tests/fixtures/profile.ts';
const names=[...new Set(process.argv.slice(2))];
if(!names.length||names.some(name=>!rssSources.some(s=>s.name===name)))throw new Error('Pass one or more exact RSS source names from the catalog.');
const dir=await mkdtemp(join(tmpdir(),'werk-live-feeds-'));
const service=new Service({type:'init',dataDir:dir,version:'0.1.0',system:process.platform,electron:'Node verification',chromium:'n/a',restartCount:0},()=>{});
const counts=new Map<string,{parsed:number;full:number;emptyDescriptions:number;unknownEmployers:number}>();
const ingest=service.jobs.ingest.bind(service.jobs);
service.jobs.ingest=(source,item)=>{
  const count=counts.get(source.name)||{parsed:0,full:0,emptyDescriptions:0,unknownEmployers:0};
  count.parsed++;if(item.descriptionQuality==='full')count.full++;if(!item.description.trim())count.emptyDescriptions++;if(item.company==='Not listed')count.unknownEmployers++;
  counts.set(source.name,count);return ingest(source,item);
};
try{
  service.queue.closed=true;
  service.profiles.save(fictionalProfile(),0,'user','Fictional source verification profile');
  for(const source of service.sources.list())service.sources.enable(source.id,names.includes(source.name));
  service.sources.start();await service.sources.active;
  const sources=service.sources.list().filter(s=>s.enabled).map(s=>({name:s.name,url:s.identifier,result:s.lastError||!counts.get(s.name)?.parsed?'Failed':'Passed',...counts.get(s.name),kept:s.kept,error:s.lastError}));
  const result={checkedAt:new Date().toISOString(),result:sources.every(s=>s.result==='Passed')?'Passed':'Failed',requests:service.sources.requests,sources};
  const output=resolve('smoke-output/source-feeds');await mkdir(output,{recursive:true});await writeFile(join(output,'live.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  if(result.result==='Failed')process.exitCode=1;
}finally{await service.shutdown();await rm(dir,{recursive:true,force:true});}
