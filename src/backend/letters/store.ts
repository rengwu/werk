import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Store} from '../db/store.ts';
import type {Jobs} from '../sources/jobs.ts';
import type {Profiles} from '../profile/store.ts';
import type {ModelQueue} from '../ai/queue.ts';
import type {AiRuntime} from '../ai/runtime.ts';
import type {Task} from '../../shared/ai.ts';
import type {LetterState,LetterVersion} from '../../shared/documents.ts';
import {candidateEvidence,generationInstructions,generationSchema,validateGeneration} from './generate.ts';
export class Letters {
  store:Store;jobs:Jobs;profiles:Profiles;queue:ModelQueue;ai:AiRuntime;changed:()=>void;
  constructor(store:Store,jobs:Jobs,profiles:Profiles,queue:ModelQueue,ai:AiRuntime,changed:()=>void){this.store=store;this.jobs=jobs;this.profiles=profiles;this.queue=queue;this.ai=ai;this.changed=changed;queue.handlers.cover_letter=(task,signal)=>this.generate(task,signal);jobs.onSaved=job=>{if(!this.current(job.id)&&job.descriptionComplete)this.enqueue(job.id,false);};}
  versions(id:number):LetterVersion[]{return this.store.db.prepare('SELECT job_id AS jobId,version,body,review_notes AS reviewNotes,created_by AS createdBy,profile_revision AS profileRevision,created_at AS createdAt FROM cover_letter_versions WHERE job_id=? ORDER BY version DESC').all(id).map(row=>({...row,reviewNotes:JSON.parse(String(row.reviewNotes))})) as LetterVersion[];}
  current(id:number){return this.versions(id)[0]||null;}
  state(id:number):LetterState{const job=this.jobs.get(id),versions=this.versions(id);return{current:versions[0]||null,versions,tasks:this.queue.list().filter(t=>t.kind==='cover_letter'&&t.subject===String(id)),needsDescription:!job.descriptionComplete};}
  save(id:number,body:string,expectedVersion:number,createdBy:LetterVersion['createdBy']='user',reviewNotes:string[]=[],profileRevision:number|null=null){
    const job=this.jobs.get(id);if(!['saved','applied'].includes(job.status))throw new Error('Save the job before editing a letter.');
    if((this.current(id)?.version||0)!==expectedVersion)throw new Error('The letter changed. Review the current version before saving.');
    const version=expectedVersion+1;this.store.db.prepare('INSERT INTO cover_letter_versions VALUES(?,?,?,?,?,?,?)').run(id,version,body,JSON.stringify(reviewNotes),createdBy,profileRevision,new Date().toISOString());return this.current(id)!;
  }
  edit(id:number,body:string,expectedVersion:number){const previous=this.current(id);const saved=this.store.transaction(()=>this.save(id,body,expectedVersion,'user',previous?.reviewNotes||[],previous?.profileRevision||null));this.changed();return saved;}
  restore(id:number,version:number,expectedVersion:number){const old=this.versions(id).find(v=>v.version===version);if(!old)throw new Error('Letter version not found.');const saved=this.store.transaction(()=>this.save(id,old.body,expectedVersion,'restore',old.reviewNotes,old.profileRevision));this.changed();return saved;}
  enqueue(id:number,kick=true){const job=this.jobs.get(id);if(!['saved','applied'].includes(job.status))throw new Error('Save the job before generating its letter.');if(!job.descriptionComplete)throw new Error('Add the full description before generating a cover letter.');const pending=this.store.db.prepare("SELECT id FROM tasks WHERE kind='cover_letter' AND subject=? AND state IN ('queued','running','paused') ORDER BY id DESC LIMIT 1").get(String(id));if(pending)return Number(pending.id);
    const profile=this.profiles.get(),expectedVersion=this.current(id)?.version||0,description=job.savedDescription||job.description;const key=createHash('sha256').update(JSON.stringify([id,profile.revision,description,expectedVersion])).digest('hex');
    const task=this.queue.enqueue('cover_letter',String(id),{profile,job:{...job,description},expectedVersion},`letter:${key}`);const existing=this.queue.list().find(t=>t.id===task);if(kick&&existing&&['failed','paused'].includes(existing.state)){this.queue.retry(task);}else if(kick)this.queue.kick();else queueMicrotask(()=>{if(!this.queue.closed)this.queue.kick();});this.changed();return task;
  }
  async generate(task:Task,signal:AbortSignal){const input=JSON.parse(task.input);input.profile=this.profiles.get();const raw=await this.ai.infer(generationInstructions,{kind:'cover_letter',candidate:candidateEvidence(input.profile),job:{evidenceId:'job',title:input.job.title,company:input.job.company,description:input.job.description.slice(0,50000)}},z.toJSONSchema(generationSchema),signal);signal.throwIfAborted();if(this.profiles.get().revision!==input.profile.revision)throw new Error('The profile changed during generation. Retry to use the current facts.');const generated=validateGeneration(raw,input.profile,input.job);
    this.store.transaction(()=>this.save(Number(task.subject),generated.body,input.expectedVersion,'generated',generated.reviewNotes,input.profile.revision));this.changed();
  }
}
