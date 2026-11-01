import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appDataEntries, clearAppData, markReset, resetMarker } from '../src/main/reset.ts';
import { Service } from '../src/backend/service.ts';

test('factory reset removes owned data without following links or deleting exports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'werk-reset-files-'));
  const dir = join(root, 'app'), original = join(root, 'original');
  try {
    await mkdir(dir); await mkdir(original); await writeFile(join(original, 'cv.md'), 'Original evidence');
    for (const name of appDataEntries) {
      if (name.startsWith('werk.db')) await writeFile(join(dir, name), 'Old state');
      else if (name !== 'pi-auth') { await mkdir(join(dir, name)); await writeFile(join(dir, name, 'old.txt'), 'Old state'); }
    }
    await symlink(original, join(dir, 'pi-auth'), 'junction');
    await symlink(original, join(dir, 'attachments', 'outside'), 'junction');
    await writeFile(join(dir, 'export.zip'), 'Exported backup');
    await markReset(dir); await markReset(dir); await clearAppData(dir); await clearAppData(dir);
    for (const name of appDataEntries) await assert.rejects(access(join(dir, name)));
    assert.equal(await readFile(join(original, 'cv.md'), 'utf8'), 'Original evidence');
    assert.equal(await readFile(join(dir, 'export.zip'), 'utf8'), 'Exported backup');
    await access(join(dir, resetMarker)); // Pending until Chromium data is also cleared.
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('shutdown cancels and drains work and pending file writes before closing SQLite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'werk-reset-shutdown-'));
  const service = new Service({ type:'init',dataDir:dir,version:'test',system:'test',electron:'test',chromium:'test',restartCount:0 }, () => {});
  let stopped = false, fileFinished = false;
  service.queue.handlers.cover_letter = async (_task, signal) => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => setTimeout(() => { stopped = true; resolve(); }, 30), { once: true }));
  };
  const original = service.assistant.attachments.add.bind(service.assistant.attachments);
  service.assistant.attachments.add = async (...args) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const result = await original(...args); fileFinished = true; return result;
  };
  try {
    service.queue.enqueue('cover_letter','fictional',{},'reset-test');
    service.queue.kick(); await new Promise(resolve => setTimeout(resolve, 0));
    const adding = service.call('attachments.add', { name: 'fixture.txt', bytes: new Uint8Array([65]) });
    const shuttingDown = service.shutdown();
    await assert.rejects(service.call('settings.set', { appearance: 'dark' }), /stopping/);
    await shuttingDown; await adding;
    assert.ok(stopped && fileFinished);
    assert.equal(service.queue.running, undefined);
    assert.throws(() => service.store.db.prepare('SELECT 1').get(), /not open|closed/i);
  } finally { await service.shutdown(); await rm(dir, { recursive: true, force: true }); }
});
