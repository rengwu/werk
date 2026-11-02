---
title: Restored job browsing and app branding
section: Verification
updated: 2026-11-02
result: Untested
---
# Restored job browsing and app branding

## Scope and identity

[FEAT-inbox and FEAT-discovery](../../features/discovery.md) and [FEAT-desktop](../../features/desktop.md), following [REB-job-browsing and REB-app-branding](../../decisions/index.md#product). Restore the four selected browsing controls and verify the built app's identity. All selected local checks passed; the aggregate remains Untested until Windows CI finishes.

Local base: `ce57f1a9be4d7775299b5b93183c539cb2c7d488`, dirty implementation identified by [source manifest](../../evidence/2026-11-02-job-filters/source-manifest.json), aggregate SHA-256 `74500341819480e44fafeebbc07c3df5a493d8cf900c974eff3801d6f09637df`. macOS 27 arm64; Node 22.19.0 drives tests; the production app uses Electron 44.9.1, Chromium 152.0.7977.167, Node 24.22.0 and SQLite 3.53.4, schema 7. Built with `npm run build` and `npx electron-builder --dir --publish never`; app at `release/mac-arm64/werk.app`. No version tag or release was created.

The drivers created fresh OS-temporary data folders with Alex Example and fictional example.com jobs. No user data or credentials were opened, no inference was needed for these flows, and cleanup removed only the driver's folders. The final filter driver ran against the production app; its simulated-inference environment variables are ignored by production builds.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Typecheck, unit suite and production package | Build and existing invariants remain valid | TypeScript passed; 47 tests passed; macOS package completed | Passed | [Checks](../../evidence/2026-11-02-job-filters/checks.json) |
| Sort and SQL composition | Stable match/discovery/save-date ordering; filters apply before pagination | Unit fixtures distinguish discovery from published time and verify pagination; UI changes ordering | Passed | [Filter results](../../evidence/2026-11-02-job-filters/filters.json) |
| Skipped view and recovery | Skip removes from New; a skipped posting can return to New | Actual keyboard Skip, Skipped tab and Move back to New completed | Passed | [Filter results](../../evidence/2026-11-02-job-filters/filters.json) |
| Saved / Applied | Separate manual states; status changes move rows | Actual tabs and application-status changes update the subsets | Passed | [Saved screenshot](../../evidence/2026-11-02-job-filters/saved-applied.png) |
| Unsaved letter protection | Filters do not discard edits; row selection honors Cancel/Discard | Draft stayed through filtering and a canceled row change; accepting discard opened the other letter | Passed | [Filter results](../../evidence/2026-11-02-job-filters/filters.json) |
| Location multi-select | OR within locations, AND with other criteria; preserve geographic uncertainty | Countries, region membership, city search, Worldwide, Unspecified and Unresolved matched their fixtures | Passed | [Light screenshot](../../evidence/2026-11-02-job-filters/filters-light.png), [filter results](../../evidence/2026-11-02-job-filters/filters.json) |
| Session and reset controls | Each page remembers choices; clear controls remove only their stated filters | Navigation/reload restored search/sort/filters; Clear filters kept search and sort | Passed | [Filter results](../../evidence/2026-11-02-job-filters/filters.json) |
| Upgrades and backups | Derived location memberships survive upgrade/restore and follow source changes/deletion | Schema 6 fixture migrated and backfilled; unchanged-format backup restored; stale memberships were removed | Passed | [Checks](../../evidence/2026-11-02-job-filters/checks.json), tests/job-filters.test.ts |
| Keyboard, themes and minimum size | Accessible native controls and no horizontal overflow at 900×600 | Escape returned focus; light/dark axe audits had zero violations; results retained usable height | Passed | [Dark screenshot](../../evidence/2026-11-02-job-filters/filters-dark.png), [filter results](../../evidence/2026-11-02-job-filters/filters.json) |
| macOS name/version/icon | Built app carries werk metadata and the selected icon | Runtime and Info.plist report werk / io.github.rengwu.werk / 0.1.1; packaged PNG matches source; platform icon differs from stock Electron | Passed | [Shell results](../../evidence/2026-11-02-job-filters/shell.json), [extracted icon](../../evidence/2026-11-02-job-filters/app-icon.png) |
| Packaged shell regression | Startup, backend recovery, close/reopen and appearance persistence still work | Startup 823 ms; all selected launch scenarios passed | Passed | [Shell results](../../evidence/2026-11-02-job-filters/shell.json) |
| Windows install/launch, metadata and filters | Existing CI installer and new controls pass on Windows | Pending main-branch CI | Untested | CI result to be recorded |

## Corrections and limits

Visual review replaced nested scrolling in the location controls with a single scrolling options list that shrinks at the minimum window size. The screenshot driver now waits for resizing and paint before capturing native selects.

The first exploratory branding probe used Electron's `app.getFileIcon` from the main-process debugger and the instrumented app exited during that probe. This API is not called by the product. The final driver checks the platform resources directly: macOS Info.plist plus native `sips` rasterization, and Windows executable version information plus native associated-icon extraction. The final macOS launch/lifecycle check passed with that probe removed.

Native Finder/Dock/Windows taskbar click behavior and a manual Windows-PC trial are outside this run. Windows is checked by the existing CI install-and-launch workflow. No live source scan, model generation, installer publication or release publication is part of this change.
