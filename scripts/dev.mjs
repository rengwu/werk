import { spawn } from 'node:child_process';
import { context } from 'esbuild';
import { createServer } from 'vite';
import electron from 'electron';
const server = await createServer();
await server.listen();
let child;
let restarting = false;
const start = () => {
  const env = { ...process.env, WERK_RENDERER_URL: 'http://127.0.0.1:5173' };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, ['.'], { stdio: 'inherit', env });
  child.on('exit', () => { if (!restarting) void stop(); });
};
const ctx = await context({
  entryPoints: { main: 'src/main/index.ts', preload: 'src/preload/index.ts', backend: 'src/backend/index.ts' },
  outdir: 'out', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node24',
  external: ['electron'], define: { WERK_TEST_BUILD: 'false' }, sourcemap: true,
  plugins: [{ name: 'restart', setup(build) { build.onEnd(async (result) => {
    if (result.errors.length) return;
    restarting = true;
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    start(); restarting = false;
  }); } }],
});
async function stop() { restarting = true; child?.kill(); await ctx.dispose(); await server.close(); process.exit(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await ctx.watch();
