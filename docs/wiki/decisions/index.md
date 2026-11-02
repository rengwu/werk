---
title: Decisions
section: Decisions
updated: 2026-11-01
---
# Decisions

Current decisions for werk. The initial decisions came from grill-form rounds; later direct instructions are recorded below. the transcripts hold the exact wording and the options offered: [round 1](../journal/2026-11-01-grill-2429f43a2dda41cdf1aaa20116f739b4.md), [round 2](../journal/2026-11-01-grill-8310ced881c9d8f1fe6b9c2f5277b081.md), [round 3](../journal/2026-11-01-grill-28a582f50b30795a161c06d0221e222e.md), [round 4](../journal/2026-11-01-grill-79bc64157692f581ef75d39f3c59308f.md), [round 5](../journal/2026-11-01-grill-9472293cf4bb700313881eac8d7833b7.md). The [rebuild plan](../journal/2026-11-01-rebuild.md) records the findings behind them, and the [handoff](../journal/2026-11-01-werk-handoff.md) turns them into an implementation plan. The user's boundaries are in `AGENTS.md`.

“Differs” marks a choice other than the recommendation offered.

## Assistant revision after implementation feedback

**REB-pi-session (2026-11-01):** The user requested interruption, dropped files, local-file access and visible network/tool capabilities, then clarified: “it is essentially just another pi session running on the user's computer with full permissions”. This supersedes the earlier bounded-action and supplied-URL restrictions. Embed pi's actual session runtime with unrestricted local read/write/edit/shell and network tools, persistent context, streamed replies, visible tool results, steering, interrupt-and-send and queued follow-ups. Keep the same app-owned ChatGPT subscription, model and reasoning level. Keep attributed, versioned app tools so profile, letter and CV changes remain reviewable. Validation errors return to pi for correction within the run.

The no-application/no-engagement product rules remain assistant instructions. With full shell and network access they are **not a capability-enforced security boundary**. Automated discovery retains its destination restrictions. werk's CV compilation tool still uses the OS sandbox. See [assistant behavior and verification](../features/assistant.md).

## Product

**REB-source-order (2026-11-02):** The user reported that enabling a source reset scrolling and requested that checkbox state no longer control sorting. Keep Sources alphabetical regardless of enabled state, preserving the row, scroll position and checkbox focus when toggled. See [discovery](../features/discovery.md).

**REB-factory-reset (2026-11-02):** The user requested a Settings button to clear the entire app's state. Add a confirmed factory reset that removes personal records, conversations, copied attachments, app-owned ChatGPT credentials, schedules, source configuration and preferences, and returns to first-run setup. Cancel leaves data intact. Preserve originals and exports outside app-owned storage. Tests use fictional data; implementing the button does not authorize resetting the user's installation.

| ID | Decision | Round |
| --- | --- | --- |
| REB-name | The app is **werk**, always lowercase. | 2 |
| REB-audience | Public GitHub releases for anyone. macOS Apple Silicon and Windows 11 x64. No Unraid/Docker and no Linux desktop. | 1 |
| REB-clean | Start completely clean: import no profile, CV, jobs or letters. The old data is backed up locally, outside the repository. Differs. | 1 |
| REB-inbox | The opening screen is a triage inbox. **New** lists unreviewed jobs that pass the search criteria, best match first. Save or Skip removes a job from New; **All matches** keeps it searchable. Unopened titles are bold. | 1 |
| REB-criteria | Profile → Search criteria decides what is collected and what appears in New. Filters only narrow a view temporarily. | 1 |
| REB-timezone | Minimum working-hours overlap with the user's timezone, at country level. | 1 |
| REB-detail | A decision summary, then the description with matched and missing requirements highlighted. | 1 |
| REB-saved | A saved job opens a workspace: posting and notes beside the letter, with review notes and status. | 1 |
| REB-lifecycle | Saved and Applied only, as manual records. | 1 |
| REB-profile | A fact sheet with status and source for each fact, editable directly or through the assistant. | 1 |
| REB-navigation | Inbox, Saved, Profile and CV; Sources, AI, Backup and Diagnostics inside Settings. | 1 |
| REB-documents | The CV is LaTeX compiled to PDF. Cover letters are plain text only. | 2 |
| REB-cv-source | The master CV is generated from the profile on request, then edited by the user or the assistant. Each generation is a new version. No per-job CVs. | 2 |
| REB-additions | Keyboard triage, a first-run setup checklist, Hide company. | 1 |
| REB-removals | Seen state, duplicate grouping control, legacy resume code, Jev, the HTTP body cache, description history for unsaved jobs, VueJobs detail enrichment, the custom installer and checksum inventory. | 1 |
| REB-sources | Keep sources that produced saves, Greenhouse/Ashby/Lever company boards, structured feeds and APIs, and scraped public boards. Drop Hacker News, X and the boards that never returned a job. Keeping scraped boards differs. | 1 |
| REB-default-sources | Initially 17 APIs/RSS feeds; expanded to 30 on 2 November after the user requested more job boards. The 20 scraped boards remain available but off. Missing catalog entries are added on startup without changing existing preferences or custom boards. Company boards are added by the user. See [research](../journal/2026-11-02-more-sources.md). | 3; user source-expansion request |
| REB-schedule | Scans are manual by default. Settings can turn on a schedule. Differs (every 4 hours was recommended). | 3 |
| REB-retention | Keep Strong and Adjacent jobs that are not Incompatible and pass the criteria; fingerprint everything else; delete unsaved jobs 30 days after they close. No HTTP body cache. | 1 |
| Unchanged | No application submission, uploads, form filling, outreach or engagement; pi-ai with the ChatGPT subscription, `gpt-5.6-sol` and high reasoning; a cover letter generated on save; the right-hand assistant overlay; local data with no login; deterministic matching and eligibility rules; the Cursor/Clarity visual language; ZIP backup of personal data. | 1 |

## Platform and delivery

| ID | Decision | Round |
| --- | --- | --- |
| REB-runtime | Electron with TypeScript. `node:sqlite` with FTS5 works in Electron 44.9.0, so no native modules. The one exception is the Windows LaTeX sandbox helper in Go (REB-latex-isolation). | 1 |
| REB-process | One backend process owns the API, scheduler and serialized model queue, and pushes changes to the UI. | 1 |
| REB-stack | esbuild-bundled backend; typed columns, indexes and FTS5; TanStack Query invalidated by push events; plain chat UI; minimal CodeMirror; built-in PDF viewer; Playwright smoke tests against packaged apps; Settings → Diagnostics. | 1 |
| REB-tray | Closing the window keeps werk running: in the Dock on macOS, in the system tray on Windows. | 3 |
| REB-latex-isolation | CV LaTeX compiles only inside an OS sandbox: `sandbox-exec` on macOS, the legacy Go AppContainer helper on Windows. The assistant keeps editing LaTeX directly. Tectonic alone can read and write any of the user's files ([evidence](../journal/2026-11-01-werk-handoff.md#tectonic-file-access)). Round 5 offered the rule-lean alternative, in which untrusted text never becomes LaTeX and no sandbox is needed; it was recommended and declined. | 4, 5 |
| REB-delivery | Unsigned builds; an in-app notice links to a newer GitHub release; no automatic updates. Differs (signing was recommended). | 1 |
| REB-builds | GitHub Actions builds unsigned installers on version tags into a draft release. | 2 |
| REB-first-tag | On 1 November, after the Windows-PC setup trial, the user selected “Push v0.1.0” in form `316b089663e8da00f4b6fe36f1128cc7`, approving commit `3711bdf4635d07b34bae577200d5f922af9f6f87` and its tag-triggered draft release. The tag was pushed at that exact revision, and CI created the draft with both installers; see [verification](../verification/runs/2026-11-01-v0.1.0-draft.md). The user publishes the draft. | Release approval |
| REB-icon | Light monogram with a green match dot: [reference](../attachments/werk-design/icon.png), source `design/werk/icon.svg`. Differs (the dark monogram was recommended). | 3 |
| REB-license | MIT. | 3 |

## Repository and working agreement

| ID | Decision | Round |
| --- | --- | --- |
| REB-repo | Same repository. The old app is archived on the `legacy` branch at `e493246`, and the wiki restarted for werk. | 2 |
| REB-rename | Originally planned for the first release. On 1 November, after the completed rebuild and passing packaged CI, the user selected “Rename to werk” in release-next-step form `4c80f066d56e10b85177046aafd941cd`. Renamed to `rengwu/werk` and updated the local remote; the legacy branch and existing prerelease remain. First-tag approval is separate. | 3; release approval |
| REB-retire | The old app, its data folder and the checkout's old outputs and private files were deleted on 1 November after the user confirmed each path. | 2, 3 |
| REB-restructure | Restructured in the planning session, before handoff. | 3 |
| REB-branch | Work directly on `main`. Differs (a `werk` branch with pull requests was recommended). | 3 |
| REB-github | The agent may push `main` and `legacy` without asking. Tags, releases, pull requests and other GitHub actions need the user. | 3 |
| REB-autonomy | Continue through all milestones; stop only for consequential unsettled decisions. | 3 |
| REB-live-checks | Small live checks are allowed: real inference and bounded read-only scans, with a fictional profile. | 3 |
| REB-windows-testing | The user tests Windows builds on their PC only before releases. Differs (after each milestone was recommended). For `v0.1.0`, the user reported “windows build works fine. setup tested to be working.” This completed the Windows-PC setup trial before first-tag approval. | 3; user confirmation |
| REB-docs | No Slopchan. The jstack wiki holds all project documentation. | 3 |
| REB-start | Implementation starts with milestone 1, proving Windows installation and startup first. | 2 |
