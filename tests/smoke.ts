import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const exe = process.env.WERK_EXE;
if (!exe) throw new Error('Set WERK_EXE to the packaged werk executable.');
const dir = await mkdtemp(join(tmpdir(), 'werk-smoke-'));
const output = resolve('smoke-output'); await mkdir(output, { recursive: true });
const env = { ...process.env, WERK_DATA_DIR: dir } as Record<string,string>;
delete env.ELECTRON_RUN_AS_NODE;
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ tag_name: 'v9.0.0', html_url: 'https://github.com/rengwu/werk/releases/tag/v9.0.0' })); });
if (process.env.WERK_SMOKE_TEST_BUILD) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  env.WERK_RELEASES_URL = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
}
const results: Record<string,unknown> = { platform: process.platform, arch: process.arch, scenarios: [] };
const scenarios = results.scenarios as string[];
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  const start = performance.now();
  app = await electron.launch({ executablePath: exe, env, timeout: 20000 });
  let page = await app.firstWindow();
  await page.getByRole('heading', { name: 'Set up werk', exact: true }).waitFor();
  results.startupMs = Math.round(performance.now() - start);
  assert.ok(Number(results.startupMs) < 3000, `Shell startup took ${results.startupMs} ms`);
  scenarios.push('Fresh launch within 3 seconds');
  assert.equal(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require), 'undefined');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('dark');
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'dark');
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByTestId('diagnostic-fts5').filter({ hasText: 'Available' }).waitFor();
  assert.equal(await page.getByTestId('diagnostic-schema').textContent(), '5');
  assert.equal(await page.getByTestId('diagnostic-backend').textContent(), 'running');
  results.diagnostics = await page.locator('.diagnostics').innerText();
  await page.screenshot({ path: join(output, 'diagnostics-dark.png') });
  scenarios.push('Sandboxed renderer, utility-process SQLite, FTS5, schema and diagnostics');
  const pid = await app.evaluate(({ app }) => app.getAppMetrics().find(p => p.name === 'werk-backend')?.pid);
  assert.ok(pid); process.kill(pid);
  await page.getByTestId('diagnostic-restarts').filter({ hasText: '1' }).waitFor();
  scenarios.push('Backend killed, restarted and queries reconnected');
  for (const count of [2,3,4]) {
    const child = await app.evaluate(({ app }) => app.getAppMetrics().find(p => p.name === 'werk-backend')?.pid);
    assert.ok(child); process.kill(child);
    if (count < 4) await page.getByTestId('diagnostic-restarts').filter({ hasText: String(count) }).waitFor();
  }
  await page.getByText('The backend could not restart.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await page.getByTestId('diagnostic-restarts').filter({ hasText: '4' }).waitFor();
  scenarios.push('Repeated crashes stop automatic retries; explicit Restart recovers');
  if (process.env.WERK_SMOKE_TEST_BUILD) {
    await page.getByRole('link', { name: 'Download', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Download', exact: true }).getAttribute('href'), 'https://github.com/rengwu/werk/releases/tag/v9.0.0');
    scenarios.push('Fake newer release produces the download notice');
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  const second = spawn(exe, [], { env, stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { second.kill(); reject(new Error('Second instance did not exit.')); }, 10000); second.once('exit', () => { clearTimeout(timer); resolve(); }); });
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  assert.equal((await app.windows()).length, 1);
  scenarios.push('Close hides window; second launch reopens the same instance');
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('light');
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'light');
  await page.screenshot({ path: join(output, 'settings-light.png') });
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('dark');
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'dark');
  await app.close(); app = undefined;
  const reopen = await electron.launch({ executablePath: exe, env, timeout: 20000 }); app = reopen;
  page = await reopen.firstWindow();
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'dark');
  scenarios.push('Appearance persists after quit and relaunch');
  await reopen.close(); app = undefined;
  results.result = 'Passed';
  // CI uninstall check verifies this isolated folder remains after NSIS removal.
  if (process.env.GITHUB_ENV && process.platform === 'win32') {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_ENV, `WERK_SMOKE_DATA=${dir}\n`);
  }
} catch (error) {
  results.result = 'Failed'; results.error = error instanceof Error ? error.message : String(error);
  if (app) { const page = await app.firstWindow().catch(() => null); if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); }
  throw error;
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
  await app?.close().catch(() => {});
  server.close();
  if (!(process.env.GITHUB_ENV && process.platform === 'win32')) await rm(dir, { recursive: true, force: true });
}
console.log(JSON.stringify(results, null, 2));
