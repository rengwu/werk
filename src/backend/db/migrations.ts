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
`, `
CREATE TABLE sources (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,           -- greenhouse, ashby, lever, rss, himalayas, remoteok, remotive, fourdayweek, arbeitnow, jobicy, workingnomads, board
  identifier TEXT NOT NULL,     -- board slug, feed URL or catalog key
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  config TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config)),
  checkpoint TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(checkpoint)),   -- pagination, backoff, daily counters
  last_scan_at TEXT, last_result TEXT, last_error TEXT, next_scan_at TEXT,
  UNIQUE (kind, identifier)
) STRICT;
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,                  -- canonical posting URL
  company TEXT NOT NULL,
  company_key TEXT NOT NULL,                 -- normalized; Hide company and dedupe
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',         -- original text
  countries TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(countries)),   -- resolved ISO 3166 codes
  arrangement TEXT CHECK (arrangement IN ('remote', 'hybrid', 'onsite')),
  salary TEXT,
  description TEXT NOT NULL,
  description_manual INTEGER NOT NULL DEFAULT 0,
  description_complete INTEGER NOT NULL CHECK (description_complete IN (0, 1)),
  posted_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  closed_at TEXT,
  match_level TEXT NOT NULL CHECK (match_level IN ('strong', 'adjacent', 'stretch', 'other')),
  match_score INTEGER NOT NULL,
  eligibility TEXT NOT NULL CHECK (eligibility IN ('possible', 'review', 'incompatible')),
  overlap_hours REAL,                        -- null when countries are unknown
  assessment TEXT NOT NULL CHECK (json_valid(assessment)),   -- reasons, gaps, highlight spans, eligibility clauses
  profile_revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'skipped', 'saved', 'applied')),
  opened_at TEXT,
  saved_at TEXT,
  applied_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  saved_description TEXT,                    -- snapshot when saved
  duplicate_of INTEGER REFERENCES jobs(id) ON DELETE SET NULL
) STRICT;
CREATE INDEX jobs_new ON jobs(match_score DESC, id) WHERE status = 'new' AND closed_at IS NULL AND duplicate_of IS NULL;
CREATE INDEX jobs_saved ON jobs(status, saved_at DESC) WHERE status IN ('saved', 'applied');
CREATE INDEX jobs_company ON jobs(company_key);
CREATE INDEX jobs_expiry ON jobs(closed_at) WHERE status IN ('new', 'skipped');
CREATE TABLE job_listings (                  -- every source copy of a job
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_item_id TEXT NOT NULL,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  fields TEXT NOT NULL CHECK (json_valid(fields)),   -- latest normalized source fields (evidence)
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (source_id, source_item_id)
) STRICT;
CREATE INDEX job_listings_job ON job_listings(job_id);
CREATE TABLE fingerprints (                  -- postings deliberately not stored
  url TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  profile_revision INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('stretch', 'other', 'incompatible', 'criteria', 'hidden', 'expired')),
  last_seen_at TEXT NOT NULL
) STRICT;
CREATE TABLE http_validators (url TEXT PRIMARY KEY, etag TEXT, last_modified TEXT, checked_at TEXT NOT NULL) STRICT;
CREATE VIRTUAL TABLE jobs_fts USING fts5(title, company, location, description, content = 'jobs', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');

CREATE TRIGGER jobs_ai AFTER INSERT ON jobs BEGIN INSERT INTO jobs_fts(rowid,title,company,location,description) VALUES(new.id,new.title,new.company,new.location,new.description); END;
CREATE TRIGGER jobs_ad AFTER DELETE ON jobs BEGIN INSERT INTO jobs_fts(jobs_fts,rowid,title,company,location,description) VALUES('delete',old.id,old.title,old.company,old.location,old.description); END;
CREATE TRIGGER jobs_au AFTER UPDATE OF title,company,location,description ON jobs BEGIN INSERT INTO jobs_fts(jobs_fts,rowid,title,company,location,description) VALUES('delete',old.id,old.title,old.company,old.location,old.description); INSERT INTO jobs_fts(rowid,title,company,location,description) VALUES(new.id,new.title,new.company,new.location,new.description); END;
`, `
CREATE TABLE cover_letter_versions (
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,                        -- plain text: greeting, paragraphs, sign-off
  review_notes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(review_notes)),
  created_by TEXT NOT NULL CHECK (created_by IN ('generated', 'user', 'assistant', 'restore')),
  profile_revision INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (job_id, version)
) STRICT;
CREATE TABLE cv_versions (
  version INTEGER PRIMARY KEY,
  source TEXT NOT NULL,                      -- LaTeX
  created_by TEXT NOT NULL CHECK (created_by IN ('generated', 'user', 'assistant', 'restore')),
  profile_revision INTEGER,
  compile_status TEXT CHECK (compile_status IN ('ok', 'failed')),
  compile_log TEXT,
  created_at TEXT NOT NULL
) STRICT;                                    -- PDF at <data>/cv/<version>.pdf
`, `
CREATE TABLE assistant_evidence (
  chat_id TEXT NOT NULL, id TEXT NOT NULL, text TEXT NOT NULL, name TEXT, url TEXT,
  PRIMARY KEY(chat_id,id)
) STRICT;
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
