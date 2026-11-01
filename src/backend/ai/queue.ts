import type { Store } from '../db/store.ts';
import type { Task } from '../../shared/ai.ts';
import { AiUnavailable } from './runtime.ts';
export class ModelQueue {
  store: Store;
  notify: () => void;
  handlers: Partial<Record<Task['kind'], (task: Task, signal: AbortSignal) => Promise<void>>> = {};
  running?: { id: number; controller: AbortController };
  active?: Promise<void>;
  closed = false;
  constructor(store: Store, notify: () => void) {
    this.store = store; this.notify = notify;
    store.db.prepare("UPDATE tasks SET state='paused',error=?,updated_at=? WHERE state='running'").run('Interrupted by a restart. Retry to continue.', new Date().toISOString());
  }
  list(): Task[] { return this.store.db.prepare('SELECT id,kind,subject,state,input,error,created_at AS createdAt,updated_at AS updatedAt FROM tasks ORDER BY id DESC LIMIT 100').all() as Task[]; }
  enqueue(kind: Task['kind'], subject: string, input: unknown, idempotencyKey: string) {
    const at = new Date().toISOString();
    this.store.db.prepare("INSERT INTO tasks(kind,subject,state,input,idempotency_key,created_at,updated_at) VALUES(?,?,'queued',?,?,?,?) ON CONFLICT(idempotency_key) DO NOTHING").run(kind,subject,JSON.stringify(input),idempotencyKey,at,at);
    return Number(this.store.db.prepare('SELECT id FROM tasks WHERE idempotency_key=?').get(idempotencyKey)!.id);
  }
  kick() { this.notify(); void this.pump(); }
  async pump() {
    if (this.closed || this.running || this.store.get('aiPause', '')) return;
    const task = this.store.db.prepare("SELECT id,kind,subject,state,input,error,created_at AS createdAt,updated_at AS updatedAt FROM tasks WHERE state='queued' ORDER BY id LIMIT 1").get() as Task | undefined; if (!task) return;
    const handler = this.handlers[task.kind]; if (!handler) return;
    this.running = { id: task.id, controller: new AbortController() };
    const signal = this.running.controller.signal;
    this.setState(task.id,'running',null);
    try { this.active = Promise.resolve().then(() => handler(task,signal)); await this.active; signal.throwIfAborted(); if (!this.closed) this.setState(task.id,'done',null); }
    catch (error) {
      if (!this.closed) {
        const message = signal.aborted ? 'Stopped.' : error instanceof Error ? error.message : 'The task failed.';
        if (error instanceof AiUnavailable) this.store.set('aiPause', message);
        this.setState(task.id,error instanceof AiUnavailable ? 'paused' : 'failed',message);
      }
    } finally { this.active = undefined; this.running = undefined; if (!this.closed) this.kick(); }
  }
  setState(id: number, state: Task['state'], error: string | null) { this.store.db.prepare('UPDATE tasks SET state=?,error=?,updated_at=? WHERE id=?').run(state,error,new Date().toISOString(),id); this.notify(); }
  retry(id: number) {
    const task = this.list().find(t => t.id === id);
    if (!task || !['failed','paused'].includes(task.state)) throw new Error('This task cannot be retried.');
    this.store.set('aiPause',''); this.setState(id,'queued',null); this.kick();
  }
  resume() { this.store.set('aiPause',''); this.store.db.exec("UPDATE tasks SET state='queued',error=NULL WHERE state='paused'"); this.kick(); }
  stop(id: number) { if (this.running?.id === id) this.running.controller.abort(); else this.store.db.prepare("UPDATE tasks SET state='failed',error='Stopped.' WHERE id=? AND state IN ('queued','paused')").run(id); this.notify(); }
  close() { this.closed = true; this.running?.controller.abort(); }
}
