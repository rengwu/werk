import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import type {Service} from '../service.ts';
import {backupSchema,validateRelations,type BackupData} from './schema.ts';
import {createArchive,readArchive,json} from './archive.ts';

export class Backups {
  service:Service;
  constructor(service:Service){this.service=service;}
  export(){
    const {store,profiles,jobs,cv}=this.service;
    const snapshot=store.transaction(()=>{
      const rows=store.db.prepare('SELECT * FROM jobs ORDER BY id').all();
      const current=cv.current();
      const data=backupSchema.parse({
        profile:profiles.get(),
        jobs:rows.map(row=>({...row,countries:JSON.parse(String(row.countries)),assessment:JSON.parse(String(row.assessment))})),
        listings:rows.flatMap(row=>jobs.listings(Number(row.id)).map(l=>({job_id:row.id,kind:l.kind,identifier:l.identifier,name:l.name,source_item_id:l.source_item_id,url:l.url,fields:JSON.parse(l.fields),last_seen_at:l.last_seen_at}))),
        letters:store.db.prepare('SELECT l.job_id,l.version,l.body,l.review_notes,l.profile_revision,l.created_at FROM cover_letter_versions l WHERE version=(SELECT max(version) FROM cover_letter_versions WHERE job_id=l.job_id)').all().map(row=>({...row,review_notes:JSON.parse(String(row.review_notes))})),
        cv:current?{version:current.version,profile_revision:current.profileRevision,created_at:current.createdAt}:null,
      });
      validateRelations(data);
      const files:Record<string,Uint8Array>={'data.json':json(data)};
      if(current){files['cv.tex']=Buffer.from(current.source);if(current.compileStatus==='ok'&&existsSync(join(cv.directory,`${current.version}.pdf`)))files['cv.pdf']=cv.pdf(current.version);}
      return files;
    });
    return createArchive(snapshot);
  }
  restore(bytes:Uint8Array){
    const service=this.service,{store,profiles,cv,queue,sources,assistant}=service;
    if(queue.running||assistant.active||sources.running||cv.active||service.activeEdits>0)throw new Error('Work is still running. Wait for it to finish or stop it, then restore again.');
    const files=readArchive(bytes);
    let data:BackupData;
    try{data=backupSchema.parse(JSON.parse(files['data.json'].toString('utf8')));}catch{throw new Error('The backup contains invalid personal records.');}
    validateRelations(data);
    if(Boolean(data.cv)!==Boolean(files['cv.tex'])||(!data.cv&&files['cv.pdf']))throw new Error('The backup CV files are incomplete.');
    const source=files['cv.tex']?new TextDecoder('utf-8',{fatal:true}).decode(files['cv.tex']):null;
    if(source!==null&&!source.trim())throw new Error('The backup has an empty CV source.');
    if(files['cv.pdf']&&files['cv.pdf'].subarray(0,5).toString()!=='%PDF-')throw new Error('The backup PDF is invalid.');
    const previousRevision=profiles.get().revision,revision=Math.max(previousRevision,data.profile.revision)+1;
    const oldCvVersion=Math.max(cv.current()?.version||0,store.get('cvVersionFloor',0)),cvVersion=Math.max(oldCvVersion,data.cv?.version||0)+1;
    const jobFloor=Math.max(Number(store.db.prepare('SELECT coalesce(max(id),0) AS id FROM jobs').get()!.id),store.get('jobIdFloor',0));
    const ids=new Map(data.jobs.map((job,i)=>[job.id,jobFloor+i+1]));
    const originalRevision=data.profile.revision;
    const remapRevision=(n:number|null)=>n===originalRevision?revision:n;
    const pdfPath=join(cv.directory,`${cvVersion}.pdf`);
    // A new version path cannot overwrite the current PDF. Rollback removes only this staged file.
    if(files['cv.pdf'])writeFileSync(pdfPath,files['cv.pdf'],{flag:'wx',mode:0o600});
    try{
      store.transaction(()=>{
        for(const table of ['attachments','assistant_messages','assistant_evidence','tasks','cover_letter_versions','cv_versions','profile_versions','imported_listings','job_listings','jobs','fingerprints'])store.db.exec(`DELETE FROM ${table}`);
        data.profile.revision=revision;
        store.db.prepare('INSERT INTO profile_versions VALUES(?,?,?,?,?,?)').run(revision,JSON.stringify(data.profile),'restore','Restored backup','[]',new Date().toISOString());
        const columns=Object.keys(backupSchema.shape.jobs.element.shape);
        const insertJob=store.db.prepare(`INSERT INTO jobs(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
        for(const job of data.jobs){
          if(job.assessment.matchProfileRevision===originalRevision)job.assessment.matchProfileRevision=revision;
          const values:Record<string,unknown>={...job,id:ids.get(job.id),profile_revision:remapRevision(job.profile_revision),countries:JSON.stringify(job.countries),assessment:JSON.stringify(job.assessment),duplicate_of:null};
          insertJob.run(...columns.map(key=>values[key] as string|number|null));
        }
        for(const job of data.jobs)if(job.duplicate_of!==null)store.db.prepare('UPDATE jobs SET duplicate_of=? WHERE id=?').run(ids.get(job.duplicate_of)!,ids.get(job.id)!);
        const listing=store.db.prepare('INSERT INTO imported_listings VALUES(?,?,?,?,?,?,?,?)');
        for(const item of data.listings)listing.run(ids.get(item.job_id)!,item.kind,item.identifier,item.name,item.source_item_id,item.url,JSON.stringify(item.fields),item.last_seen_at);
        const letter=store.db.prepare("INSERT INTO cover_letter_versions VALUES(?,?,?,?, 'restore',?,?)");
        for(const item of data.letters)letter.run(ids.get(item.job_id)!,item.version+1,item.body,JSON.stringify(item.review_notes),remapRevision(item.profile_revision),item.created_at);
        if(data.cv)store.db.prepare('INSERT INTO cv_versions VALUES(?,?,?,?,?,?,?)').run(cvVersion,source!,'restore',remapRevision(data.cv.profile_revision),files['cv.pdf']?'ok':null,files['cv.pdf']?'[]':null,data.cv.created_at);
        store.set('jobIdFloor',jobFloor+data.jobs.length);store.set('cvVersionFloor',cvVersion);
        store.db.exec("DELETE FROM settings WHERE key LIKE 'piSession:%'");store.set('chatId',randomUUID());
      });
    }catch(error){if(files['cv.pdf'])rmSync(pdfPath,{force:true});throw error;}
    assistant.resetSession();
    for(const path of [assistant.attachments.directory,join(service.init.dataDir,'pi','sessions')]){
      try{rmSync(path,{recursive:true,force:true});}catch{store.event('warn','backup','Some obsolete conversation files could not be removed.');}
    }
    for(const name of readdirSync(cv.directory))if(/^\d+\.pdf(?:\.tmp)?$/.test(name)&&name!==`${cvVersion}.pdf`){try{rmSync(join(cv.directory,name),{force:true});}catch{store.event('warn','backup','An obsolete CV file could not be removed.');}}
    for(const event of ['profile','jobs','letters','cv','assistant','tasks','sources'] as const)service.emit(event,undefined);
    return {jobs:data.jobs.length,letters:data.letters.length};
  }
}
