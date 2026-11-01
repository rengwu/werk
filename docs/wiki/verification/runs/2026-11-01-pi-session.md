---
title: Embedded pi session verification
section: Verification
updated: 2026-11-01
result: Untested
---
# Embedded pi session verification

Scope: [FEAT-assistant](../../features/assistant.md) after [REB-pi-session](../../decisions/index.md#assistant-revision-after-implementation-feedback). This replaces the bounded loop after the user's reported interruption, file access and quote-validation problems.

## Build and environment

Base `54aa41fa56830d706e88e95d4600ce9b6fc13743`, dirty tree fingerprint `df4381a8b35d1825fa8612b11ec10afcc46b37ceb0926c56c7ce97d1fe75066e` ([manifest](../../evidence/2026-11-01-pi-session/source-manifest.json)). macOS arm64, Electron 44.9.1, pi-coding-agent/pi-ai 1.3.0, schema 5. Tests use temporary folders and fictional facts. The live SDK check uses an isolated fictional database and the existing app-owned OAuth credential store; it does not read or change the user's profile.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Type and domain checks | Existing behavior plus actual pi lifecycle | Typecheck and all 32 tests passed | Passed | [Recipe](../../features/assistant.md#verification-recipe) |
| Local/network tools | Read/write files and HTTP through actual tools | Real file read/write and localhost request succeeded | Passed | [Results](../../evidence/2026-11-01-pi-session/results.json) |
| Quote rejection recovery | Failed edit returns to model; valid repair saves once | Unsupported quote rejected, next tool call saved revision 1 | Passed | `tests/assistant.test.ts` |
| Interactive controls | Dropped arbitrary file, attachment-only send, visible tools, steering and interruption | UI assertions passed; shell command stopped before replacement reply | Passed | [UI](../../evidence/2026-11-01-pi-session/assistant.png), [results](../../evidence/2026-11-01-pi-session/results.json) |
| Persistence and allowance | Restore pi context, tool history and composer; pause without data loss | Restart/reload and simulated allowance checks passed | Passed | [Recipe](../../features/assistant.md#verification-recipe) |
| Packaged PDF/profile regression | Same overlay, attachment, save and focus behavior | Packaged macOS driver passed | Passed | `tests/profile-smoke.ts` |
| Real ChatGPT inference | Fixed model/high reasoning executes real read/profile tools | read, read_profile and edit_profile succeeded; fictional revision 1 ready | Passed | [Live result](../../evidence/2026-11-01-pi-session/live.json) |
| Windows packaged pi | Same tools, PowerShell interruption and UI journey | Awaiting CI for this change | Untested | [CI recipe](../setup.md#windows-ci) |

## Findings and limits

An initial integration test found SQLite null evidence URLs were passed into a schema expecting an optional string. Normalizing those fields fixed the issue. The quote-error regression verifies recovery rather than weakening evidence validation. Allowance classification was extended to recognize the explicit subscription allowance message.

The first local UI-driver attempt accidentally launched Electron's default app; that driver was stopped, its explicit timeout added, and the correct werk builds were used. Full access is intentional: no-engagement and versioned-record rules are assistant instructions, not technical restrictions on arbitrary shell programs. Public search may be blocked by service challenges. CV/letter workspaces and backup remain separate M4/M5 work; this report does not claim they are finished. No candidate evidence, credentials or private logs are included.
