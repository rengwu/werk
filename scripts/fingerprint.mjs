import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const roots = ['src','scripts','tests','.github','resources', 'tools'];
const files = ['package.json','package-lock.json','tsconfig.json','vite.config.ts'];
async function walk(path) { for (const entry of await readdir(path, { withFileTypes: true })) { const next = `${path}/${entry.name}`; if (next === 'resources/runtime') continue; if (entry.isDirectory()) await walk(next); else if (entry.isFile()) files.push(next); } }
for (const root of roots) await walk(root);
const manifest = [];
for (const path of files.sort()) manifest.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
const fingerprint = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
console.log(JSON.stringify({ fingerprint, files: manifest }, null, 2));
