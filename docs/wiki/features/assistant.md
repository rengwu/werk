---
title: Assistant and ChatGPT connection
section: Features
updated: 2026-11-01
---
# Assistant and ChatGPT connection

**FEAT-assistant** embeds pi's AgentSession with full local file, shell and network permissions, following [REB-pi-session](../decisions/index.md#assistant-revision-after-implementation-feedback). It uses the canonical [profile](profile.md) and versioned werk record tools. Application submission and engagement remain prohibited by assistant instructions; full shell access means these are not capability-enforced guarantees.

## Entry points and outcomes

Open assistant in any page header opens a fixed 520 px overlay. Navigation keeps the conversation, scroll and composer. Escape and Close assistant return focus. Enter sends, Shift+Enter inserts a newline, and Alt+Enter interrupts before sending. While working, the composer stays usable: Steer injects the message after the current model/tool turn, Interrupt aborts the current run and sends the replacement, and Queue runs the follow-up after the current request. Stop stays visible above the page edge and aborts model/tool work. New chat clears the conversation, its pi session and attachments.

Replies stream as Markdown. Tool rows show the tool, target, running/completed/failed status, inputs, output and duration. Validation failures return to pi as tool results so it can correct them in the same run; successful app edits show actual version receipts. There is no six-round cap. Pi handles context compaction and stores its session under the data folder's `pi/sessions`. SQLite stores the UI transcript, tool activity, evidence and durable task state. Interrupted work pauses after a backend restart. Unsent text and pending attachments survive renderer reloads.

Full access lists the current tools and working directory. The session starts in the user's home directory and can read absolute and `~` paths, write/edit files, run Bash on macOS or PowerShell on Windows, grep/find/list files, read HTTP(S) URLs and search the web. There is no supplied-URL or local-network allowlist for the assistant. Discovery retains its independent public-destination guard. Search is a public service and may return challenges or errors; these are visible tool failures rather than claims of successful research.

Drop files anywhere on the panel, use Attach files, or paste files/images. Attachments can be sent without message text. Files up to 32 MB each, ten files and 128 MB per message are copied into app-owned storage. Larger files remain accessible by local path. Text and PDF extraction feed evidence; images go to the model. PDF extraction uses a worker with resource/time limits. Other file formats remain available for local processing through tools.

Profile, job, CV and letter tools read current records and validate versioned changes. Profile edits need source quotes and schema-valid field edits; errors identify the rejected field. App record edits do not bypass history by writing SQLite directly. CV tools use the OS-sandboxed compiler. Full filesystem/shell tools are not an OS sandbox; record and compilation rules are also in the assistant instructions.

Settings → AI uses SDK-owned ChatGPT OAuth and refresh. Credentials stay under `pi-auth` with private Unix permissions or Windows ACLs. Only `gpt-5.6-sol` and high reasoning are selected, with no ambient API-key or billing fallback. No telemetry exporter is configured. Assistant work and queued letter generations share one model queue. Authentication, model access or allowance errors pause work without losing messages, documents or queued tasks.

## Verification recipe

Use [shared setup](../verification/setup.md). `npm test` executes a real pi session against a simulated stream, including real local file reads/writes and localhost HTTP, rejected-then-repaired profile quotes, steering, interruption, session reopening and allowance pause. It also covers credentials and version validation.

After `npm run build -- --test` and `npx electron-builder --dir --publish never`, set `WERK_EXE` to the fixture app. Run `tests/assistant-smoke.ts` for drag/drop, attachment-only send, visible tools, streaming controls, shell interruption and draft/transcript reload; `tests/profile-smoke.ts` for PDF-to-profile, overlay geometry, Escape/focus return and allowance errors. CI runs both on macOS and Windows. `tests/auth-smoke.ts` checks the packaged OAuth handoff and cancellation without authenticating.

Small live checks use only fictional data and the app-owned ChatGPT sign-in. Credentials, real candidate facts and auth URLs never enter wiki evidence.

## Coverage and history

- [M2 run](../verification/runs/2026-11-01-m2-profile.md): original bounded implementation, retained as historical evidence.
- [Pi session run](../verification/runs/2026-11-01-pi-session.md): full-permission replacement.
- [Saved letters and master CV](documents.md): the session uses the same versioned storage and sandboxed compiler as the workspaces.
