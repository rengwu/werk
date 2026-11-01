---
title: Factory reset verification
section: Verification
updated: 2026-11-02
result: Passed
---
# Factory reset verification

Scope: [FEAT-factory-reset](../../features/factory-reset.md), backend shutdown ordering, and affected desktop/accessibility behavior. All exercised data, credentials and files are fictional and isolated in temporary folders. The user's installation was not reset.

## Build and environment

Local checks used a dirty tree based on `2b78e78`, fingerprint `4ccabc5c9e98cc1f61c20c6c344359c8d7e1e3494d3439a8ffafdd6041635f23`; the [source manifest](../../evidence/2026-11-02-factory-reset/source-manifest.json) identifies every tested source file. This source was committed as `780b1e21118df2f452018344432018606c43ea34`. macOS arm64, Electron 44.9.1, SQLite schema 6. The packaged fixture build uses the actual reset implementation; only the final shell-cancellation scenario uses simulated inference. Native dialog responses are stubbed and their cancellation/default options asserted.

The corrected driver at `6039b02f2e846df3955da055c99632522c8f1f06` also passed all six scenarios in an isolated local Electron app with the unchanged production renderer/main and a fixture backend: [correction results](../../evidence/2026-11-02-factory-reset/macos-driver-correction.json). [CI at the same revision](https://github.com/rengwu/werk/actions/runs/41328558430) then passed packaged macOS arm64 and Windows x64 checks, including all six reset scenarios and accessibility: [CI results](../../evidence/2026-11-02-factory-reset/ci.json).

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Typecheck and domain tests | No regression; deletion stays within owned paths; shutdown drains work | Typecheck and all 39 tests passed, including linked-directory protection and delayed-write ordering | Passed | `tests/reset.test.ts` and shared setup |
| Cancel and reset | Cancel preserves data; confirmed reset removes records, credentials, files and browser state | Packaged UI scenarios passed; default sources, System appearance and manual schedule returned | Passed | [UI results](../../evidence/2026-11-02-factory-reset/macos.json), [Settings](../../evidence/2026-11-02-factory-reset/settings.png), [fresh setup](../../evidence/2026-11-02-factory-reset/fresh.png) |
| Interrupted reset and corrupt data | Resume pending deletion before old state loads; recover without a working database | Injected Chromium cleanup failure and a corrupt SQLite database both recovered through the actual reset flow | Passed | [UI results](../../evidence/2026-11-02-factory-reset/macos.json) |
| Active command | Stop tools before deleting data; no delayed write or old task returns | A real pi shell command was aborted before its delayed file write | Passed | [UI results](../../evidence/2026-11-02-factory-reset/macos.json) |
| Restart and accessibility | Normal startup, recovery, close/reopen and navigation remain functional | Shell driver passed (593 ms startup); 20 light/dark axe audits and keyboard scenario passed | Passed | [Accessibility results](../../evidence/2026-11-02-factory-reset/accessibility.json) |
| Cross-platform CI | Same reset and regression scenarios work on macOS and Windows | Both packaged apps passed all six reset scenarios, 39 domain tests, installer/launch checks, other feature drivers and accessibility | Passed | [CI results](../../evidence/2026-11-02-factory-reset/ci.json), [CI run](https://github.com/rengwu/werk/actions/runs/41328558430) |

## Findings and limits

The [initial CI run](https://github.com/rengwu/werk/actions/runs/41327821084) at `780b1e2` passed typechecking, all 39 tests, packaging, installation/launch, compiler isolation, authentication handoff, assistant, discovery, document and backup checks on both platforms. Its reset driver failed with `unable to open database file` because the setup heading can render before backend initialization; see the [initial CI results](../../evidence/2026-11-02-factory-reset/ci-initial.json). The corrected driver waits for the Diagnostics backend response before inspecting SQLite and passed on both platforms. This correction changed the test, not the application.

Reset uses Electron's [session data cleanup](https://www.electronjs.org/docs/latest/api/session#sescleardataoptions) and removes explicitly owned app paths after the backend exits. It does not recursively erase an arbitrary custom data directory or follow directory links. A pending marker is removed only after cleanup completes. Existing original files and a test export survived both reset and recovery. This does not establish secure erasure from disk or deletion of external files created by unrestricted assistant commands.

The native confirmation was exercised with stubbed responses; physical mouse/keyboard interaction with the operating-system dialog is not an independent test here. No real ChatGPT credential, candidate record or live model request was used. The existing `v0.1.0` release and tag were not changed by this feature work.
