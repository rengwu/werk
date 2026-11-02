---
title: Discovery and Inbox
section: Features
updated: 2026-11-02
---
# Discovery and Inbox

Feature IDs: `FEAT-discovery`, `FEAT-inbox`.

## Intent and basis

Discover and triage jobs against the canonical profile, following [REB-inbox, REB-criteria, REB-retention and source decisions](../decisions/index.md) and the [collection specification](../journal/2026-11-01-werk-handoff.md#collection-pipeline-proposed). There are no submission, form-filling, contact or external-write actions.

## Entry points and prerequisites

A ready [profile](profile.md) enables **Scan now** in setup or Inbox. Sources are inside Settings: 30 API/RSS sources on, 20 scraped boards off. Company ATS boards and RSS/Atom URLs can be added. Settings → General chooses Manual (default), Every 4 hours or Every 12 hours; each source still respects its own cooldown and daily/request limits. [The source expansion](../journal/2026-11-02-more-sources.md) lists the thirteen additional feeds, verified coverage and limitations.

## Expected outcomes

- Startup inserts missing catalog sources without replacing existing IDs, enabled choices, settings, cooldowns or custom boards. Restarting does not re-enable a source the user disabled. New feed entries follow the API/feed enabled default; scanning remains manual unless a schedule was already configured.
- Feed parsing preserves explicit employer, job location and employment metadata. Posting accounts are not employers. Python's ambiguous comma-separated employer/title stays intact with employer unknown; Berlin titles use their explicit employer suffix. Literal CDATA wrappers are sanitized into readable text. NoDesk, Dev Remotely, Startup Jobs, Berlin and Elixir remain excerpts; missing country/work-authorization information is not inferred from a board's remote branding.

- Keep only Strong/Adjacent, non-Incompatible postings that satisfy explicit criteria. Unknown locations, arrangements, work authorization and overlap do not exclude a posting. Rejected postings retain a URL/hash/revision/reason fingerprint, never a body.
- Match scoring uses the user's target role families and evidence, with separate professional/project attribution. Unsupported senior scope, credentials and AI/ML tenure limit the score. `MATCH_VERSION=6` records the adaptation from the archived candidate-specific role defaults to arbitrary profiles.
- A source refresh cannot downgrade a full description to an excerpt or overwrite a manual description. Every kept source copy retains its latest normalized evidence; a save freezes a description snapshot.
- Every profile revision atomically reassesses stored jobs. Nonqualifying New/Skipped records become fingerprints; Saved/Applied remain. HTTP validators are cleared so the next permitted scan can reconsider unchanged fingerprinted postings under the new criteria.
- Duplicates are hidden automatically and saved jobs are representatives. No duplicate control or Seen state is exposed.
- Only complete employer-board snapshots close missing jobs. Feeds, parser failures, conditional 304 responses and interrupted pagination never close missing jobs. New shows open, nonduplicate records by score/newness; All matches includes other stored states.
- Daily maintenance expires unsaved jobs 30 days after closure and fingerprints after 180 days, refreshes overlap for current daylight saving and optimizes SQLite.
- J/K select, S saves, X skips, O opens the ordinary posting link, / focuses FTS search, Escape clears it. Typing and the assistant overlay disable shortcuts. Save/Skip advance New selection and have Move back to New. Hide company appends a profile revision and preserves saved records.
- Filters are temporary; criteria control collection. Description highlights show exact evidence/requirement clauses. Notes autosave. Incomplete postings accept a manually pasted full description.

## Verification recipe

Use [setup](../verification/setup.md) and fictional data:

```sh
npm run check
npm test
npm run build -- --test
npx electron-builder --dir --publish never
WERK_EXE="$PWD/release/mac-arm64/werk.app/Contents/MacOS/werk" node --experimental-strip-types tests/discovery-smoke.ts
```

The driver seeds only the profile/source prerequisites, then uses setup Scan now, real adapter parsing, SQLite and keyboard/UI actions. It checks FTS, filters, highlights, notes, hiding, source counters and schedule, then enables MoAIJobs in Settings and verifies a matching job reaches Inbox through a recorded feed. Temporary data is removed; sanitized evidence remains in `smoke-output/discovery/`. For an authorized single public read: `node --experimental-strip-types scripts/check-live-discovery.ts` uses Remotive and an isolated fictional profile. `scripts/check-live-feeds.ts` accepts exact RSS source names and uses one bounded scan per named source; see [setup](../verification/setup.md#discovery-fixtures).

## Coverage and limitations

Source tests port the relevant archived JSON, RSS, structured HTML and location regressions, plus pipeline/FTS/closure/retention/criteria tests. The source catalog contains board-specific public discovery seeds; a board that changes or blocks public reads reports failure and keeps existing jobs. The live check is deliberately bounded; it does not certify all providers. Letter generation and the saved editing workspace arrive with M4.

## Verification history

- [Source expansion](../verification/runs/2026-11-02-source-expansion.md).
- [M3 discovery and triage](../verification/runs/2026-11-01-m3-discovery.md).
