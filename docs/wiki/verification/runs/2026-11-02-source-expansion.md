---
title: Source expansion verification
section: Verification
updated: 2026-11-02
result: Untested
---
# Source expansion verification

Scope: [FEAT-discovery and FEAT-inbox](../../features/discovery.md), thirteen added feeds, catalog upgrades, feed parsing and Settings-to-Inbox behavior. [Research and source limits](../../journal/2026-11-02-more-sources.md) record the selection. All profile and UI checks used fictional records in disposable folders; the user's data was not used for scans or inference.

## Build and environment

Local checks used a dirty tree based on `648df34d5a54164eac2b6aba4fba58319a6f18a3`, fingerprint `1e5ed42fcce8e7fde47b90b2e0d919f92bcfefb1f73f945c2fdef917505b3767`. The [source manifest](../../evidence/2026-11-02-source-expansion/source-manifest.json) records the files. macOS arm64, Node 22.19.0, Electron 44.9.1, SQLite schema 6. The isolated UI instance used the unchanged production main/renderer with the updated backend built for recorded HTTP responses and simulated inference. It did not share the live app's folder.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Typecheck and domain tests | Valid types, feed formats, metadata preservation and no regression | Typecheck and all 42 tests passed, including all 13 feed shapes | Passed | `tests/source-feeds.test.ts`, `tests/discovery.test.ts` |
| Catalog upgrade | Add missing feeds once while preserving existing configuration | Old installation fixture gained 13 feeds; disabled sources, IDs, cooldowns, checkpoint and custom board survived repeated reopen | Passed | `tests/source-feeds.test.ts` |
| Live feeds | Bounded reads produce usable job descriptions and preserve unknown metadata | 13 requests parsed 795 entries, with no empty descriptions; 663 were full descriptions and the rest excerpts | Passed | [Live results](../../evidence/2026-11-02-source-expansion/live.json) |
| Settings and Inbox | New feeds visible; enable, scan, ingest and triage work through real controls | Expanded discovery driver passed seven scenarios, including an enabled MoAIJobs feed with nested CDATA | Passed | [UI results](../../evidence/2026-11-02-source-expansion/ui.json), [Sources](../../evidence/2026-11-02-source-expansion/sources.png) |
| Packaged macOS and Windows | Same discovery behavior, defaults and reset counts in packaged apps | Awaiting CI | Untested | Build workflow |

## Findings and limits

MoAIJobs initially parsed with empty descriptions because its RSS contains literal nested CDATA. The parser now unwraps that text before sanitizing it; a fictional regression fixture and the 353-item live response both preserved descriptions. Python's comma-separated titles and Elixir's missing employer metadata remain unknown rather than guessed. Feed and publisher names do not establish worldwide work authorization.

The first local UI driver attempt used Playwright's immediate checkbox-state assertion for an asynchronous source update. Its screenshot showed the update had succeeded; the corrected driver waits for the checked state before scanning and passed. The application toggle behavior was unchanged.

Live availability is a dated observation, not a promise of uptime or hiring status. Upstream category filters can be broad, feeds may contain overlapping or stale entries, and no full crawl was performed. The matching results belong to the fictional profile only. No employer contact, application action, live model generation or release publication occurred.
