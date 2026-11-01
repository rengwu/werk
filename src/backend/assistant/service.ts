import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { Store } from '../db/store.ts';
import type { Profiles } from '../profile/store.ts';
import { AiUnavailable, inferenceError, type AiRuntime } from '../ai/runtime.ts';
import type { ModelQueue } from '../ai/queue.ts';
import type { AssistantContext, ChatMessage, ChatState, Receipt, SendMode, Task } from '../../shared/ai.ts';
import type { Evidence } from '../profile/edits.ts';
import { Attachments } from './attachments.ts';
import type { Jobs } from '../sources/jobs.ts';
import type { Cv } from '../cv/store.ts';
import type { Letters } from '../letters/store.ts';
import { appTools } from './tools.ts';
import { builtinNames, createSession, type AgentSession } from './session.ts';

type TurnInput = { messageId: number; context: AssistantContext; mode?: SendMode; delivered?: boolean };
const resultText = (result: { content?: Array<{ type: string; text?: string }> }) => result.content?.filter(c => c.type === 'text').map(c => c.text || '').join('\n') || '';
export class Assistant {
  store: Store; profiles: Profiles; ai: AiRuntime; queue: ModelQueue; attachments: Attachments; notify: () => void; dataDir: string;
  jobs?: Jobs; cv?: Cv; letters?: Letters;
  session?: AgentSession; sessionChat?: string; active?: Promise<void>; activeTask?: number;
  context: AssistantContext = { page: 'Profile' };
  activity?: string; closed = false;
  toolNames = [...builtinNames, 'read_url', 'web_search', 'read_profile', 'edit_profile', 'search_jobs', 'read_job', 'read_cv', 'generate_cv', 'edit_cv', 'compile_cv', 'read_letter', 'rewrite_letter'];
  private currentMessage?: number;
  private toolMessages = new Map<string, number>();
  private injected = new Set<number>();
  private notifyTimer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: () => void;
  constructor(store: Store, profiles: Profiles, ai: AiRuntime, queue: ModelQueue, dataDir: string, notify: () => void) {
    this.store = store; this.profiles = profiles; this.ai = ai; this.queue = queue; this.dataDir = dataDir; this.notify = notify;
    process.env.PI_CODING_AGENT_DIR = join(dataDir, 'pi');
    this.attachments = new Attachments(store, dataDir);
    queue.handlers.assistant_turn = (task, signal) => {
      const active = this.turn(task, signal); this.active = active;
      return active.finally(() => { if (this.active === active) this.active = undefined; });
    };
    // A utility-process exit can interrupt a streamed response or a shell call.
    for (const row of store.db.prepare('SELECT id,content FROM assistant_messages').all()) {
      const value = JSON.parse(String(row.content)) as ChatMessage;
      let changed = false;
      for (const tool of value.tools || []) if (tool.state === 'running') { tool.state = 'stopped'; changed = true; }
      if (changed) store.db.prepare('UPDATE assistant_messages SET content=? WHERE id=?').run(JSON.stringify(value), row.id);
    }
  }
  chatId() { let id = this.store.get('chatId', ''); if (!id) { id = randomUUID(); this.store.set('chatId', id); } return id; }
  state(): ChatState {
    const chatId = this.chatId();
    const messages = this.store.db.prepare('SELECT id,role,content,created_at AS createdAt FROM assistant_messages WHERE chat_id=? ORDER BY id').all(chatId).map(row => ({ id: Number(row.id), role: row.role, ...JSON.parse(String(row.content)), createdAt: String(row.createdAt) })) as ChatMessage[];
    return { chatId, messages, tasks: this.queue.list().filter(t => t.kind === 'assistant_turn' && t.subject === chatId), cwd: homedir(), tools: this.toolNames, pendingAttachments: this.attachments.list(chatId).filter(a=>a.messageId===null), activity: this.activity };
  }
  private changed(immediate = false) {
    if (this.closed) return;
    if (immediate) { clearTimeout(this.notifyTimer); this.notifyTimer = undefined; this.notify(); }
    else if (!this.notifyTimer) this.notifyTimer = setTimeout(() => { this.notifyTimer = undefined; if (!this.closed) this.notify(); }, 75);
  }
  private update(id: number, mutate: (message: ChatMessage) => void) {
    if (this.closed) return;
    const row = this.store.db.prepare('SELECT content FROM assistant_messages WHERE id=?').get(id); if (!row) return;
    const message = JSON.parse(String(row.content)) as ChatMessage; mutate(message);
    this.store.db.prepare('UPDATE assistant_messages SET content=? WHERE id=?').run(JSON.stringify(message), id); this.changed();
  }
  receipt(value: Receipt) { if (this.currentMessage) this.update(this.currentMessage, message => message.receipts.push(value)); }
  assertEditable(document: AssistantContext['document']) {
    if (this.context.dirty && this.context.document === document) throw new Error(`The user has unsaved ${document} edits. Ask them to save or discard those before changing this record.`);
  }
  addEvidence(source: Evidence) {
    if (this.closed) throw new Error('The session is closed.');
    this.store.db.prepare('INSERT INTO assistant_evidence(chat_id,id,text,name,url) VALUES(?,?,?,?,?) ON CONFLICT(chat_id,id) DO UPDATE SET text=excluded.text,name=excluded.name,url=excluded.url').run(this.chatId(), source.id, source.text, source.name || null, source.url || null);
    return source;
  }
  evidence(): Evidence[] {
    return [
      ...this.state().messages.filter(m => m.role === 'user').map(m => ({ id: `chat:${m.id}`, text: m.text })),
      ...this.store.db.prepare('SELECT id,text,name,url FROM assistant_evidence WHERE chat_id=?').all(this.chatId()).map(row=>({id:String(row.id),text:String(row.text),name:row.name?String(row.name):undefined,url:row.url?String(row.url):undefined})),
      ...this.profiles.get().sources.filter(s => s.description).map(s => ({ id: s.id, text: s.description!, url: s.url })),
    ];
  }
  private async payload(messageId: number, context: AssistantContext) {
    const message = this.state().messages.find(m => m.id === messageId); if (!message) throw new Error('Message not found.');
    const attachments = await this.attachments.context(this.chatId(), messageId);
    for (const source of attachments.sources) this.addEvidence(source);
    return {
      text: `[werk-message-id:${messageId}]\nApp context: ${JSON.stringify(context)}\nUser evidence ID: chat:${messageId}\n${message.text}\n${attachments.sources.length ? `\nAttached files (user evidence):\n${JSON.stringify(attachments.sources)}` : ''}`,
      images: attachments.images.map(i => ({ type: 'image' as const, data: i.data, mimeType: i.mediaType })),
    };
  }
  async send(text: string, attachmentIds: string[], context: AssistantContext, clientId: string, mode: SendMode = 'steer') {
    const duplicate = this.store.db.prepare('SELECT id FROM tasks WHERE idempotency_key=?').get(`message:${clientId}`); if (duplicate) return Number(duplicate.id);
    if (mode === 'interrupt') await this.stop();
    const chatId = this.chatId();
    let messageId = 0;
    const taskId = this.store.transaction(() => {
      messageId = Number(this.store.db.prepare("INSERT INTO assistant_messages(chat_id,role,content,created_at) VALUES(?,'user','{}',?)").run(chatId, new Date().toISOString()).lastInsertRowid);
      const attachments = this.attachments.bind(attachmentIds, messageId, chatId);
      this.store.db.prepare('UPDATE assistant_messages SET content=? WHERE id=?').run(JSON.stringify({ text: text || 'Read the attached files.', attachments, receipts: [], pending: true }), messageId);
      return this.queue.enqueue('assistant_turn', chatId, { messageId, context, mode }, `message:${clientId}`);
    });
    this.changed(true);
    // Persist each input before handing it to pi. A crash leaves a resumable task.
    if (this.session?.isStreaming && this.activeTask && !this.queue.running?.controller.signal.aborted) {
      const payload = await this.payload(messageId, context);
      // The previous run may have settled while an attachment was being read.
      if (this.session.isStreaming && this.activeTask) {
        this.injected.add(taskId); this.queue.setState(taskId, 'running', null);
        try {
          if (mode === 'followUp') await this.session.followUp(payload.text, payload.images);
          else await this.session.steer(payload.text, payload.images);
        } catch (error) { this.injected.delete(taskId); this.queue.setState(taskId, 'queued', null); throw error; }
      }
    }
    this.queue.kick(); return taskId;
  }
  async stop() {
    const chat = this.chatId();
    for (const task of this.queue.list().filter(t => t.kind === 'assistant_turn' && t.subject === chat && ['queued', 'running', 'paused'].includes(t.state))) {
      this.queue.stop(task.id);
      if (this.queue.running?.id !== task.id) this.queue.setState(task.id, 'failed', 'Stopped.');
    }
    this.session?.clearQueue(); await this.session?.abort(); await this.active?.catch(() => {});
    this.changed(true); return true;
  }
  async newChat() {
    const chat = this.chatId(); await this.stop(); this.unsubscribe?.(); this.session?.dispose(); this.session = undefined; this.sessionChat = undefined;
    const file = this.store.get(`piSession:${chat}`, ''); if (file) rmSync(file, { force: true });
    this.store.set(`piSession:${chat}`, '');
    await this.attachments.clear(chat);
    this.store.db.prepare('DELETE FROM assistant_messages WHERE chat_id=?').run(chat);
    this.store.db.prepare('DELETE FROM assistant_evidence WHERE chat_id=?').run(chat);
    this.store.set('chatId', randomUUID()); this.currentMessage = undefined; this.toolMessages.clear();
    this.changed(true); return this.state();
  }
  private async ensureSession(chatId: string) {
    if (this.session && this.sessionChat === chatId) return this.session;
    this.unsubscribe?.(); this.session?.dispose();
    const file = this.store.get(`piSession:${chatId}`, '');
    const history = this.state().messages.map(message => ({...message, text: message.text + (message.attachments.length ? `\nAttached local files: ${message.attachments.map(a=>this.attachments.path(a)).join(', ')}` : '')}));
    const session = await createSession({ ai: this.ai, dataDir: this.dataDir, chatId, file: file && existsSync(file) ? file : undefined, history, tools: await appTools(this) });
    if (this.closed) { session.dispose(); throw new Error('The session is closed.'); }
    this.session = session; this.sessionChat = chatId; this.toolNames = session.getActiveToolNames();
    this.store.set(`piSession:${chatId}`, session.sessionManager.getSessionFile());
    this.unsubscribe = session.subscribe(event => this.event(event));
    return session;
  }
  private event(event: AgentSessionEvent) {
    if (this.closed) return;
    if (event.type === 'message_start' && event.message.role === 'assistant') {
      this.activity = 'Working…';
      this.currentMessage = Number(this.store.db.prepare("INSERT INTO assistant_messages(chat_id,role,content,created_at) VALUES(?,'assistant',?,?)").run(this.chatId(), JSON.stringify({ text: '', attachments: [], receipts: [], tools: [] }), new Date().toISOString()).lastInsertRowid);
      this.changed();
    } else if ((event.type === 'message_update' || event.type === 'message_end') && event.message.role === 'assistant') {
      const message = event.message;
      if (this.currentMessage) this.update(this.currentMessage, row => { row.text = message.content.filter(c => c.type === 'text').map(c => c.text).join('\n'); });
    } else if (event.type === 'message_end' && event.message.role === 'user') {
      const text = typeof event.message.content === 'string' ? event.message.content : resultText({ content: event.message.content });
      const id = Number(text.match(/^\[werk-message-id:(\d+)\]/)?.[1]);
      if (id) {
        this.update(id, message => { message.pending = false; });
        for (const task of this.queue.list().filter(t => t.kind === 'assistant_turn' && t.subject === this.chatId())) {
          const input = JSON.parse(task.input) as TurnInput;
          if (input.messageId === id) { input.delivered = true; this.context = input.context; this.store.db.prepare('UPDATE tasks SET input=? WHERE id=?').run(JSON.stringify(input), task.id); break; }
        }
      }
    } else if (event.type === 'tool_execution_start') {
      this.activity = `Running ${event.toolName}…`;
      if (this.currentMessage) {
        this.toolMessages.set(event.toolCallId, this.currentMessage);
        this.update(this.currentMessage, message => message.tools!.push({ id: event.toolCallId, name: event.toolName, input: event.args, output: '', state: 'running' }));
      }
    } else if (event.type === 'tool_execution_update' || event.type === 'tool_execution_end') {
      const id = this.toolMessages.get(event.toolCallId), ended = event.type === 'tool_execution_end';
      const result = ended ? event.result : event.partialResult;
      const output = resultText(result);
      if (id) this.update(id, message => {
        const tool = message.tools?.find(t => t.id === event.toolCallId); if (!tool) return;
        tool.output = output.slice(-50000);
        if (ended) { tool.state = event.isError ? 'failed' : 'done'; tool.durationMs = event.durationMs; }
      });
      if (ended && !event.isError && ['bash', 'powershell'].includes(event.toolName)) this.addEvidence({ id: `tool:${event.toolCallId}`, name: event.toolName, text: output });
    } else if (event.type === 'compaction_start') { this.activity = 'Compacting conversation…'; this.changed(); }
    else if (event.type === 'compaction_end') { this.activity = 'Working…'; this.changed(); }
  }
  async turn(task: Task, signal: AbortSignal) {
    const input = JSON.parse(task.input) as TurnInput;
    if (this.chatId() !== task.subject) throw new Error('This chat has been cleared.');
    this.activeTask = task.id; this.context = input.context; this.activity = 'Starting session…'; this.changed(true);
    let failure: unknown;
    const abort = () => { this.session?.clearQueue(); void this.session?.abort(); };
    try {
      const session = await this.ensureSession(task.subject); signal.throwIfAborted();
      signal.addEventListener('abort', abort, { once: true });
      const payload = await this.payload(input.messageId, input.context); signal.throwIfAborted();
      // Retry is an explicit user action. Keep previous tool results and saved
      // changes in context so pi can resume without repeating completed work.
      await session.prompt(payload.text + (input.delivered ? '\nThe user requested a retry of this interrupted request. Continue from existing results; do not repeat completed changes.' : ''), { images: payload.images, expandPromptTemplates: false });
      await session.waitForIdle(); signal.throwIfAborted();
      const last = [...session.messages].reverse().find(m => m.role === 'assistant');
      if (last?.role === 'assistant' && last.stopReason === 'error') {
        const message = inferenceError(last.errorMessage || '');
        this.ai.state = { ...this.ai.state, state: 'unavailable', message }; this.ai.notify(); throw new AiUnavailable(message);
      }
    } catch (error) { failure = error; throw error; }
    finally {
      signal.removeEventListener('abort', abort);
      if (!this.closed) {
        for (const id of this.injected) {
          const row = this.queue.list().find(t => t.id === id); if (!row) continue;
          const delivered = (JSON.parse(row.input) as TurnInput).delivered;
          this.queue.setState(id, signal.aborted ? 'failed' : failure instanceof AiUnavailable ? 'paused' : failure ? 'failed' : delivered ? 'done' : 'queued', signal.aborted ? 'Stopped.' : failure ? (failure as Error).message : null);
        }
        for (const message of this.state().messages) if (message.tools?.some(t => t.state === 'running')) this.update(message.id, row => { for (const tool of row.tools || []) if (tool.state === 'running') tool.state = 'stopped'; });
      }
      this.injected.clear(); this.activeTask = undefined; this.activity = undefined; this.changed(true);
    }
  }
  resetSession() {
    clearTimeout(this.notifyTimer); this.unsubscribe?.(); this.session?.dispose();
    this.session=undefined; this.sessionChat=undefined; this.currentMessage=undefined;
    this.toolMessages.clear(); this.injected.clear(); this.context={page:'Profile'}; this.activity=undefined;
  }
  close() { this.closed = true; clearTimeout(this.notifyTimer); this.unsubscribe?.(); this.session?.clearQueue(); this.session?.dispose(); }
}
