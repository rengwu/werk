---
title: M3 discovery and triage verification
section: Verification
updated: 2026-11-01
result: Untested
---
# M3 discovery and triage verification

Scope: [FEAT-discovery and FEAT-inbox](../../features/discovery.md), including profile-driven reassessment and source controls.

## Build and environment

Base `5e9f923540de25a30a8ef746300faee5f84a37e7`, dirty implementation; fingerprint `20623e8d4f94ec2655ccd720e0725c8cc833c9a518e3346f7f0c3411a8105c0f` ([manifest](../../evidence/2026-11-01-m3-discovery/source-manifest.json)). macOS arm64, Electron 44.9.1, schema 3; Node 22.19 unit/adapter tests. The fixture package enables only recorded HTTP/model hooks. The single live scan runs the production HTTP reader with fictional facts and temporary data.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Static/domain/adapter checks | Types, defaults, evidence/eligibility, filters, FTS, preservation, dedupe, closure, retention | Typecheck and 31 tests passed | Passed | [Recipes](../../features/discovery.md#verification-recipe) |
| Recorded scan through UI | Keep only qualifying postings | Three matches; unrelated role fingerprinted | Passed | [Results](../../evidence/2026-11-01-m3-discovery/results.json) |
| Keyboard triage and query | Select/save/skip next, FTS, temporary filters and retained statuses | All assertions passed | Passed | [Inbox](../../evidence/2026-11-01-m3-discovery/inbox.png) |
| Evidence, notes and company hiding | Exact highlights, autosave, new profile revision, saved preservation | All assertions passed | Passed | [Results](../../evidence/2026-11-01-m3-discovery/results.json) |
| Source state | Live kept/saved counters and manual default | Counters updated after hiding; 12-hour schedule selected | Passed | [Sources](../../evidence/2026-11-01-m3-discovery/sources.png) |
| Bounded live discovery | One public read, fictional profile, compact storage | Remotive: 1 request, 8 kept, 5 fingerprints, 894,048 database/WAL bytes | Passed | [Live metrics](../../evidence/2026-11-01-m3-discovery/live.json) |
| Windows packaged discovery | Same fixture journey on installed/test packages | Awaiting this milestone's CI | Untested | [CI recipe](../setup.md#windows-ci) |

## Findings and limits

Visual review found source counters retained their pre-triage values because job events did not invalidate source queries. Job/profile changes now invalidate those queries, and the driver asserts the final counts. An initial driver assumed the order of equally scored jobs; it now reads the displayed first title before checking keyboard selection. Final scenarios passed after these fixes. A final match-chip text correction labels retained Stretch/Other saved jobs accurately; full M4 verification will cover those states.

Dependency audit required sanitize-html 2.18.1 rather than the initial legacy-era pin; the [upstream advisory](https://github.com/advisories/GHSA-x3q4-9hxx-gx8m) describes the fixed parser issue. Only build-tool moderate findings remain. Descriptions render as text, with no raw HTML or remote images.

Overall Untested until Windows CI completes. No real candidate facts, raw public scan bodies or credentials are stored in the wiki. Matching is deterministic and conservative; it does not establish legal eligibility. All-provider live availability and release testing on the user's Windows PC are outside this run.
