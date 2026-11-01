import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, copyFile } from 'node:fs/promises';
import {writeNotices} from './licenses.mjs';
import { openAiOAuth } from './openai-oauth.mjs';

export const testBuild = process.argv.includes('--test');
export const options = {
  entryPoints: { main: 'src/main/index.ts', preload: 'src/preload/index.ts', backend: 'src/backend/index.ts' },
  outdir: 'out', outExtension: { '.js': '.cjs' }, bundle: true,
  platform: 'node', format: 'cjs', target: 'node24', external: ['electron', '@earendil-works/pi-coding-agent'],
  define: { WERK_TEST_BUILD: String(testBuild) }, sourcemap: true,
  plugins: [openAiOAuth],
};
await mkdir('out', { recursive: true });
await build(options);
await build({ entryPoints: ['src/backend/assistant/extract-pdf.worker.mjs'], outfile: 'out/extract-pdf.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node24', external: ['@napi-rs/canvas'], banner: { js: "import {createRequire as werkCreateRequire} from 'node:module'; const require = werkCreateRequire(import.meta.url);" } });
await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'out/pdf.worker.mjs');
await copyFile('src/backend/profile/build-user-profile/SKILL.md', 'out/build-user-profile.md');
await viteBuild();

await writeNotices();
