---
title: Factory reset verification
section: Verification
updated: 2026-11-02
result: Untested
---
# Factory reset verification

Scope: [FEAT-factory-reset](../../features/factory-reset.md), backend shutdown ordering, and affected desktop/accessibility behavior. All exercised data, credentials and files are fictional and isolated in temporary folders. The user's installation was not reset.

## Build and environment

Local checks used a dirty tree based on `2b78e78`, fingerprint `4ccabc5c9e98cc1f61c20c6c344359c8d7e1e3494d3439a8ffafdd6041635f23`; the [source manifest](../../evidence/2026-11-02-factory-reset/source-manifest.json) identifies every tested source file. macOS arm64, Electron 44.9.1, SQLite schema 6. The packaged fixture build uses the actual reset implementation; only the final shell-cancellation scenario uses simulated inference. Native dialog responses are stubbed and their cancellation/default options asserted.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Typecheck and domain tests | No regression; deletion stays within owned paths; shutdown drains work | Typecheck and all 39 tests passed, including linked-directory protection and delayed-write ordering | Passed | `tests/reset.test.ts` and shared setup |
| Cancel and reset | Cancel preserves data; confirmed reset removes records, credentials, files and browser state | Packaged UI scenarios passed; default sources, System appearance and manual schedule returned | Passed | [UI results](../../evidence/2026-11-02-factory-reset/macos.json), [Settings](../../evidence/2026-11-02-factory-reset/settings.png), [fresh setup](../../evidence/2026-11-02-factory-reset/fresh.png) |
| Interrupted reset and corrupt data | Resume pending deletion before old state loads; recover without a working database | Injected Chromium cleanup failure and a corrupt SQLite database both recovered through the actual reset flow | Passed | [UI results](../../evidence/2026-11-02-factory-reset/macos.json) |
| Active command | Stop tools before deleting data; no delayed write or old task returns | A real pi shell command was aborted before its delayed file write | Passed | [UI results](../../evidence/2026-11-02-factory-reset/macos.json) |
| Restart and accessibility | Normal startup, recovery, close/reopen and navigation remain functional | Shell driver passed (593 ms startup); 20 light/dark axe audits and keyboard scenario passed | Passed | [Accessibility results](../../evidence/2026-11-02-factory-reset/accessibility.json) |
| Windows package | Same reset and regression scenarios work on Windows | Awaiting CI | Untested | Build workflow |

## Findings and limits

Reset uses Electron's [session data cleanup](https://www.electronjs.org/docs/latest/api/session#sescleardataoptions) and removes explicitly owned app paths after the backend exits. It does not recursively erase an arbitrary custom data directory or follow directory links. A pending marker is removed only after cleanup completes. Existing original files and a test export survived both reset and recovery. This does not establish secure erasure from disk or deletion of external files created by unrestricted assistant commands.

The native confirmation was exercised with stubbed responses; physical mouse/keyboard interaction with the operating-system dialog is not an independent test here. No real ChatGPT credential, candidate record or live model request was used. The existing `v0.1.0` release and tag were not changed by this feature work.
