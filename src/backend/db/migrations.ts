import type { DatabaseSync } from 'node:sqlite';

const migrations = [ `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
CREATE TABLE events (id INTEGER PRIMARY KEY, at TEXT NOT NULL, level TEXT NOT NULL CHECK(level IN ('info','warn','error')), scope TEXT NOT NULL, message TEXT NOT NULL) STRICT;
`, `
CREATE TABLE profile_versions (revision INTEGER PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document)), changed_by TEXT NOT NULL CHECK(changed_by IN ('user','assistant','restore')), summary TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence)), created_at TEXT NOT NULL) STRICT;
CREATE TABLE assistant_messages (id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL CHECK(json_valid(content)), created_at TEXT NOT NULL) STRICT;
CREATE TABLE tasks (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('assistant_turn','cover_letter','cv_generate')), subject TEXT, state TEXT NOT NULL CHECK(state IN ('queued','running','done','failed','paused')), input TEXT NOT NULL CHECK(json_valid(input)), error TEXT, idempotency_key TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
CREATE INDEX tasks_next ON tasks(state,id);
CREATE TABLE attachments (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, message_id INTEGER REFERENCES assistant_messages(id) ON DELETE CASCADE, name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, extracted_text TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
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
