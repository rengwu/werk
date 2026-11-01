import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { Store } from './db/store.ts';
import type { Api, ApiParams, ApiResult, BackendInit, Diagnostics, Events, Settings, UpdateState } from '../shared/api.ts';

export class Service {
  store: Store;
  init: BackendInit;
  startedAt = new Date().toISOString();
  emit: <K extends keyof Events>(event: K, data: Events[K]) => void;
  constructor(init: BackendInit, emit: Service['emit']) {
    this.init = init; this.emit = emit; this.store = new Store(init.dataDir);
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
    };
    if (!Object.hasOwn(handlers, method)) throw new Error('Unknown action.');
    return await handlers[method](params) as ApiResult<K>;
  }
  close() { this.store.close(); }
}
