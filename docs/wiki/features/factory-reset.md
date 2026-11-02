---
title: Factory reset
section: Features
updated: 2026-11-02
---
# Factory reset

**FEAT-factory-reset** implements the user's request to clear the entire app's state from Settings. It is separate from [backup restore](backups.md), which preserves sign-in and settings.

## Entry points and behavior

Settings → General → Factory reset → Reset werk opens a native confirmation. Cancel is the default and Escape cancels. The dialog explains permanent deletion and suggests exporting a backup first. Reset is also available on the backend-failure screen, so a broken database does not prevent recovery.

After confirmation, werk discards unsaved edits, stops background work, and closes its old window and backend before deleting data. It clears the profile and its revisions, all jobs and fingerprints, letters and CV versions/PDFs, conversations and copied attachments, pi sessions, ChatGPT credentials, source configuration, schedules, settings and logs. Chromium storage, cookies, cached data and unsent drafts are cleared separately. Original files and exports outside the app's data folder remain untouched; unknown files in a custom data folder are also preserved. This is a logical reset, not a secure disk erasure.

werk then opens first-run setup, signed out, with System appearance, manual scans and the current default 30 enabled API/feed sources and 20 disabled scraped boards. No scan or inference is started by reset. Queued or running work from the old state cannot resume in the fresh backend. These catalog counts were expanded in the [source update](../journal/2026-11-02-more-sources.md); earlier reset verification retains its original tested counts.

If cleanup fails, werk offers Retry reset or Quit werk and retains a pending-reset marker. The next launch finishes cleanup before opening a backend or showing old records. A cancelled confirmation writes no marker and changes no records.

## Scope and ownership

Main-process IPC validates the calling window and owns the native confirmation. There is no assistant reset tool. Backend shutdown aborts model, scan, compiler and authentication work and drains in-flight requests before closing SQLite. Reset removes only known app-owned paths; directory links are removed without following them. Electron's session API clears its browser data. Installed binaries, the bundled compiler/cache and another app's authentication are outside the reset.

## Verification recipe

Use the [shared setup](../verification/setup.md) with temporary fictional data. `node --experimental-strip-types --test tests/reset.test.ts` checks file ownership, linked-directory protection, retained exports and shutdown ordering.

Build the fixture package, set `WERK_EXE`, then run `node --experimental-strip-types tests/reset-smoke.ts`. It uses the real Settings button, stubs only native dialog responses, verifies Cancel and confirmation, inspects the fresh database and credentials, checks drafts/cookies/defaults, quits and reopens, injects a storage-clear failure, resumes a pending reset, recovers a corrupt database and aborts an actual pi shell command before a delayed file write. Windows CI runs the same driver against its packaged app. `tests/accessibility-smoke.ts` covers General in both themes.

The driver never uses the actual candidate folder. Results are build-specific; see [factory reset verification](../verification/runs/2026-11-02-factory-reset.md).
