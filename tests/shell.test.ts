import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Service } from '../src/backend/service.ts';
import { newerVersion, checkUpdate } from '../src/backend/update.ts';
import { createServer } from 'node:http';

test('SQLite migrations, FTS5, settings persistence, validation and sanitized diagnostics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'werk-unit-'));
  const init = { type: 'init' as const, dataDir: dir, version: '0.1.0', system: 'test', electron: 'test', chromium: 'test', restartCount: 0 };
  const events: string[] = [];
  let service = new Service(init, event => events.push(event));
  try {
    assert.equal(service.diagnostics().schema, 5); assert.equal(service.diagnostics().fts5, true);
    assert.equal(service.settings().appearance, 'system');
    await assert.rejects(service.call('settings.set', { appearance: 'invalid' as never }));
    await assert.rejects(service.call('executeShell' as never, undefined as never));
    await service.call('settings.set', { appearance: 'dark' });
    assert.ok(events.includes('settings'));
    service.close(); service = new Service({ ...init, restartCount: 1, previousExit: 9 }, () => {});
    assert.equal(service.settings().appearance, 'dark');
    assert.equal(service.diagnostics().restartCount, 1);
    assert.equal(service.diagnostics().events[0].message, 'Backend restarted after exit 9.');
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('release comparison and validated public download destination', async () => {
  assert.equal(newerVersion('v1.10.0', '1.9.9'), true);
  for (const tag of ['v0.1.0', 'v0.0.9', 'v0.2.0-beta', 'invalid']) assert.equal(newerVersion(tag, '0.1.0'), false);
  let data = { tag_name: 'v0.2.0', html_url: 'https://github.com/rengwu/werk/releases/tag/v0.2.0' };
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal((await checkUpdate('0.1.0', url)).state, 'available');
    data = { ...data, html_url: 'https://example.com/unsafe' };
    assert.equal((await checkUpdate('0.1.0', url)).state, 'current');
  } finally { server.close(); }
});
