import type { DatabaseSync } from 'node:sqlite';

const migrations = [ `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
CREATE TABLE events (id INTEGER PRIMARY KEY, at TEXT NOT NULL, level TEXT NOT NULL CHECK(level IN ('info','warn','error')), scope TEXT NOT NULL, message TEXT NOT NULL) STRICT;
` ];
export function migrate(db: DatabaseSync) {
  let version = Number(db.prepare('PRAGMA user_version').get()?.user_version || 0);
  if (version > migrations.length) throw new Error('This database needs a newer version of werk.');
  while (version < migrations.length) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(migrations[version]); db.exec(`PRAGMA user_version = ${++version}`); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}
