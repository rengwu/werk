---
title: Stable source ordering
section: Verification
updated: 2026-11-02
result: Untested
---
# Stable source ordering

Scope: [FEAT-discovery](../../features/discovery.md), the user's report that enabling a source resets scrolling. Sources now sort by name, case-insensitively, with ID as a stable tie-breaker. Enabled state does not affect order. No renderer scroll-restoration workaround was added.

## Build and environment

Baseline product revision: `386690a` with the updated discovery driver. The changed local build used the same base plus the two files recorded in the [dirty-tree manifest](../../evidence/2026-11-02-source-order/source-manifest.json). macOS arm64, Electron 44.9.1. Both runs used an isolated development fixture build, fictional profile and recorded HTTP responses; neither shared the user's app data. Commands follow the [discovery setup](../setup.md#discovery-fixtures), using `WERK_DEV_APP=1`.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Reproduce baseline regression | Enabling a bottom row reveals the reported jump | Row 51 moved to row 2; scroll offset changed from 1509.5 to 0 | Passed | [Before](../../evidence/2026-11-02-source-order/before.json), expected failure |
| Mouse enable and keyboard disable | Row order, scrolling and focus remain stable | Row 51 and scroll offset 1509.5 stayed unchanged in both directions; checkbox retained focus | Passed | [After](../../evidence/2026-11-02-source-order/after.json) |
| Discovery workflow and types | Counters, toggles and matching still work | All eight discovery UI scenarios and typecheck passed | Passed | [After](../../evidence/2026-11-02-source-order/after.json) |
| Packaged macOS and Windows | The same UI check passes in both packages | Pending CI | Untested | Build workflow |

## Limits

The local check covers toggles on an existing list. Adding a new source may legitimately change alphabetical positions. No live scan, model inference or release publication was needed for this fix.
