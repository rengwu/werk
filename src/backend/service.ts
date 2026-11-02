import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { Store } from './db/store.ts';
import { Profiles } from './profile/store.ts';
import { criteriaSchema } from '../shared/profile.ts';
import { jobFilterSchema } from '../shared/jobs.ts';
import { countryOverlaps } from './geo/overlap.ts';
import { AiRuntime } from './ai/runtime.ts';
import { ModelQueue } from './ai/queue.ts';
import { Assistant } from './assistant/service.ts';
import { Jobs } from './sources/jobs.ts';
import { Sources } from './sources/service.ts';
import {Letters} from './letters/store.ts';
import {Cv} from './cv/store.ts';
import {Backups} from './backup/store.ts';
import {MAX_ZIP_BYTES} from './backup/archive.ts';
import {findTectonic} from './cv/runtime.ts';
import type { Api, ApiParams, ApiResult, BackendInit, Diagnostics, Events, Settings, UpdateState } from '../shared/api.ts';

export class Service {
  store: Store;
  init: BackendInit;
  startedAt = new Date().toISOString();
  profiles: Profiles;
  ai: AiRuntime;
  queue: ModelQueue;
  assistant: Assistant;
  jobs:Jobs;sources:Sources;
  letters:Letters;cv:Cv;backups:Backups;activeEdits=0;
  private closing = false;
  private inFlight = new Set<Promise<unknown>>();
  private shutdownPromise?: Promise<void>;
  emit: <K extends keyof Events>(event: K, data: Events[K]) => void;
  constructor(init: BackendInit, emit: Service['emit']) {
    this.init = init; this.emit = emit; this.store = new Store(init.dataDir);
    this.profiles = new Profiles(this.store, () => {this.emit('profile', undefined);this.emit('jobs',undefined);this.emit('sources',undefined);});
    this.jobs=new Jobs(this.store,this.profiles,()=>{this.emit('jobs',undefined);this.emit('sources',undefined);});
    this.profiles.onSave=profile=>{this.jobs.reassess(profile);this.store.db.exec('DELETE FROM http_validators');};
    this.sources=new Sources(this.store,this.profiles,this.jobs,()=>{this.emit('sources',undefined);this.emit('scan',undefined);});
    this.ai = new AiRuntime(init.dataDir, () => this.emit('ai', undefined));
    this.queue = new ModelQueue(this.store, () => { this.emit('tasks', undefined); this.emit('assistant', undefined); this.emit('ai', undefined);this.emit('letters',undefined);this.emit('jobs',undefined); });
    this.letters=new Letters(this.store,this.jobs,this.profiles,this.queue,this.ai,()=>{this.emit('letters',undefined);this.emit('jobs',undefined);});
    this.cv=new Cv(this.store,this.profiles,init.dataDir,()=>this.emit('cv',undefined));
    this.assistant = new Assistant(this.store, this.profiles, this.ai, this.queue, init.dataDir, () => this.emit('assistant', undefined));
    this.assistant.jobs=this.jobs;
    this.assistant.letters=this.letters;this.assistant.cv=this.cv;
    this.backups=new Backups(this);
    this.ai.connected = () => this.queue.resume();
    queueMicrotask(() => this.queue.kick());
    if (init.previousExit !== undefined) this.store.event('warn', 'backend', `Backend restarted after exit ${init.previousExit}.`);
  }
  settings(): Settings { return { appearance: this.store.get('appearance', 'system'),scanInterval:this.store.get('scanInterval',0) }; }
  update(): UpdateState { return this.store.get('update', { state: 'unchecked', checkedAt: null }); }
  diagnostics(): Diagnostics {
    const db = this.store.db;
    db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS temp.fts_probe USING fts5(value)');
    const size = ['werk.db', 'werk.db-wal'].reduce((n, name) => { try { return n + statSync(join(this.init.dataDir, name)).size; } catch { return n; } }, 0);
    return {
      version: this.init.version, electron: this.init.electron, chromium: this.init.chromium, node: process.versions.node,
      sqlite: String(db.prepare('SELECT sqlite_version() AS v').get()?.v), fts5: true,
      schema: Number(db.prepare('PRAGMA user_version').get()?.user_version), databaseBytes: size,
      system: this.init.system, dataFolder: this.init.dataDir.replace(homedir(), '~'),
      model:this.ai.state.model,reasoning:this.ai.state.reasoning,modelWork:this.store.get('aiPause','')|| (this.queue.running?'Running':`${this.queue.list().filter(t=>t.state==='queued').length} queued`),compiler:findTectonic()?(this.cv.active?'Compiling':'Available'):'Unavailable',lastScanAt:this.sources.state().lastScanAt,nextScanAt:this.sources.state().nextScanAt,
      backend: 'running', startedAt: this.startedAt, restartCount: this.init.restartCount, update: this.update(),
      events: db.prepare("SELECT at,level,scope,message FROM events WHERE level IN ('warn','error') ORDER BY id DESC LIMIT 20").all() as Diagnostics['events'],
    };
  }
  async call<K extends keyof Api>(method: K, params: ApiParams<K>): Promise<ApiResult<K>> {
    if (this.closing) throw new Error('werk is stopping.');
    const handlers: { [P in keyof Api]: (input: unknown) => ReturnType<Api[P]> | Promise<ReturnType<Api[P]>> } = {
      'backup.export':()=>this.backups.export(),
      'backup.restore':input=>this.backups.restore(z.object({bytes:z.instanceof(Uint8Array).refine(b=>b.length<=MAX_ZIP_BYTES)}).strict().parse(input).bytes),
      'settings.get': () => this.settings(),
      'settings.set': (input) => { const value = z.object({ appearance: z.enum(['system','light','dark']).optional(),scanInterval:z.union([z.literal(0),z.literal(4),z.literal(12)]).optional() }).strict().parse(input); if(value.appearance)this.store.set('appearance', value.appearance);if(value.scanInterval!==undefined)this.sources.schedule(value.scanInterval); this.emit('settings', undefined); return this.settings(); },
      'diagnostics.get': () => this.diagnostics(),
      'update.get': () => this.update(),
      'profile.get': () => this.profiles.state(),
      'profile.edit': input => { const p=z.object({section:z.string(),value:z.unknown(),expectedRevision:z.number().int().nonnegative()}).strict().parse(input); return this.profiles.edit(p.section,p.value,p.expectedRevision); },
      'profile.restore': input => { const p=z.object({revision:z.number().int().positive(),expectedRevision:z.number().int().nonnegative()}).strict().parse(input); return this.profiles.restore(p.revision,p.expectedRevision); },
      'profile.overlap': input => { const p=z.object({criteria:criteriaSchema}).parse(input); const names=new Intl.DisplayNames(['en'],{type:'region'}); return [...countryOverlaps(p.criteria)].map(([code,hours])=>({code,name:names.of(code)||code,hours})).filter(c=>c.hours>=p.criteria.minOverlapHours).sort((a,b)=>a.name.localeCompare(b.name)); },
      'ai.get': async () => ({ connection: await this.ai.status(), tasks: this.queue.list(), paused: this.store.get('aiPause','') }),
      'ai.login': () => this.ai.login(),
      'ai.callback': input => { this.ai.callback(z.object({value:z.string().min(1).max(8192)}).strict().parse(input).value); return true; },
      'ai.cancel': async () => { await this.ai.cancel(); return true; },
      'ai.logout': async () => { this.queue.running?.controller.abort(); await this.ai.logout(); return true; },
      'tasks.retry': input => { this.queue.retry(z.object({id:z.number().int().positive()}).strict().parse(input).id); return true; },
      'tasks.stop': async input => { const id=z.object({id:z.number().int().positive()}).strict().parse(input).id; if(this.queue.list().find(t=>t.id===id)?.kind==='assistant_turn') await this.assistant.stop();else this.queue.stop(id);return true; },
      'assistant.get': () => this.assistant.state(),
      'assistant.send': input => { const p=z.object({text:z.string().trim().max(100000),attachments:z.array(z.string().uuid()).max(10),context:z.object({page:z.string().max(100),jobId:z.number().int().positive().optional(),document:z.enum(['cv','letter','profile']).optional(),dirty:z.boolean().optional()}).strict(),clientId:z.string().uuid(),mode:z.enum(['steer','interrupt','followUp']).optional()}).strict().refine(p=>p.text.length||p.attachments.length).parse(input);return this.assistant.send(p.text,p.attachments,p.context,p.clientId,p.mode); },
      'assistant.stop': () => this.assistant.stop(),
      'assistant.new': () => this.assistant.newChat(),
      'attachments.add': async input => { const p=z.object({name:z.string().max(250),bytes:z.instanceof(Uint8Array).refine(b=>b.byteLength<=32*1024*1024)}).strict().parse(input);return this.assistant.attachments.add(this.assistant.chatId(),p.name,p.bytes); },
      'attachments.remove': async input => { await this.assistant.attachments.remove(z.object({id:z.string().uuid()}).strict().parse(input).id,this.assistant.chatId());return true; },
      'sources.get':()=>this.sources.list(),
      'sources.enable':input=>{const p=z.object({id:z.number().int().positive(),enabled:z.boolean()}).strict().parse(input);return this.sources.enable(p.id,p.enabled);},
      'sources.add':input=>this.sources.add(z.object({value:z.string().trim().min(1).max(1500),name:z.string().trim().max(120).optional(),kind:z.enum(['greenhouse','ashby','lever','rss','catalog']).optional()}).strict().parse(input)),
      'scan.get':()=>this.sources.state(),
      'scan.start':input=>this.sources.start(z.object({id:z.number().int().positive().optional()}).strict().parse(input).id),
      'jobs.list':input=>this.jobs.list(jobFilterSchema.parse(input)),
      'jobs.locations':()=>this.jobs.locations(),
      'jobs.get':input=>this.jobs.get(z.object({id:z.number().int().positive()}).strict().parse(input).id),
      'jobs.open':input=>this.jobs.open(z.object({id:z.number().int().positive()}).strict().parse(input).id),
      'jobs.status':input=>{const p=z.object({id:z.number().int().positive(),status:z.enum(['new','skipped','saved','applied'])}).strict().parse(input);return this.jobs.status(p.id,p.status);},
      'jobs.notes':input=>{const p=z.object({id:z.number().int().positive(),notes:z.string().max(40000)}).strict().parse(input);return this.jobs.notes(p.id,p.notes);},
      'jobs.description':input=>{const p=z.object({id:z.number().int().positive(),description:z.string().trim().min(80).max(150000)}).strict().parse(input);return this.jobs.description(p.id,p.description);},
      'jobs.hideCompany':input=>this.jobs.hideCompany(z.object({id:z.number().int().positive()}).strict().parse(input).id),
      'letters.get':input=>this.letters.state(z.object({id:z.number().int().positive()}).strict().parse(input).id),
      'letters.edit':input=>{const p=z.object({id:z.number().int().positive(),body:z.string().trim().min(1).max(40000),expectedVersion:z.number().int().nonnegative()}).strict().parse(input);return this.letters.edit(p.id,p.body,p.expectedVersion);},
      'letters.restore':input=>{const p=z.object({id:z.number().int().positive(),version:z.number().int().positive(),expectedVersion:z.number().int().nonnegative()}).strict().parse(input);return this.letters.restore(p.id,p.version,p.expectedVersion);},
      'letters.generate':input=>this.letters.enqueue(z.object({id:z.number().int().positive()}).strict().parse(input).id),
      'cv.get':()=>this.cv.state(),
      'cv.generate':input=>this.cv.generate(z.object({expectedVersion:z.number().int().nonnegative()}).strict().parse(input).expectedVersion),
      'cv.edit':input=>{const p=z.object({source:z.string().min(1).max(2*1024*1024),expectedVersion:z.number().int().nonnegative()}).strict().parse(input);return this.cv.edit(p.source,p.expectedVersion);},
      'cv.restore':input=>{const p=z.object({version:z.number().int().positive(),expectedVersion:z.number().int().nonnegative()}).strict().parse(input);return this.cv.restore(p.version,p.expectedVersion);},
      'cv.compile':input=>this.cv.compile(z.object({version:z.number().int().positive()}).strict().parse(input).version),
      'cv.pdf':input=>this.cv.pdf(z.object({version:z.number().int().positive()}).strict().parse(input).version),
    };
    if (!Object.hasOwn(handlers, method)) throw new Error('Unknown action.');
    const edit=!/\.(?:get|list|pdf|overlap)$/.test(method)&&!method.startsWith('backup.');
    if(edit)this.activeEdits++;
    let request: Promise<unknown> | undefined;
    try {
      request = Promise.resolve(handlers[method](params)); this.inFlight.add(request);
      return await request as ApiResult<K>;
    } finally { if(request)this.inFlight.delete(request);if(edit)this.activeEdits--; }
  }
  shutdown() {
    return this.shutdownPromise ??= (async () => {
      this.closing = true;
      this.sources.close(); this.queue.close(); this.cv.close();
      await Promise.allSettled([this.assistant.stop(), this.queue.active, this.sources.active, this.cv.active, this.ai.cancel(), ...this.inFlight]);
      this.close();
    })();
  }
  close() { this.sources.close();this.queue.close();this.assistant.close();this.cv.close(); void this.ai.cancel(); this.store.close(); }
}
