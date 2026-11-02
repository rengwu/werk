---
title: Verification setup
section: Verification
updated: 2026-11-02
---
# Verification setup

Run from the repository root. Node 22.19+ is required locally; CI uses Node 24. Install with `npm ci`. `npm run dev` starts Vite and the Electron app with backend rebuild/restart. Development data is in the separate `werk-dev` folder. Never point tests at that folder or the user's installed werk data.

## Build and checks

```sh
npm run check
npm test
npm run setup:latex
npm run package
WERK_EXE="$PWD/release/mac-arm64/werk.app/Contents/MacOS/werk" npm run smoke
```

The smoke driver requires a packaged executable. It creates a fresh OS temporary `werk-smoke-*` data folder, injects `WERK_DATA_DIR`, and removes its own folder after quitting. Screenshots and JSON results remain in ignored `smoke-output/`. On Windows CI, cleanup is deferred until the uninstall-preservation assertion.

M2 adds `tests/auth-smoke.ts` for the real SDK browser handoff/cancellation and `tests/profile-smoke.ts` for fictional PDF-to-profile generation. Run them with `node --experimental-strip-types` and `WERK_EXE` set. Profile smoke needs the `--test` build; it sets the simulated-inference environment and reads `tests/fixtures/ai.json`. Ordinary builds cannot enable simulated inference. CI keeps the production installer, then builds a separate unpacked test app for the fictional profile journey.

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

## Discovery fixtures

`tests/discovery.test.ts` exercises the real SQLite pipeline and `tests/parsers.test.ts` preserves relevant archived parser regressions. The packaged driver `tests/discovery-smoke.ts` uses the same `WERK_EXE` command as the profile driver, with a test build. It seeds fictional profile/source prerequisites and records HTTP responses in its temporary directory. HTTP fixtures are unavailable in production builds.

`node --experimental-strip-types scripts/check-live-discovery.ts` performs exactly one bounded Remotive scan against a fictional profile, reports counts/database size, and removes its temporary data. Use only when a live check is authorized.

`node --experimental-strip-types scripts/check-live-feeds.ts 'NoDesk · Engineering' 'MoAIJobs'` similarly checks only the named catalog feeds with fictional data and no inference. Each feed has a one-request limit. It reports parsed/full/empty-description/unknown-employer/kept counts in `smoke-output/source-feeds/live.json`, fails on an unsuccessful or unexpectedly empty read, and removes its database. The [source-expansion run](runs/2026-11-02-source-expansion.md) checked all thirteen added feeds. `tests/source-feeds.test.ts` covers their recorded shapes and old-catalog upgrades without network access.

The discovery driver also accepts `WERK_DEV_APP=1` when `WERK_EXE` points to Electron and the working directory contains an isolated development app. CI continues to use packaged apps. Do not use the live development data folder for either mode.

## Documents, backups and accessibility

`npm run setup:latex` downloads the pinned compiler and prepares/verifies its offline package cache. On Windows, install Go 1.24 and download the `latex-cache` CI artifact into `resources/runtime/cache` first. The cache is built once on macOS and tested on both OSes. Packaged apps contain the compiler/cache; development setup is separate.

`tests/latex-sandbox.ts` executes the actual compiler against fictional content and forbidden reads/writes, shell escape and cancellation. Windows additionally runs `go test ./...` under `tools/texsandbox` for AppContainer network/file/process isolation and broker-death cleanup.

With the fixture package selected in `WERK_EXE`, run `tests/documents-smoke.ts`, `tests/backup-smoke.ts` and `tests/accessibility-smoke.ts` using `node --experimental-strip-types`. Document inference is simulated; the PDF compiler and backup operations are real. The accessibility driver uses axe WCAG A/AA checks in light/dark themes and explicit keyboard/focus assertions. It cannot audit Chromium's internal PDF viewer. Screenshot/JSON outputs are under matching `smoke-output/` subfolders. Test cleanup dismisses native unsaved-edit prompts in its own instance; normal close/quit behavior remains covered by the shell driver.

Production installers are retained before the separate fixture package replaces unpacked build output. Never release a fixture build. `scripts/licenses.mjs` emits bundled dependency notices during a normal build.

## Factory reset

`node --experimental-strip-types --test tests/reset.test.ts` verifies owned-path deletion and graceful shutdown. With `WERK_EXE` pointing to the fixture package, run `node --experimental-strip-types tests/reset-smoke.ts`. It creates and removes its own temporary app folder; never replace that folder with live user data. Native confirmation responses are stubbed, while actual IPC, backend shutdown, filesystem deletion and Electron storage cleanup execute. Evidence is in `smoke-output/reset/`.
