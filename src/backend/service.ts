import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { Store } from './db/store.ts';
import { Profiles } from './profile/store.ts';
import { criteriaSchema } from '../shared/profile.ts';
import { countryOverlaps } from './geo/overlap.ts';
import { AiRuntime } from './ai/runtime.ts';
import { ModelQueue } from './ai/queue.ts';
import { Assistant } from './assistant/service.ts';
import type { Api, ApiParams, ApiResult, BackendInit, Diagnostics, Events, Settings, UpdateState } from '../shared/api.ts';

export class Service {
  store: Store;
  init: BackendInit;
  startedAt = new Date().toISOString();
  profiles: Profiles;
  ai: AiRuntime;
  queue: ModelQueue;
  assistant: Assistant;
  emit: <K extends keyof Events>(event: K, data: Events[K]) => void;
  constructor(init: BackendInit, emit: Service['emit']) {
    this.init = init; this.emit = emit; this.store = new Store(init.dataDir);
    this.profiles = new Profiles(this.store, () => this.emit('profile', undefined));
    this.ai = new AiRuntime(init.dataDir, () => this.emit('ai', undefined));
    this.queue = new ModelQueue(this.store, () => { this.emit('tasks', undefined); this.emit('assistant', undefined); this.emit('ai', undefined); });
    this.assistant = new Assistant(this.store, this.profiles, this.ai, this.queue, init.dataDir, () => this.emit('assistant', undefined));
    this.ai.connected = () => this.queue.resume();
    queueMicrotask(() => this.queue.kick());
    if (init.previousExit !== undefined) this.store.event('warn', 'backend', `Backend restarted after exit ${init.previousExit}.`);
  }
  settings(): Settings { return { appearance: this.store.get('appearance', 'system') }; }
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
      backend: 'running', startedAt: this.startedAt, restartCount: this.init.restartCount, update: this.update(),
      events: db.prepare("SELECT at,level,scope,message FROM events WHERE level IN ('warn','error') ORDER BY id DESC LIMIT 20").all() as Diagnostics['events'],
    };
  }
  async call<K extends keyof Api>(method: K, params: ApiParams<K>): Promise<ApiResult<K>> {
    const handlers: { [P in keyof Api]: (input: unknown) => ReturnType<Api[P]> | Promise<ReturnType<Api[P]>> } = {
      'settings.get': () => this.settings(),
      'settings.set': (input) => { const value = z.object({ appearance: z.enum(['system','light','dark']) }).strict().parse(input); this.store.set('appearance', value.appearance); this.emit('settings', undefined); return this.settings(); },
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
      'tasks.stop': input => { this.queue.stop(z.object({id:z.number().int().positive()}).strict().parse(input).id); return true; },
      'assistant.get': () => this.assistant.state(),
      'assistant.send': input => { const p=z.object({text:z.string().trim().min(1).max(40000),attachments:z.array(z.string().uuid()).max(5),context:z.object({page:z.string().max(100),jobId:z.number().int().positive().optional(),document:z.enum(['cv','letter','profile']).optional(),dirty:z.boolean().optional()}).strict(),clientId:z.string().uuid()}).strict().parse(input);return this.assistant.send(p.text,p.attachments,p.context,p.clientId); },
      'assistant.new': () => this.assistant.newChat(),
      'attachments.add': async input => { const p=z.object({name:z.string().max(250),bytes:z.instanceof(Uint8Array).refine(b=>b.byteLength<=10*1024*1024)}).strict().parse(input);return this.assistant.attachments.add(this.assistant.chatId(),p.name,p.bytes); },
      'attachments.remove': async input => { await this.assistant.attachments.remove(z.object({id:z.string().uuid()}).strict().parse(input).id,this.assistant.chatId());return true; },
    };
    if (!Object.hasOwn(handlers, method)) throw new Error('Unknown action.');
    return await handlers[method](params) as ApiResult<K>;
  }
  close() { this.queue.close(); void this.ai.cancel(); this.store.close(); }
}
