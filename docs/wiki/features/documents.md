---
title: Saved letters and master CV
section: Features
updated: 2026-11-01
---
# Saved letters and master CV

**FEAT-letters** prepares private plain-text cover letters. **FEAT-cv** maintains one profile-based master CV. Neither feature submits applications or creates per-job CVs.

## Saved workspace

Saving a job with a complete description queues one letter. Incomplete postings wait for the user to paste the full description. Generation shares the serialized ChatGPT queue with the assistant; authentication and allowance failures pause work with Retry and Stop controls. Profile changes and concurrent letter edits invalidate a pending generation rather than overwriting newer work.

Saved opens the posting snapshot, notes and letter editor. Save appends a version; the version selector shows history and Restore appends the selected text as a new version. Regenerate uses the current profile and posting. Copy text uses the native clipboard. The Saved/Applied selector is only a manual record. Open posting opens the employer URL for the user.

Generated paragraphs cite supported candidate facts internally. Unsupported numbers, invented AI experience and invalid evidence references are rejected. The target is 250–350 words, with a 600-word maximum and a visible review note when outside the target. Review notes, word count and the profile revision remain available beside the draft. Users can freely edit their own text. Dirty editors require confirmation before navigation.

## CV workspace

Generate from profile creates LaTeX from confirmed profile records using the MIT-licensed starter in `resources/latex`. It preserves project attribution and escapes LaTeX syntax in candidate text. The source is editable in CodeMirror with line numbers, syntax highlighting and normal undo/redo. Save and Restore create new versions and compile them. Profile changes show a regeneration notice without replacing manual edits.

The right pane previews the compiled PDF. Download .tex and Download PDF use native save dialogs. Compile diagnostics stay visible; failure keeps the source and previous successful PDF. The PDF version is identified when it differs from the selected source. Recompile retries the selected saved source. The assistant can read, edit, generate and compile the master CV and read/rewrite saved letters through version-checked tools.

Tectonic 0.15.0 and a prepared cache ship with the app. Runtime compilation is offline and untrusted: `sandbox-exec` on macOS, the Go AppContainer helper on Windows. No shell escape or unsandboxed fallback exists. The compiler has access to its temporary work area and cache; private files, external writes, network and child programs are denied. Time/output limits and cancellation terminate the process. Windows uses a kill-on-close job object, including broker death. Missing compiler files produce an actionable error.

## Verification recipe

Use [shared setup](../verification/setup.md) with fictional records. Prepare the compiler with `npm run setup:latex` (Windows requires Go 1.24 and the cache artifact produced on macOS). Run `npm run check` and `npm test` for document evidence, version conflicts and failure preservation.

After building, `node --experimental-strip-types tests/latex-sandbox.ts` runs actual compilation and adversarial file/shell/cancellation cases. On Windows also run `go test ./...` in `tools/texsandbox` for file, network, child-process and broker-death boundaries.

Set `WERK_EXE` to the fixture package after `npm run build -- --test` and `npx electron-builder --dir --publish never`. Run `node --experimental-strip-types tests/documents-smoke.ts` for save-to-letter, edit/restore/copy/manual Applied, CV generation, preview/download, dirty navigation, failed compilation and restore. Small live letter checks use a separate fictional database and the app-owned subscription credential store.

[M4 verification](../verification/runs/2026-11-01-m4-documents.md) records actual results and platform coverage.
