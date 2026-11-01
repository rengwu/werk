import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Store } from '../db/store.ts';
import type { Attachment, InferenceImage } from '../../shared/ai.ts';
import type { Evidence } from '../profile/edits.ts';
const types: Record<string,string> = { '.pdf':'application/pdf', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.txt':'text/plain', '.md':'text/plain', '.csv':'text/plain', '.json':'text/plain', '.tex':'text/plain' };
function extractPdf(bytes: Uint8Array): Promise<string> {
  return new Promise((resolveText,reject) => {
    const worker = new Worker(join(process.env.WERK_BUNDLE_DIR || resolve('out'), 'extract-pdf.mjs'), { workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 192 } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('PDF reading timed out. Attach a smaller document.')); },15000);
    worker.once('message', result => { clearTimeout(timer); void worker.terminate(); result.error ? reject(new Error(result.error)) : resolveText(result.text); });
    worker.once('error', () => { clearTimeout(timer); reject(new Error('Could not read this PDF.')); });
    worker.once('exit', () => { clearTimeout(timer); reject(new Error('Could not read this PDF.')); });
  });
}
export class Attachments {
  store: Store; directory: string;
  constructor(store: Store, dataDir: string) { this.store = store; this.directory = join(dataDir,'attachments'); }
  list(chatId: string): Attachment[] { return this.store.db.prepare('SELECT id,name,media_type AS mediaType,size,message_id AS messageId FROM attachments WHERE chat_id=? ORDER BY created_at').all(chatId) as Attachment[]; }
  async add(chatId: string, name: string, bytes: Uint8Array) {
    name = basename(name.replaceAll('\\','/')).replace(/[\x00-\x1f\x7f]/g,'').slice(0,200);
    const mediaType = types[extname(name).toLowerCase()];
    if (!mediaType) throw new Error('Attach a PDF, text file, PNG, JPEG or WebP image.');
    if (!bytes.length || bytes.length > 10*1024*1024) throw new Error('Each attachment must be nonempty and at most 10 MB.');
    const pending = this.list(chatId).filter(a => !a.messageId);
    if (pending.length >= 5 || pending.reduce((n,a) => n+a.size,0)+bytes.length > 20*1024*1024) throw new Error('Attach at most five files totalling 20 MB.');
    const buffer = Buffer.from(bytes); let text = '';
    if (mediaType === 'application/pdf') {
      if (!buffer.subarray(0,1024).includes(Buffer.from('%PDF-'))) throw new Error('This file is not a valid PDF.');
      text = await extractPdf(bytes);
    } else if (mediaType.startsWith('image/')) {
      const valid = mediaType === 'image/png' ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mediaType === 'image/jpeg' ? buffer[0]===255 && buffer[1]===216 && buffer[2]===255 : buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP';
      if (!valid) throw new Error('Image format does not match its extension.');
    } else { text = new TextDecoder('utf-8',{fatal:true}).decode(bytes); if (text.includes('\0') || text.length > 100000) throw new Error('Text attachments must be UTF-8 and at most 100,000 characters.'); }
    const id = randomUUID(); await mkdir(this.directory,{recursive:true,mode:0o700}); await writeFile(join(this.directory,id),bytes,{flag:'wx',mode:0o600});
    try { this.store.db.prepare('INSERT INTO attachments VALUES(?,?,NULL,?,?,?,?,?)').run(id,chatId,name,mediaType,bytes.length,text,new Date().toISOString()); }
    catch (error) { await rm(join(this.directory,id),{force:true}); throw error; }
    return { id,name,mediaType,size:bytes.length,messageId:null } satisfies Attachment;
  }
  async remove(id: string, chatId: string) {
    const row = this.store.db.prepare('SELECT id FROM attachments WHERE id=? AND chat_id=? AND message_id IS NULL').get(id,chatId);
    if (!row) return;
    this.store.db.prepare('DELETE FROM attachments WHERE id=?').run(id); await rm(join(this.directory,id),{force:true});
  }
  bind(ids: string[], messageId: number, chatId: string) {
    if (ids.length > 5 || new Set(ids).size !== ids.length) throw new Error('Attach at most five distinct files.');
    const available = this.list(chatId).filter(a => ids.includes(a.id) && a.messageId === null);
    if (available.length !== ids.length || available.reduce((n,a)=>n+a.size,0)>20*1024*1024) throw new Error('These attachments are not available. Attach them again.');
    for (const id of ids) this.store.db.prepare('UPDATE attachments SET message_id=? WHERE id=?').run(messageId,id);
    return available.map(a => ({...a,messageId}));
  }
  async context(chatId: string) {
    const sources: Evidence[] = [], images: InferenceImage[] = []; let characters = 0, imageBytes = 0;
    for (const a of this.list(chatId).filter(a=>a.messageId!==null).slice(-20)) {
      if (a.mediaType.startsWith('image/')) {
        if (images.length >= 5 || imageBytes+a.size > 20*1024*1024) continue;
        imageBytes += a.size; images.push({ name:a.name,mediaType:a.mediaType,data:(await readFile(join(this.directory,a.id))).toString('base64') });
        sources.push({id:`attachment:${a.id}`,name:a.name,text:'Image supplied by the user; visual evidence does not establish unstated candidate facts.'});
      } else {
        const row = this.store.db.prepare('SELECT extracted_text FROM attachments WHERE id=?').get(a.id)!;
        const text = String(row.extracted_text).slice(0,Math.max(0,180000-characters)); characters += text.length;
        sources.push({id:`attachment:${a.id}`,name:a.name,text});
      }
    }
    return {sources,images};
  }
  async clear(chatId: string) {
    const files = this.list(chatId); this.store.db.prepare('DELETE FROM attachments WHERE chat_id=?').run(chatId);
    for (const a of files) await rm(join(this.directory,a.id),{force:true});
  }
}
