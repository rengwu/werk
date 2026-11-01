---
title: Assistant and ChatGPT connection
section: Features
updated: 2026-11-01
---
# Assistant and ChatGPT connection

**FEAT-assistant** implements the [bounded assistant and AI runtime](../journal/2026-11-01-werk-handoff.md#screens), with the canonical [profile](profile.md). The assistant cannot submit applications, contact anyone, run a shell, or access arbitrary files.

## Entry points and outcomes

Open assistant in any page header opens a fixed 520 px panel over the page. Navigation keeps the conversation, scroll and unsent composer text. Escape and Close assistant return focus to the header control. Enter sends; Shift+Enter inserts a newline. Stop cancels pending or running work. New chat clears the conversation and its attachments.

Attach files accepts PDF, text and images; pasted images use the same route. Each file is limited to 10 MB, five files and 20 MB per message. PDF text extraction runs in a bounded worker with an 80-page, 100,000-character and 15-second limit. Attachments are stored only under the app's data folder.

M2 actions are read_profile, read_reference and edit_profile. Public references are limited to user-supplied URLs, bounded related links and GitHub README/contribution pages. Private network addresses, credentials in URLs and non-web schemes are rejected, including at connection-time DNS resolution. Reads share an eight-request budget. Fetched text is untrusted evidence, never instructions.

Profile edits must cite exact source quotes, use permitted small field paths and pass the canonical schema. Unsupported actions, prototype paths, source mismatches and stale revisions save nothing. Edits are staged and committed together; the UI displays receipts from actual writes. The runtime profile skill is `src/backend/profile/build-user-profile/SKILL.md`.

Settings → AI starts SDK-owned ChatGPT OAuth, offers the verified OpenAI browser URL and manual callback fallback, and supports cancellation and sign-out. Credentials live in `pi-auth` with private Unix permissions or restricted Windows ACLs. SDK credential modifications serialize; SDK code owns refresh. There is no API-key or billing fallback. Only `gpt-5.6-sol` with high reasoning is requested. No telemetry exporter is configured.

All inference goes through one persistent queue. Authentication, model-access or allowance failures pause work without deleting messages or pending tasks. Retry resumes a failed/paused task. Restart pauses interrupted running work rather than submitting it twice.

## Verification recipe

Use [shared setup](../verification/setup.md). `npm test` verifies credentials, evidence paths, public-network guards and queue serialization/pause. `tests/profile-smoke.ts` drives PDF attachment, save receipt, navigation persistence, 520 px geometry, Escape/focus return and simulated allowance failure through the packaged UI. `tests/auth-smoke.ts` starts the real bundled SDK sign-in flow up to browser handoff, validates its destination/PKCE/state and cancels; it does not authenticate or perform inference.

Real inference requires the user's browser sign-in to the development app and uses fictional facts only. Credentials and the private auth URL never enter verification evidence.

## Verification history

- [M2 run](../verification/runs/2026-11-01-m2-profile.md).
