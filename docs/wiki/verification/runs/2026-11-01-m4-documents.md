---
title: M4 letters and CV verification
section: Verification
updated: 2026-11-01
result: Passed
---
# M4 letters and CV verification

Scope: [FEAT-letters and FEAT-cv](../../features/documents.md), including actual compiler isolation and the packaged workspaces.

## Build and environment

Base `4057deee560e75c948696e251caff808072fe868`; the exact dirty-tree fingerprint is recorded in the [source manifest](../../evidence/2026-11-01-m4-documents/source-manifest.json). macOS arm64, Electron 44.9.1, Tectonic 0.15.0, schema 5. Every test uses fictional facts and isolated temporary data. The live letter check uses the app-owned credential store with an isolated fictional database and retains no letter content.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Types and domain tests | Valid document versions, candidate evidence and failure preservation | Typecheck and 34 tests pass | Passed | [Recipe](../../features/documents.md#verification-recipe) |
| Saved workspace | One letter on Save; history, copy and manual Applied | Packaged macOS journey passed | Passed | [Saved](../../evidence/2026-11-01-m4-documents/saved.png), [results](../../evidence/2026-11-01-m4-documents/results.json) |
| CV workspace | Profile source, sandboxed PDF, download, dirty guard, failure retains old PDF, restore | Packaged macOS journey passed | Passed | [CV](../../evidence/2026-11-01-m4-documents/cv.png), [results](../../evidence/2026-11-01-m4-documents/results.json) |
| Runtime compiler | Offline compilation and adversarial isolation | All 11 macOS scenarios passed, including absolute/indirect/traversal reads, font/image/openin reads, external writes, shell escape and cancellation | Passed | [Compiler results](../../evidence/2026-11-01-m4-documents/latex.json) |
| Live letter | Fixed model/high reasoning generates a supported fictional letter | One generation succeeded in 20.5 s; 230 words produced the expected soft length review note | Passed | [Live result](../../evidence/2026-11-01-m4-documents/live.json) |
| Windows AppContainer and installed workspace | Actual file/network/process boundaries and same UI journey | Passed in the final build at `5c258cd75290c5ed1d0fda101c745e4e28a58108`, including AppContainer boundary tests and the corrected editor synchronization | Passed | [CI run](https://github.com/rengwu/ununemploy/actions/runs/41283633752) |

## Findings and limits

UI verification found that Chromium clipboard permissions blocked Copy text. The action now uses a validated native clipboard IPC handler. The driver captures its output in the isolated app process without replacing the user's clipboard. The macOS packaging step tried to sign a TeX font-metric cache file as executable code; excluding only the data cache from individual code signing fixed packaging while the compiler binary and app bundle remain signed ad hoc.

The restore driver initially observed the previous successful compile before the new restore completed. It now waits for the new version before asserting compilation. Cache preparation was expanded to include the actual starter's font/macro combinations. No private candidate data or credentials are included. Windows compilation passed in the first M4 run; its UI artifact exposed a saved-source/editor synchronization error. The final build fixes it and the complete Windows journey now passes. See the [M5 report](2026-11-01-m5-delivery.md) for the final source identity and CI evidence.
