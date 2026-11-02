import { createHash } from 'node:crypto';
import type { Store } from '../db/store.ts';
import type { Profiles } from '../profile/store.ts';
import type { Profile } from '../../shared/profile.ts';
import type { JobRecord, JobFilter, JobStatus, JobsList, Assessment } from '../../shared/jobs.ts';
import type { IncomingJob, Job, Source } from './types.ts';
import { assessJob } from '../matching/matching.ts';
import { criteriaAssessment, resolveLocation } from '../matching/criteria.ts';
import { buildRegionLocationIndex } from '../geo/location-index.ts';
import { companyKey, groupDuplicates } from '../matching/deduplication.ts';
import { descriptionQuality, listingQuality, preserveDescription, sourceContent, authoritativeSources } from '../matching/job-quality.ts';
import { countryOverlaps } from '../geo/overlap.ts';

type Row = Record<string,any>;
const at=()=>new Date().toISOString();
const hash=(item:IncomingJob)=>createHash('sha256').update(sourceContent(item)).digest('hex');
export function canonicalUrl(raw:string) {
  const url=new URL(raw);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('The posting URL is invalid.');
  url.hash='';
  for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['ref','source','gh_src','referrer','trk','trackingId'].includes(key))url.searchParams.delete(key);
  url.searchParams.sort();url.pathname=url.pathname.replace(/\/$/,'')||'/';return url.href;
}
function clean(item:IncomingJob):IncomingJob {
  if(typeof item.title!=='string'||!item.title.trim()||typeof item.company!=='string'||typeof item.description!=='string')throw new Error('The source returned an incomplete job record.');
  return {...item,url:canonicalUrl(item.url),sourceItemId:String(item.sourceItemId).slice(0,1500),title:item.title.trim().slice(0,400),company:item.company.trim().slice(0,250)||'Not listed',location:String(item.location||'').slice(0,1000),description:item.description.slice(0,150000),salary:String(item.salary||'').slice(0,2000),arrangement:String(item.arrangement||'Unspecified'),employmentType:String(item.employmentType||'Unspecified'),publishedAt:item.publishedAt&&!Number.isNaN(Date.parse(item.publishedAt))?new Date(item.publishedAt).toISOString():null};
}
export class Jobs {
  store:Store;profiles:Profiles;changed:()=>void;
  onSaved:(job:JobRecord)=>void=()=>{};
  overlapCache:{key:string;value:Map<string,number>}|undefined;
  constructor(store:Store,profiles:Profiles,changed:()=>void){this.store=store;this.profiles=profiles;this.changed=changed;this.store.transaction(()=>this.indexLocations());}
  indexLocations() {
    // Derived data is rebuilt for upgraded databases and restored backups.
    for(const row of this.store.db.prepare('SELECT id,location FROM jobs WHERE NOT EXISTS(SELECT 1 FROM job_locations WHERE job_id=jobs.id)').all())
      this.indexLocation(Number(row.id),[...resolveLocation(String(row.location)).values]);
  }
  private indexLocation(id:number,values:string[]) {
    this.store.db.prepare('DELETE FROM job_locations WHERE job_id=?').run(id);
    const insert=this.store.db.prepare('INSERT INTO job_locations(job_id,value) VALUES(?,?)');
    for(const value of values)insert.run(id,value);
  }
  locations() {
    const rows=this.store.db.prepare('SELECT DISTINCT location FROM jobs WHERE duplicate_of IS NULL').all();
    return buildRegionLocationIndex(rows.map((row,i)=>({id:String(i),location:String(row.location)}))).options;
  }
  row(id:number):Row {const row=this.store.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(!row)throw new Error('Job not found.');return row;}
  listings(id:number):Row[]{return this.store.db.prepare(`SELECT l.*,s.name,s.kind,s.identifier FROM job_listings l JOIN sources s ON s.id=l.source_id WHERE job_id=?
      UNION ALL SELECT NULL AS source_id,l.source_item_id,l.job_id,l.url,l.fields,l.last_seen_at,l.name,l.kind,l.identifier FROM imported_listings l WHERE job_id=? AND NOT EXISTS(SELECT 1 FROM job_listings live JOIN sources s ON s.id=live.source_id WHERE s.kind=l.kind AND s.identifier=l.identifier AND live.source_item_id=l.source_item_id)
      ORDER BY last_seen_at DESC`).all(id,id);}
  record(row:Row):JobRecord {
    const sources=this.listings(row.id).map(l=>({name:l.name,url:l.url,checkedAt:l.last_seen_at}));
    let letterState:string|undefined;
    if(['saved','applied'].includes(row.status)){const task=this.store.db.prepare("SELECT state,error FROM tasks WHERE kind='cover_letter' AND subject=? ORDER BY id DESC LIMIT 1").get(String(row.id));const letter=this.store.db.prepare('SELECT version FROM cover_letter_versions WHERE job_id=? ORDER BY version DESC LIMIT 1').get(row.id);letterState=!row.description_complete?'Needs full description':task?.state==='running'?'Writing letter…':task?.state==='queued'?'Letter queued':task?.state==='paused'?`Paused: ${task.error}`:task?.state==='failed'?`Letter failed: ${task.error}`:letter?'Letter ready':'No letter yet';}
    return {id:row.id,url:row.url,company:row.company,title:row.title,location:row.location,countries:JSON.parse(row.countries),arrangement:row.arrangement,salary:row.salary,description:row.description,descriptionComplete:!!row.description_complete,postedAt:row.posted_at,firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,closedAt:row.closed_at,matchLevel:row.match_level,matchScore:row.match_score,eligibility:row.eligibility,overlapHours:row.overlap_hours,assessment:JSON.parse(row.assessment),profileRevision:row.profile_revision,status:row.status,openedAt:row.opened_at,savedAt:row.saved_at,appliedAt:row.applied_at,notes:row.notes,savedDescription:row.saved_description,duplicateOf:row.duplicate_of,sources,letterState};
  }
  get(id:number){return this.record(this.row(id));}
  list(filter:JobFilter):JobsList {
    const where=['duplicate_of IS NULL'],values:(string|number)[]=[];
    if(filter.view==='new')where.push("status='new' AND closed_at IS NULL AND json_extract(assessment,'$.availability')='open'");
    if(filter.view==='skipped')where.push("status='skipped'");
    if(filter.view==='saved') {
      if(filter.savedStatus){where.push('status=?');values.push(filter.savedStatus);}
      else where.push("status IN ('saved','applied')");
    }
    const words=filter.search?.match(/[\p{L}\p{N}_+#.-]+/gu)?.slice(0,20);
    if(words?.length){where.push('id IN (SELECT rowid FROM jobs_fts WHERE jobs_fts MATCH ?)');values.push(words.map(w=>'"'+w.replaceAll('"','""')+'"*').join(' AND '));}
    if(filter.level){where.push('match_level=?');values.push(filter.level);}
    if(filter.arrangement){where.push('arrangement=?');values.push(filter.arrangement);}
    if(filter.country){where.push('EXISTS(SELECT 1 FROM json_each(jobs.countries) WHERE value=?)');values.push(filter.country);}
    if(filter.locations?.length){where.push(`id IN (SELECT job_id FROM job_locations WHERE value IN (${filter.locations.map(()=>'?').join(',')}))`);values.push(...filter.locations);}
    if(filter.days){where.push('posted_at>=?');values.push(new Date(Date.now()-filter.days*86400000).toISOString());}
    const sql=where.join(' AND '),total=Number(this.store.db.prepare(`SELECT count(*) n FROM jobs WHERE ${sql}`).get(...values)!.n);
    const sort=filter.sort||(filter.view==='saved'?'saved':'match');
    const order=sort==='saved'?'saved_at DESC':sort==='discovered'?'first_seen_at DESC':'match_score DESC,first_seen_at DESC';
    const rows=this.store.db.prepare(`SELECT * FROM jobs WHERE ${sql} ORDER BY ${order},id DESC LIMIT ? OFFSET ?`).all(...values,filter.limit||100,filter.offset||0);
    return {jobs:rows.map(r=>this.record(r)),total,newCount:Number(this.store.db.prepare("SELECT count(*) n FROM jobs WHERE status='new' AND closed_at IS NULL AND duplicate_of IS NULL AND json_extract(assessment,'$.availability')='open'").get()!.n),savedCount:Number(this.store.db.prepare("SELECT count(*) n FROM jobs WHERE status IN ('saved','applied')").get()!.n),countries:this.store.db.prepare('SELECT DISTINCT value FROM jobs,json_each(countries) ORDER BY value').all().map(r=>String(r.value))};
  }
  incoming(row:Row):IncomingJob {
    const listings=this.listings(row.id),preferred=[...listings].sort((a,b)=>Number(authoritativeSources.has(b.kind))-Number(authoritativeSources.has(a.kind)))[0];
    const item=preferred?JSON.parse(preferred.fields) as IncomingJob:{} as IncomingJob;
    return {...item,sourceItemId:item.sourceItemId||String(row.id),url:row.url,title:row.title,company:row.company,location:row.location,arrangement:row.arrangement||'Unspecified',salary:row.salary||'',description:row.description,descriptionQuality:row.description_complete?'full':'excerpt',employmentType:item.employmentType||'Unspecified',publishedAt:row.posted_at,kind:'opening'};
  }
  legacy(row:Row):Job {
    const item=this.incoming(row),source=this.listings(row.id)[0],assessment=JSON.parse(row.assessment);
    return {...item,...assessment,id:String(row.id),sourceId:String(source?.source_id||''),sourceType:source?.kind||'',sourceName:source?.name||'',firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,contentHash:hash(item),status:row.status,savedAt:row.saved_at,notes:row.notes,sourceLinks:this.listings(row.id).map(l=>({name:l.name,url:l.url}))};
  }
  quality(item:IncomingJob,row:Row|undefined,source?:Source):Pick<Assessment,'availability'|'freshness'|'qualityNotes'> {
    const time=at(),listings=row?this.listings(row.id):[];
    const observations=listings.filter(l=>!source||!(l.kind===source.type&&l.identifier===source.identifier)).map(l=>({sourceId:String(l.source_id),sourceType:l.kind,sourceName:l.name,item:JSON.parse(l.fields),firstSeenAt:row?.first_seen_at||time,checkedAt:l.last_seen_at,changedAt:l.last_seen_at,missingAt:JSON.parse(l.fields).removedAt||null}));
    if(source)observations.push({sourceId:source.id,sourceType:source.type,sourceName:source.name,item,firstSeenAt:row?.first_seen_at||time,checkedAt:time,changedAt:time,missingAt:item.removedAt||null});
    return listingQuality(item as Job,observations);
  }
  assess(item:IncomingJob,profile:Profile,row?:Row,source?:Source,overlaps?:Map<string,number>) {
    const assessment={...assessJob(item,profile),...this.quality(item,row,source)} as Assessment;
    const key=`${profile.revision}:${at().slice(0,10)}`;if(!overlaps){if(this.overlapCache?.key!==key)this.overlapCache={key,value:countryOverlaps(profile.criteria)};overlaps=this.overlapCache!.value;}
    const criteria=criteriaAssessment(item,profile,overlaps);
    const reason=profile.criteria.hiddenCompanies.some(c=>companyKey(c)===companyKey(item.company))?'hidden':assessment.eligibility==='incompatible'?'incompatible':['stretch','other'].includes(assessment.category)?assessment.category:criteria.conflict?'criteria':null;
    return {assessment,criteria,reason};
  }
  fingerprint(item:IncomingJob,revision:number,reason:string){this.store.db.prepare('INSERT INTO fingerprints VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET content_hash=excluded.content_hash,profile_revision=excluded.profile_revision,reason=excluded.reason,last_seen_at=excluded.last_seen_at').run(item.url,hash(item),revision,reason,at());}
  ingest(source:Source,raw:IncomingJob):boolean {
    const item=clean(raw),profile=this.profiles.get(),time=at();
    let row=this.store.db.prepare('SELECT * FROM jobs WHERE url=? OR id IN (SELECT job_id FROM job_listings WHERE source_id=? AND source_item_id=?) ORDER BY url=? DESC LIMIT 1').get(item.url,Number(source.id),item.sourceItemId,item.url) as Row|undefined;
    const fingerprint=this.store.db.prepare('SELECT * FROM fingerprints WHERE url=?').get(item.url);
    if(!row&&fingerprint?.content_hash===hash(item)&&fingerprint.profile_revision===profile.revision){this.store.db.prepare('UPDATE fingerprints SET last_seen_at=? WHERE url=?').run(time,item.url);return false;}
    let content=row?preserveDescription(this.incoming(row),item):item;
    if(row?.description_manual)content={...content,description:row.description,descriptionQuality:'full'};
    const {assessment,criteria,reason}=this.assess(content,profile,row,source);
    if(reason&&(!row||['new','skipped'].includes(row.status))){this.fingerprint(content,profile.revision,reason);if(row)this.store.db.prepare('DELETE FROM jobs WHERE id=?').run(row.id);return false;}
    const closed=assessment.availability==='closed'?(row?.closed_at||time):null;
    const fields=[content.company,companyKey(content.company),content.title,content.location,JSON.stringify(criteria.countries),criteria.arrangement,content.salary,content.description,descriptionQuality(content)==='full'?1:0,content.publishedAt,time,closed,assessment.category,assessment.score,assessment.eligibility==='unknown'?'review':assessment.eligibility,criteria.overlapHours,JSON.stringify(assessment),profile.revision];
    if(row)this.store.db.prepare('UPDATE jobs SET company=?,company_key=?,title=?,location=?,countries=?,arrangement=?,salary=?,description=?,description_complete=?,posted_at=?,last_seen_at=?,closed_at=?,match_level=?,match_score=?,eligibility=?,overlap_hours=?,assessment=?,profile_revision=? WHERE id=?').run(...fields,row.id);
    else {const insert=this.store.db.prepare('INSERT INTO jobs(id,company,company_key,title,location,countries,arrangement,salary,description,description_complete,posted_at,last_seen_at,closed_at,match_level,match_score,eligibility,overlap_hours,assessment,profile_revision,url,first_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(Math.max(Number(this.store.db.prepare('SELECT coalesce(max(id),0) AS id FROM jobs').get()!.id),this.store.get('jobIdFloor',0))+1,...fields,item.url,time);row=this.row(Number(insert.lastInsertRowid));}
    this.store.db.prepare('INSERT INTO job_listings VALUES(?,?,?,?,?,?) ON CONFLICT(source_id,source_item_id) DO UPDATE SET job_id=excluded.job_id,url=excluded.url,fields=excluded.fields,last_seen_at=excluded.last_seen_at').run(Number(source.id),item.sourceItemId,row.id,item.url,JSON.stringify(item),time);
    this.store.db.prepare('DELETE FROM imported_listings WHERE kind=? AND identifier=? AND source_item_id=?').run(source.type,source.identifier,item.sourceItemId);
    this.store.db.prepare('DELETE FROM fingerprints WHERE url=?').run(item.url);
    this.indexLocation(Number(row.id),criteria.locationValues);
    this.deduplicate(companyKey(content.company));return true;
  }
  deduplicate(company:string) {
    const rows=this.store.db.prepare('SELECT * FROM jobs WHERE company_key=?').all(company);
    for(const job of groupDuplicates(rows.map(r=>this.legacy(r))))this.store.db.prepare('UPDATE jobs SET duplicate_of=? WHERE id=?').run(job.duplicateOf?Number(job.duplicateOf):null,Number(job.id));
  }
  reassess(profile=this.profiles.get()) {
    const overlaps=countryOverlaps(profile.criteria),companies=new Set<string>();
    for(const row of this.store.db.prepare('SELECT * FROM jobs').all()){
      const item=this.incoming(row),{assessment,criteria,reason}=this.assess(item,profile,row,undefined,overlaps);companies.add(String(row.company_key));
      if(reason&&['new','skipped'].includes(String(row.status))){this.fingerprint(item,profile.revision,reason);this.store.db.prepare('DELETE FROM jobs WHERE id=?').run(row.id);continue;}
      this.store.db.prepare('UPDATE jobs SET countries=?,overlap_hours=?,match_level=?,match_score=?,eligibility=?,assessment=?,profile_revision=?,closed_at=? WHERE id=?').run(JSON.stringify(criteria.countries),criteria.overlapHours,assessment.category,assessment.score,assessment.eligibility==='unknown'?'review':assessment.eligibility,JSON.stringify(assessment),profile.revision,assessment.availability==='closed'?(row.closed_at||at()):null,row.id);
      this.indexLocation(Number(row.id),criteria.locationValues);
    }
    for(const company of companies)this.deduplicate(company);
  }
  finishSnapshot(source:Source,since:string) {
    const missing=this.store.db.prepare('SELECT * FROM job_listings WHERE source_id=? AND last_seen_at<?').all(Number(source.id),since);
    for(const row of missing){const item=JSON.parse(String(row.fields));item.removedAt=at();this.store.db.prepare('UPDATE job_listings SET fields=? WHERE source_id=? AND source_item_id=?').run(JSON.stringify(item),row.source_id,row.source_item_id);}
    this.reassess();
  }
  status(id:number,status:JobStatus) {
    this.store.transaction(()=>{const row=this.row(id),time=at();
      this.store.db.prepare("UPDATE jobs SET status=?,saved_at=CASE WHEN ? IN ('saved','applied') THEN coalesce(saved_at,?) ELSE saved_at END,saved_description=CASE WHEN ? IN ('saved','applied') THEN coalesce(saved_description,description) ELSE saved_description END,applied_at=CASE WHEN ?='applied' THEN coalesce(applied_at,?) ELSE NULL END WHERE id=?").run(status,status,time,status,status,time,id);
      if(status==='saved'&&!['saved','applied'].includes(row.status))this.onSaved(this.get(id));this.deduplicate(row.company_key);
    });this.changed();return this.get(id);
  }
  open(id:number){this.store.db.prepare('UPDATE jobs SET opened_at=coalesce(opened_at,?) WHERE id=?').run(at(),id);this.changed();return this.get(id);}
  notes(id:number,notes:string){this.row(id);this.store.db.prepare('UPDATE jobs SET notes=? WHERE id=?').run(notes,id);this.changed();return this.get(id);}
  description(id:number,description:string){this.store.transaction(()=>{const row=this.row(id);this.store.db.prepare("UPDATE jobs SET description=?,description_complete=1,description_manual=1,saved_description=CASE WHEN status IN ('saved','applied') THEN ? ELSE saved_description END WHERE id=?").run(description,description,id);this.reassess();if(['saved','applied'].includes(row.status))this.onSaved(this.get(id));});this.changed();return this.store.db.prepare('SELECT id FROM jobs WHERE id=?').get(id)?this.get(id):null;}
  hideCompany(id:number){const row=this.row(id),profile=this.profiles.get();this.profiles.edit('criteria',{...profile.criteria,hiddenCompanies:[...new Set([...profile.criteria.hiddenCompanies,row.company])]},profile.revision);this.changed();return true;}
  retention(timestamp=Date.now()) {
    this.store.transaction(()=>{this.reassess();for(const row of this.store.db.prepare("SELECT * FROM jobs WHERE status IN ('new','skipped') AND closed_at<?").all(new Date(timestamp-30*86400000).toISOString())){this.fingerprint(this.incoming(row),this.profiles.get().revision,'expired');this.store.db.prepare('DELETE FROM jobs WHERE id=?').run(row.id);}this.store.db.prepare('DELETE FROM fingerprints WHERE last_seen_at<?').run(new Date(timestamp-180*86400000).toISOString());this.store.db.prepare('DELETE FROM http_validators WHERE checked_at<?').run(new Date(timestamp-180*86400000).toISOString());});this.store.db.exec('PRAGMA optimize');
  }
}
