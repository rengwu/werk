---
title: ZIP backups
section: Features
updated: 2026-11-01
---
# ZIP backups

**FEAT-backups** exports current personal content and restores it into werk. It follows the accepted overwrite/latest-records behavior in the [handoff](../journal/2026-11-01-werk-handoff.md), without importing legacy app formats.

## Entry points and behavior

Settings → Backup has Export backup and Restore backup. Export opens a native save dialog. Restore opens a ZIP picker and replaces records after validation; cancellation changes nothing. The page describes replacement before the action. There is no automatic recovery archive or merge step. Export first to retain current records.

A backup contains the canonical profile and evidence references, jobs and their assessments, saved descriptions, notes and manual status, current source observations, the latest letter per job, and the current CV source with its matching PDF when available. A failed current CV never exports an older PDF as though it matched the source.

Older versions, chats, attachments, queued tasks, fingerprints, scan history, source configuration, schedules, app settings and credentials are excluded. Evidence-file references remain references; the original files are not copied. The archive is an ordinary unencrypted ZIP.

Restore rejects active model, scan, compiler or editing operations. It validates the entire archive before one SQLite transaction replaces personal records, document history, conversation and pending tasks. Profile/CV versions advance and job IDs change so stale editors cannot overwrite imported content. A database failure rolls back and removes only the new staged PDF. Destination source settings, scan checkpoints, appearance, scheduling and authentication stay intact. Restore itself starts no scan, inference or compile.

Imported observations remain attached independently of configured sources. When a matching live source returns, its current observation replaces the imported copy. Restore clears obsolete app-owned conversation and PDF files after committing, reloads the UI and displays Backup restored.

## Archive contract

Format `werk-personal-backup`, version 1: `manifest.json`, `data.json`, optional `cv.tex` and its optional `cv.pdf`. The manifest records creation time, byte sizes and SHA-256 hashes. Unexpected/duplicate entries, unsafe paths, links, encrypted archives, unsupported versions, damaged files and broken record references are rejected. Nothing is extracted to a filesystem path from the ZIP. Directory and local-header checks precede bounded native decompression.

Limits: 128 MiB ZIP, 512 MiB unpacked, 100,000 jobs, 2 MiB source, 8 MiB PDF. Export/import use memory proportional to the records; they are personal-content backups, not full credential/appdata recovery images.

## Verification recipe

Use [shared setup](../verification/setup.md), always with temporary fictional data. `node --experimental-strip-types --test tests/backup.test.ts` checks round trips, exclusions, Unicode, current/mismatched PDFs, configuration preservation, reopen/live refresh, stale editors, invalid archives, active-work rejection and injected transaction rollback.

Set `WERK_EXE` to a packaged app and run `node --experimental-strip-types tests/backup-smoke.ts`. It uses the real Settings controls for native export, invalid-import recovery, overwrite restore, reload confirmation and the restored saved letter. No live candidate folder is used.

[M5 verification](../verification/runs/2026-11-01-m5-delivery.md) records build-specific outcomes.
