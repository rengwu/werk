import { spawnSync } from 'node:child_process';
const test = process.argv.includes('--test');
for (const args of [ ['scripts/build.mjs', ...(test ? ['--test'] : [])], ['node_modules/electron-builder/cli.js', '--publish', 'never'] ]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
  if (result.status !== 0) process.exit(result.status || 1);
}
