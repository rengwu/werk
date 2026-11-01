---
title: Verification setup
section: Verification
updated: 2026-11-01
---
# Verification setup

Run from the repository root. Node 22.19+ is required locally; CI uses Node 24. Install with `npm ci`. `npm run dev` starts Vite and the Electron app with backend rebuild/restart. Development data is in the separate `werk-dev` folder. Never point tests at that folder or the user's installed werk data.

## Build and checks

```sh
npm run check
npm test
npm run package
WERK_EXE="$PWD/release/mac-arm64/werk.app/Contents/MacOS/werk" npm run smoke
```

The smoke driver requires a packaged executable. It creates a fresh OS temporary `werk-smoke-*` data folder, injects `WERK_DATA_DIR`, and removes its own folder after quitting. Screenshots and JSON results remain in ignored `smoke-output/`. On Windows CI, cleanup is deferred until the uninstall-preservation assertion.

For development-only fixture injection, `npm run package -- --test` compiles a test build and `WERK_SMOKE_TEST_BUILD=1` enables the matching smoke fixture. Production builds ignore the injected release URL. Test builds are never release artifacts. `npm run package` returns to a production build.

## Identity and evidence

`git rev-parse HEAD` records the base revision. For an uncommitted build, `node scripts/fingerprint.mjs` emits a content manifest and aggregate SHA-256 for source, scripts, tests, package lock, CI and resources. Copy only sanitized evidence into the run's wiki evidence directory. Build/runtime output, credentials and user records stay outside the wiki.

Diagnostics reports Electron, Chromium, Node, SQLite, schema and backend state. The smoke driver waits for the visible Inbox, then verifies FTS5 and backend readiness through Settings. A passing wiki build or unit test does not substitute for a packaged launch.

## Windows CI

The Build workflow runs checks and packaging on macOS and Windows. Windows installs the per-user NSIS executable using `/S`, runs the smoke test against `%LOCALAPPDATA%\Programs\werk\werk.exe`, then uninstalls and asserts the data folder remains. Downloadable artifacts last seven days. CI runs on pushes to main; only explicitly approved version tags create draft releases.

## Wiki checks

```sh
node ../jstack/skills/verify-change/scripts/check-reports.mjs docs/wiki
node docs/wiki/_build.mjs
node docs/wiki/_build.mjs --check
```
