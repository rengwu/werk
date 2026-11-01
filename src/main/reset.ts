import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const resetMarker = 'factory-reset.pending';
// Explicit ownership keeps original files, exports and unrelated files intact,
// including when WERK_DATA_DIR points to a user-selected directory.
export const appDataEntries = ['werk.db', 'werk.db-wal', 'werk.db-shm', 'werk.db-journal', 'pi-auth', 'pi', 'attachments', 'cv', 'logs'] as const;

export async function markReset(dataDir: string) {
  try { await writeFile(join(dataDir, resetMarker), 'werk factory reset\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}

export async function clearAppData(dataDir: string) {
  // rm removes links themselves, including links inside these directories.
  // The marker remains until both disk data and Chromium storage are cleared.
  for (const name of appDataEntries) await rm(join(dataDir, name), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
