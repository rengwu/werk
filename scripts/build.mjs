import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir } from 'node:fs/promises';

export const testBuild = process.argv.includes('--test');
export const options = {
  entryPoints: { main: 'src/main/index.ts', preload: 'src/preload/index.ts', backend: 'src/backend/index.ts' },
  outdir: 'out', outExtension: { '.js': '.cjs' }, bundle: true,
  platform: 'node', format: 'cjs', target: 'node24', external: ['electron'],
  define: { WERK_TEST_BUILD: String(testBuild) }, sourcemap: true,
};
await mkdir('out', { recursive: true });
await build(options);
await viteBuild();
