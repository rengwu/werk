---
title: Desktop shell and local backend
section: Features
updated: 2026-11-01
---
# Desktop shell and local backend

**FEAT-desktop** implements the [M1 shell](../journal/2026-11-01-werk-handoff.md#milestones), [runtime, process and tray decisions](../decisions/index.md#platform-and-delivery). Inbox shows the setup checklist; [Profile](profile.md), the [assistant](assistant.md), [Saved and CV](documents.md) are functional. Settings contains General, Sources, AI, Backup and Diagnostics.

## Entry points and expected outcomes

Launch werk from its installed application. A fresh data folder creates schema 6 in SQLite with WAL and FTS5. Only the utility process owns the database. The sandboxed React renderer uses a typed, validated MessagePort API; it has no Node access or HTTP API server.

Appearance defaults to System. Settings → General → Appearance offers System, Light and Dark; the selection persists and controls native chrome. Settings → Diagnostics shows runtime versions, SQLite and FTS5, database size, backend start/restart state, update status and the last 20 sanitized warnings/errors. Copy diagnostics excludes candidate facts, jobs and credentials.

Closing the window hides it while the backend continues. Opening werk again focuses that window. macOS keeps its Dock presence; Windows has an Open werk / Quit werk tray menu. Quit shuts down the backend and exits. A second instance cannot own the same data folder.

An unexpected backend exit rejects pending calls, restarts after one second and reconnects the renderer. More than three crashes in one minute stops automatic recovery and shows Copy diagnostics / Restart. Restart explicitly retries. Persisted data survives.

A release check runs after 30 seconds and every 12 hours. Only newer stable releases at `rengwu/werk` produce a Download link. There is no auto-update. A 404 from the latest-release endpoint means no stable releases. A fake endpoint is compiled in only when building with `--test`.

An approved version tag runs the same packaged checks, then creates a draft release with the macOS DMG and Windows setup executable. Downloaded workflow artifacts retain their `release/` directory; only those installers are attached, excluding smoke evidence. The user publishes the draft.

## Verification recipe

Use the [shared setup](../verification/setup.md). `npm run check`, `npm test`, `npm run package`, then `WERK_EXE="$PWD/release/mac-arm64/werk.app/Contents/MacOS/werk" npm run smoke` exercises launch, diagnostics, themes, crash recovery, crash-loop stopping, window close/reopen, single instance and persistence. The driver uses native Electron and accessible controls; fixtures are empty, isolated user-data directories.

For the fake release notice: `npm run package -- --test`, then the same smoke command with `WERK_SMOKE_TEST_BUILD=1`. Rebuild normally before distributing. Windows CI installs the NSIS installer silently, launches the installed executable with the same driver, and verifies uninstall preserves the isolated database.

## Coverage and limits

The smoke driver verifies close/reopen through Electron and a second OS process. Native Dock click and Windows tray menu click require a separate desktop check; the driver does not claim those clicks. M5 replaced the temporary tray artwork. The user confirmed the Windows build and setup work; first-tag approval and publication remain pending.

## Verification history

- [M1 verification](../verification/runs/2026-11-01-m1-shell.md).
- [Windows-PC trial and release asset preflight](../verification/runs/2026-11-01-release-preflight.md).

## Final rebuild polish

The application and Windows tray use the chosen light monogram and green match dot. `resources/icon.svg` contains an original hand-drawn path, with no font glyphs. PNG exports are committed; electron-builder creates platform icons. Diagnostics includes model/reasoning, current model work, compiler availability and scan times as well as database/runtime/backend details. Copy diagnostics uses native clipboard IPC.

Settings, Inbox and posting tabs support Arrow Left/Right, Home/End and one tab stop for the selected tab. Job rows retain native button semantics inside a list. Sidebar names include their visible counts. LaTeX syntax colors follow the active theme. The assistant retains its fixed overlay, Escape and focus-return behavior.

`tests/accessibility-smoke.ts` audits Settings, Inbox, Saved, Profile, CV and the assistant in light/dark mode with axe WCAG A/AA rules, then checks keyboard tab selection and focus return. Electron blocks extra browser windows, so the driver uses axe's existing-page mode; built-in PDF viewer internals are outside that DOM audit. Automated checks do not establish complete assistive-technology coverage. See [M5 verification](../verification/runs/2026-11-01-m5-delivery.md).
