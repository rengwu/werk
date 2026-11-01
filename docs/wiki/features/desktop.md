---
title: Desktop shell and local backend
section: Features
updated: 2026-11-01
---
# Desktop shell and local backend

**FEAT-desktop** implements the [M1 shell](../journal/2026-11-01-werk-handoff.md#milestones), [runtime, process and tray decisions](../decisions/index.md#platform-and-delivery). Inbox now shows the setup checklist; [Profile](profile.md) and the [assistant](assistant.md) are functional. Saved and CV remain empty states until their milestones. Settings contains General, AI and Diagnostics.

## Entry points and expected outcomes

Launch werk from its installed application. A fresh data folder creates schema 1 in SQLite with WAL and FTS5. Only the utility process owns the database. The sandboxed React renderer uses a typed, validated MessagePort API; it has no Node access or HTTP API server.

Appearance defaults to System. Settings → General → Appearance offers System, Light and Dark; the selection persists and controls native chrome. Settings → Diagnostics shows runtime versions, SQLite and FTS5, database size, backend start/restart state, update status and the last 20 sanitized warnings/errors. Copy diagnostics excludes candidate facts, jobs and credentials.

Closing the window hides it while the backend continues. Opening werk again focuses that window. macOS keeps its Dock presence; Windows has an Open werk / Quit werk tray menu. Quit shuts down the backend and exits. A second instance cannot own the same data folder.

An unexpected backend exit rejects pending calls, restarts after one second and reconnects the renderer. More than three crashes in one minute stops automatic recovery and shows Copy diagnostics / Restart. Restart explicitly retries. Persisted data survives.

A release check runs after 30 seconds and every 12 hours. Only newer stable releases at the configured GitHub repository produce a Download link. There is no auto-update. The repository still has its old name, so a 404 is treated as no releases. A fake endpoint is compiled in only when building with `--test`.

## Verification recipe

Use the [shared setup](../verification/setup.md). `npm run check`, `npm test`, `npm run package`, then `WERK_EXE="$PWD/release/mac-arm64/werk.app/Contents/MacOS/werk" npm run smoke` exercises launch, diagnostics, themes, crash recovery, crash-loop stopping, window close/reopen, single instance and persistence. The driver uses native Electron and accessible controls; fixtures are empty, isolated user-data directories.

For the fake release notice: `npm run package -- --test`, then the same smoke command with `WERK_SMOKE_TEST_BUILD=1`. Rebuild normally before distributing. Windows CI installs the NSIS installer silently, launches the installed executable with the same driver, and verifies uninstall preserves the isolated database.

## Coverage and limits

The smoke driver verifies close/reopen through Electron and a second OS process. Native Dock click and Windows tray menu click require a separate desktop check; the driver does not claim those clicks. The temporary tray artwork is replaced in M5. The first release remains subject to the user's Windows check and explicit release authorization.

## Verification history

- [M1 verification](../verification/runs/2026-11-01-m1-shell.md).
