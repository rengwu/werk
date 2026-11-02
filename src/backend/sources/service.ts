import type { Store } from '../db/store.ts';
import type { Profiles } from '../profile/store.ts';
import type { Jobs } from './jobs.ts';
import type { Source } from './types.ts';
import type { ScanState,SourceRecord } from '../../shared/jobs.ts';
import { discoverySources } from './catalog.ts';
import { boardFor } from './boards/catalog.ts';
import { collect } from './connectors.ts';
import { configureHttp,readUrl,publicUrl,FetchError,RequestLimitError,NotModified,type FetchContext } from '../http.ts';
import { authoritativeSources } from '../matching/job-quality.ts';
import { profileReadiness } from '../profile/facts.ts';

const HOUR=3600000,now=()=>new Date().toISOString();
export function sourcePolicy(source:Pick<Source,'type'|'identifier'|'intervalHours'>){let minimum=4;if(source.type==='himalayas'||source.type==='workingnomads')minimum=24;if(source.type==='remotive')minimum=6;if(source.type==='public_board')minimum=12;if(source.type==='rss'&&['https://jobs.wordpress.net/feed/','https://www.remotejobs.com/jobs.rss'].includes(source.identifier))minimum=24;return{hours:Math.max(minimum,source.intervalHours||4),dailyCap:Math.min(6,Math.floor(24/minimum))};}
export class Sources {
  store:Store;profiles:Profiles;jobs:Jobs;changed:()=>void;timer:ReturnType<typeof setInterval>;
  running=false;closed=false;source:string|null=null;requests=0;kept=0;controller?:AbortController;active?:Promise<void>;
  read:typeof readUrl;
  constructor(store:Store,profiles:Profiles,jobs:Jobs,changed:()=>void,read:typeof readUrl=readUrl){
    this.store=store;this.profiles=profiles;this.jobs=jobs;this.changed=changed;this.read=read;configureHttp(store);
    // Add missing catalog entries on upgrades without replacing user choices,
    // source identities, cooldowns, custom sources or existing job provenance.
    store.transaction(()=>{for(const source of discoverySources)store.db.prepare('INSERT INTO sources(kind,identifier,name,enabled,config) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').run(source.type,source.identifier,source.name,Number(source.enabled),JSON.stringify({requestLimit:source.requestLimit,intervalHours:source.intervalHours}));});
    this.timer=setInterval(()=>this.tick(),30000);this.timer.unref();
  }
  list():SourceRecord[]{return this.store.db.prepare(`SELECT s.id,s.kind,s.identifier,s.name,s.enabled,s.last_scan_at AS lastScanAt,s.last_result AS lastResult,s.last_error AS lastError,s.next_scan_at AS nextScanAt,count(DISTINCT j.id) AS kept,count(DISTINCT CASE WHEN j.status IN ('saved','applied') THEN j.id END) AS saved FROM sources s LEFT JOIN job_listings l ON l.source_id=s.id LEFT JOIN jobs j ON j.id=l.job_id GROUP BY s.id ORDER BY s.name COLLATE NOCASE,s.id`).all().map(row=>({...row,enabled:!!row.enabled})) as SourceRecord[];}
  state():ScanState{return{running:this.running,source:this.source,requests:this.requests,kept:this.kept,lastScanAt:this.store.get('lastScanAt',null),nextScanAt:this.store.get('scanInterval',0)?this.store.get('nextScanAt',null):null,firstScanCompleted:this.store.get('firstScanCompleted',false)};}
  sourceRecord(id:number):Source {
    const row=this.store.db.prepare('SELECT * FROM sources WHERE id=?').get(id);if(!row)throw new Error('Source not found.');
    return {...JSON.parse(String(row.config)),id:String(row.id),type:row.kind,identifier:row.identifier,name:row.name,enabled:!!row.enabled,checkpoint:JSON.parse(String(row.checkpoint)),state:row.last_result||'ready',lastRunAt:row.last_scan_at,nextRunAt:row.next_scan_at,lastError:row.last_error,jobCount:0} as Source;
  }
  enable(id:number,enabled:boolean){this.sourceRecord(id);this.store.db.prepare('UPDATE sources SET enabled=? WHERE id=?').run(Number(enabled),id);this.changed();return this.list();}
  async add(input:{value:string;name?:string;kind?:'greenhouse'|'ashby'|'lever'|'rss'|'catalog'}) {
    let type:Source['type']=input.kind==='catalog'?'public_board':input.kind||'rss',identifier=input.value.trim(),name=input.name?.trim()||'';
    if(type==='public_board'){name=boardFor(identifier).name;}
    else if(/^https?:\/\//i.test(identifier)){
      const url=await publicUrl(identifier),parts=url.pathname.split('/').filter(Boolean);
      if(/^(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io$/.test(url.hostname)){type='greenhouse';identifier=parts[0]||'';}
      else if(url.hostname==='jobs.ashbyhq.com'){type='ashby';identifier=parts[0]||'';}
      else if(/^jobs(?:\.eu)?\.lever\.co$/.test(url.hostname)){type='lever';identifier=parts[0]||'';}
      else {type='rss';identifier=url.href;if(/\/(?:apply|application|submit|send|login|logout|oauth)(?:\/|$)/i.test(url.pathname))throw new Error('Use a public job feed or company board URL.');}
      name ||= type==='rss'?url.hostname:identifier;
    }else if(type==='rss')throw new Error('Enter a public RSS or Atom URL.');
    if(['greenhouse','ashby','lever'].includes(type)&&!(/^[\w-]{1,100}$/.test(identifier)))throw new Error('Enter the company board URL or slug.');
    name ||= identifier;
    this.store.db.prepare('INSERT INTO sources(kind,identifier,name,enabled,config) VALUES(?,?,?,1,?) ON CONFLICT(kind,identifier) DO UPDATE SET enabled=1').run(type,identifier,name,JSON.stringify({requestLimit:type==='public_board'?12:type==='lever'?10:2,intervalHours:type==='public_board'?12:6}));this.changed();return this.list();
  }
  schedule(hours:0|4|12){this.store.set('scanInterval',hours);this.store.set('nextScanAt',hours?new Date(Date.now()+hours*HOUR).toISOString():null);this.changed();}
  start(id?:number){if(this.closed)throw new Error('werk is stopping.');if(this.running)return this.state();if(!profileReadiness(this.profiles.get()).ready)throw new Error('Complete your profile and search criteria before scanning.');
    const ids=id?[id]:this.list().filter(s=>s.enabled).map(s=>s.id);if(!ids.length)throw new Error('Enable a source before scanning.');
    this.running=true;this.requests=0;this.kept=0;this.controller=new AbortController();this.active=this.scan(ids).finally(()=>{if(this.closed)return;this.running=false;this.source=null;this.changed();this.jobs.changed();});this.changed();return this.state();
  }
  async scan(ids:number[]){let scanned=0;try{for(const id of ids){if(this.closed)break;const source=this.sourceRecord(id);if(!source.enabled)continue;
    if(source.nextRunAt&&Date.parse(source.nextRunAt)>Date.now())continue;
    const policy=sourcePolicy(source),date=now().slice(0,10),daily=source.checkpoint._day===date?Number(source.checkpoint._scans||0):0;if(daily>=policy.dailyCap)continue;
    scanned++;this.source=source.name;this.changed();const start=now(),counters={_day:date,_scans:daily+1};
    const save=(checkpoint:Record<string,unknown>)=>{if(!this.closed){source.checkpoint={...checkpoint,...counters};this.store.db.prepare('UPDATE sources SET checkpoint=? WHERE id=?').run(JSON.stringify(source.checkpoint),id);}};
    save(source.checkpoint);
    const ctx:FetchContext={requests:0,limit:source.requestLimit,signal:this.controller!.signal,onRequest:()=>{this.requests++;this.changed();}};
    let result='Complete',error:string|null=null,next=Date.now()+policy.hours*HOUR;
    try{
      if(source.type==='himalayas'&&source.identifier==='profile')source.identifier=this.profiles.get().criteria.targetRoles.slice(0,10).join('|');
      await collect(source,ctx,item=>{if(this.closed)return;const kept=this.store.transaction(()=>this.jobs.ingest(source,item));if(kept)this.kept++;},save,this.read);
      if(authoritativeSources.has(source.type))this.store.transaction(()=>this.jobs.finishSnapshot(source,ctx.snapshotStartedAt||start));
    }catch(e){
      if(this.closed)break;
      if(e instanceof NotModified){result='Unchanged';if(ctx.requests===1&&authoritativeSources.has(source.type)&&!Number(source.checkpoint.skip||0))this.store.db.prepare('UPDATE job_listings SET last_seen_at=? WHERE source_id=?').run(now(),id);}
      else if(e instanceof RequestLimitError)result='Request limit; resumes next scan';
      else {result='Failed';error=e instanceof FetchError||e instanceof Error&&/Unexpected |public |job |Source |RSS|XML|response|vacancy|description|page|JSON/i.test(e.message)?String((e as Error).message).slice(0,300):'The source could not be read. Retry after its cooldown.';const failures=Number(source.checkpoint._failures||0)+1;save({...source.checkpoint,_failures:failures});next=Math.max(next,Date.now()+Math.min(7*86400000,2**Math.min(failures,8)*HOUR),Date.now()+(e instanceof FetchError?e.retryAfterMs:0));for(const url of ctx.urls||[])this.store.db.prepare('DELETE FROM http_validators WHERE url=?').run(url);this.store.event('warn','source',`Source ${id} failed${e instanceof FetchError&&e.status?` (HTTP ${e.status})`:''}.`);}
    }
    if(this.closed)break;
    if(!error)save({...source.checkpoint,_failures:0});
    this.store.db.prepare('UPDATE sources SET last_scan_at=?,last_result=?,last_error=?,next_scan_at=? WHERE id=?').run(now(),result,error,new Date(next).toISOString(),id);this.changed();this.jobs.changed();
  }}finally{if(!this.closed){if(scanned){this.store.set('firstScanCompleted',true);this.store.set('lastScanAt',now());}const hours=this.store.get('scanInterval',0);this.store.set('nextScanAt',hours?new Date(Date.now()+hours*HOUR).toISOString():null);}}
  }
  tick(){if(this.closed)return;const day=now().slice(0,10);if(!this.running&&this.store.get('retentionDay','')!==day){try{this.jobs.retention();this.store.set('retentionDay',day);this.jobs.changed();}catch{this.store.event('warn','retention','Daily maintenance could not finish.');}}if(!this.running&&this.store.get('scanInterval',0)&&Date.parse(this.store.get('nextScanAt',''))<=Date.now()&&profileReadiness(this.profiles.get()).ready)this.start();}
  close(){this.closed=true;clearInterval(this.timer);this.controller?.abort();}
}
