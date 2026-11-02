---
title: Stable source ordering
section: Verification
updated: 2026-11-02
result: Passed
---
# Stable source ordering

Scope: [FEAT-discovery](../../features/discovery.md), the user's report that enabling a source resets scrolling. Sources now sort by name, case-insensitively, with ID as a stable tie-breaker. Enabled state does not affect order. No renderer scroll-restoration workaround was added.

## Build and environment

Baseline product revision: `386690a` with the updated discovery driver. The changed local build used the same base plus the two files recorded in the [dirty-tree manifest](../../evidence/2026-11-02-source-order/source-manifest.json). macOS arm64, Electron 44.9.1. Both runs used an isolated development fixture build, fictional profile and recorded HTTP responses; neither shared the user's app data. Commands follow the [discovery setup](../setup.md#discovery-fixtures), using `WERK_DEV_APP=1`.

The fix was committed as `9be504a4bfe10eaad2b21c31d81b070ba0c7aced`. A production build completed, and the idle development app was restarted with its existing data. Native UI inspection confirmed alphabetical order with enabled and disabled boards mixed together and the enabled count unchanged. No source selection was changed in that instance during verification.

[CI run 41410942963](https://github.com/rengwu/werk/actions/runs/41410942963), attempt 2, passed at that exact revision. Windows passed in the first attempt; the macOS job passed on retry. [Individual checks](../../evidence/2026-11-02-source-order/ci.json) include typecheck, all 42 domain tests, production packaging and launch, and the fixture-package UI scenarios.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Reproduce baseline regression | Enabling a bottom row reveals the reported jump | Row 51 moved to row 2; scroll offset changed from 1509.5 to 0 | Passed | [Before](../../evidence/2026-11-02-source-order/before.json), expected failure |
| Mouse enable and keyboard disable | Row order, scrolling and focus remain stable | Row 51 and scroll offset 1509.5 stayed unchanged in both directions; checkbox retained focus | Passed | [After](../../evidence/2026-11-02-source-order/after.json) |
| Discovery workflow and types | Counters, toggles and matching still work | All eight discovery UI scenarios and typecheck passed | Passed | [After](../../evidence/2026-11-02-source-order/after.json) |
| Packaged macOS and Windows | The same UI check passes in both packages | All eight discovery scenarios passed on both platforms, including stable scroll, order and focus; full CI passed after the macOS retry | Passed | [CI checks](../../evidence/2026-11-02-source-order/ci.json) |

## Limits

The local check covers toggles on an existing list. Adding a new source may legitimately change alphabetical positions. No live scan, model inference or release publication was needed for this fix.

The first CI attempt passed on Windows. Its macOS app launched in 3437 ms, exceeding the existing 3000 ms smoke-test limit; later UI checks were consequently skipped. That [failed attempt](../../evidence/2026-11-02-source-order/ci-macos-attempt1.json) is retained. The macOS job passed when retried at the same revision with no code or timing-limit changes. The initial timing failure is not evidence of a source-order regression; it remains an observed startup-budget miss.
