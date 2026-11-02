---
title: Profile layout
section: Verification
updated: 2026-11-02
result: Untested
---
# Profile layout

Scope: [FEAT-profile](../../features/profile.md), the reported inset scrollbar and mismatched content widths. The CSS now separates the full-width scrolling area from its centered 760 px content column. No profile records, fields or model behavior changed.

## Build and environment

Local baseline: `2b852ce`, macOS arm64 and Electron 44.9.1. The changed build differs only in `src/renderer/style.css`; its exact base and file hash are in the [manifest](../../evidence/2026-11-02-profile-layout/source-manifest.json). An isolated copy of the production development app was inspected with Playwright, first with an empty data folder, then with the fictional Alex Example profile. The renderer was rebuilt with Vite. No live inference, user profile or job scan was used.

## Recipe and observations

Open Profile with empty and fictional populated data. Resize the window's content to 1440 × 900 and 900 × 600. Inspect the toolbar, notice, sections and scrollbar; scroll to Missing, edit and cancel Basics, then open and close the assistant. Compare the page bounds before and after the overlay opens. [Measurements](../../evidence/2026-11-02-profile-layout/layout.json) record each state.

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Baseline | Reproduce the reported mismatch | At 1440 px the scrollbar ended 220 px before the pane edge, and toolbar/notice extended 161 px past the sections | Passed | [Before](../../evidence/2026-11-02-profile-layout/before-wide.png) |
| Empty and populated layouts | One scrolling area at the pane edge; aligned content | At both sizes the page reached the main pane's right edge, toolbar/notice/section edges matched, and scroll width equaled client width | Passed | [Empty wide](../../evidence/2026-11-02-profile-layout/empty-wide.png), [Filled narrow](../../evidence/2026-11-02-profile-layout/filled-narrow.png) |
| Scrolling and editing | Reach the last section; preserve fixed header; form fits | Missing was visible at the bottom; document scroll remained zero; the narrow Basics form fit and Cancel restored the fictional name | Passed | [Measurements](../../evidence/2026-11-02-profile-layout/layout.json), [Edit narrow](../../evidence/2026-11-02-profile-layout/edit-narrow.png) |
| Assistant overlay | Retain the page bounds and 520 px overlay | Page stayed 680 × 556 at the minimum window size; overlay was 520 px wide | Passed | [Measurements](../../evidence/2026-11-02-profile-layout/layout.json) |
| Typecheck | Styles leave TypeScript valid | Passed | Passed | `npm run check` |
| Packaged regression checks | Existing profile and accessibility flows pass on macOS and Windows | Pending CI | Untested | Build workflow |

## Limits

The spacing and screenshot review was performed on macOS. CI's existing profile and accessibility drivers cover packaged behavior on both platforms; they do not measure these specific layout bounds. No new permanent test was added for this CSS-only change.
