import {z} from 'zod';
import {profileSchema} from '../../shared/profile.ts';
import {canonicalUrl} from '../sources/jobs.ts';
const text=z.string().max(2*1024*1024),id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER-100001),revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-100001),date=z.iso.datetime({offset:true});
const link=z.string().max(8000).refine(value=>{try{canonicalUrl(value);return true;}catch{return false;}},'Invalid posting URL.');
const strings=z.array(text).max(1000);
const incoming=z.object({sourceItemId:z.string().max(1500),title:text,company:text,location:text,locationScope:z.enum(['listed','hiring']).optional(),arrangement:text,employmentType:text,salary:text,url:link,description:text,descriptionQuality:z.enum(['full','excerpt','unknown']).optional(),descriptionSource:z.object({name:text,url:link,checkedAt:date}).optional(),applicationUrl:link.optional(),publishedAt:date.nullable(),expiresAt:date.nullable().optional(),removedAt:date.nullable().optional(),kind:z.enum(['opening','lead'])});
const assessment=z.object({
  category:z.enum(['strong','adjacent','stretch','other']),score:z.number().finite(),reasons:strings,gaps:strings,eligibility:z.enum(['unknown','possible','review','incompatible']),eligibilityNotes:strings,
  eligibilityEvidence:z.array(z.object({rule:text,text,outcome:z.enum(['review','incompatible']),source:z.enum(['description','location'])})).optional(),remoteEligibility:z.enum(['possible','restricted','unknown']).optional(),matchVersion:revision.optional(),matchScoreCap:z.number().finite().optional(),matchProfileRevision:revision.optional(),matchBreakdown:z.array(z.object({label:text,points:z.number().finite()})).optional(),matchedEvidence:z.array(z.object({technology:text,basis:z.enum(['professional','project']),ids:strings})).optional(),highlights:z.array(z.object({start:revision,end:revision,kind:z.enum(['matched','missing'])})),availability:z.enum(['open','unknown','closed']),freshness:z.enum(['recent','stale','unknown']),qualityNotes:strings,
});
export const jobSchema=z.object({
  id,url:link,company:text,company_key:text,title:text,location:text,countries:z.array(z.string().regex(/^[A-Z]{2}$/)).max(300),arrangement:z.enum(['remote','hybrid','onsite']).nullable(),salary:text.nullable(),description:text,description_manual:z.union([z.literal(0),z.literal(1)]),description_complete:z.union([z.literal(0),z.literal(1)]),posted_at:date.nullable(),first_seen_at:date,last_seen_at:date,closed_at:date.nullable(),match_level:z.enum(['strong','adjacent','stretch','other']),match_score:z.number().int(),eligibility:z.enum(['possible','review','incompatible']),overlap_hours:z.number().finite().nullable(),assessment,profile_revision:revision,status:z.enum(['new','skipped','saved','applied']),opened_at:date.nullable(),saved_at:date.nullable(),applied_at:date.nullable(),notes:text,saved_description:text.nullable(),duplicate_of:id.nullable(),
}).strict();
const listing=z.object({job_id:id,kind:z.string().min(1).max(100),identifier:z.string().max(1500),name:z.string().max(1000),source_item_id:z.string().max(1500),url:link,fields:incoming,last_seen_at:date}).strict();
const letter=z.object({job_id:id,version:id,body:z.string().min(1).max(40000),review_notes:strings,profile_revision:revision.nullable(),created_at:date}).strict();
export const backupSchema=z.object({profile:profileSchema,jobs:z.array(jobSchema).max(100000),listings:z.array(listing).max(1000000),letters:z.array(letter).max(100000),cv:z.object({version:id,profile_revision:revision.nullable(),created_at:date}).strict().nullable()}).strict();
export type BackupData=z.infer<typeof backupSchema>;
export function validateRelations(data:BackupData){
  const unique=(values:Array<number|string>,label:string)=>{if(new Set(values).size!==values.length)throw new Error(`Duplicate ${label} in backup.`);};
  unique(data.jobs.map(j=>j.id),'job IDs');unique(data.jobs.map(j=>canonicalUrl(j.url)),'posting URLs');unique(data.letters.map(l=>l.job_id),'letters');
  unique(data.listings.map(l=>JSON.stringify([l.kind,l.identifier,l.source_item_id])),'source listings');
  const jobs=new Set(data.jobs.map(j=>j.id));
  for(const item of [...data.listings,...data.letters])if(!jobs.has(item.job_id))throw new Error('A backup record refers to a missing job.');
  for(const job of data.jobs)if(job.duplicate_of!==null&&(!jobs.has(job.duplicate_of)||job.duplicate_of===job.id))throw new Error('A duplicate posting refers to an invalid job.');
}
