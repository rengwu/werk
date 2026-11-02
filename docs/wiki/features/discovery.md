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

- Settings → Sources stays alphabetical regardless of enabled state. Mouse and keyboard toggles preserve the row's position, scroll offset and checkbox focus, following [REB-source-order](../decisions/index.md).
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

## Browsing controls

[REB-job-browsing](../decisions/index.md#product) restores the selected legacy controls:

- **Inbox:** New / All matches / Skipped. Skipped contains stored skipped records, including closed ones until retention expires them. **Move back to New** reverses a skip; closed jobs remain outside New. Best match is the default sort; Recently discovered uses the first discovery time, independently of the posting's published date. Both orders have a stable job-ID tie-breaker.
- **Saved:** All / Saved / Applied. These are manual application records. Recently saved is the default sort, with Best match and Recently discovered also available. A status change immediately moves the row into the appropriate subset.
- **Filters:** match level, work arrangement, posted date and searchable location selections. Multiple locations match **any** selected value, combined with the other filters and full-text search. Location choices include countries, broad regions and subregions, cities/source labels in search, Worldwide, Unspecified and Unresolved where present. Countries include resolved cities; regions include their countries and narrower regions. A country selection does not imply that region-only or Worldwide postings list that country. Worldwide requires an explicit global statement; Unspecified covers missing/remote-only locations, while Unresolved covers unrecognized labels. These choices do not establish work authorization.
- The location disclosure uses native search and checkboxes. Escape closes it and returns focus to its summary without clearing job search. **Clear locations** resets location selections. **Clear filters** resets the four filter groups while retaining search, the selected view and sort order. The Filters button counts active groups even when collapsed.
- Inbox and Saved remember their own view, search, sort and filters across navigation and renderer reloads in the same session. These choices do not update the profile or expand what is collected. Changing a control resets pagination to the first page. Filtering does not discard an unsaved document edit.

SQLite schema 7 adds indexed location membership derived from the existing resolver. Upgrades and backup restores rebuild it from original job locations; source changes and profile reassessment refresh it, and job deletion cascades. Sorting and filtering happen before SQL pagination. The picker queries distinct stored location labels separately; typing a job search does not reconstruct a full in-memory jobs snapshot. The backup format is unchanged.

## Verification recipe

Use [setup](../verification/setup.md) and fictional data:

```sh
npm run check
npm test
npm run build -- --test
npx electron-builder --dir --publish never
WERK_EXE="$PWD/release/mac-arm64/werk.app/Contents/MacOS/werk" node --experimental-strip-types tests/discovery-smoke.ts
```

The driver seeds only the profile/source prerequisites, then uses setup Scan now, real adapter parsing, SQLite and keyboard/UI actions. It checks FTS, filters, highlights, notes, hiding, source counters and schedule. It enables a source at the bottom of Settings with a mouse click, disables it with Space, and checks that row order, scrolling and focus stay stable. It then enables MoAIJobs and verifies a matching job reaches Inbox through a recorded feed. Temporary data is removed; sanitized evidence remains in `smoke-output/discovery/`. For an authorized single public read: `node --experimental-strip-types scripts/check-live-discovery.ts` uses Remotive and an isolated fictional profile. `scripts/check-live-feeds.ts` accepts exact RSS source names and uses one bounded scan per named source; see [setup](../verification/setup.md#discovery-fixtures).

`tests/job-filters.test.ts` exercises sort/date distinctions, SQL pagination, view/criterion composition, location coverage, upgrade backfill, backup restoration and API validation. With the same packaged test app, run `WERK_EXE="<executable>" node --experimental-strip-types tests/job-filters-smoke.ts`. It seeds fictional jobs and then uses the actual controls for sorting, Skip/recovery, location search/multi-selection, Saved/Applied changes, session restoration and Clear filters. It checks keyboard Escape/focus, light/dark axe results and the 900×600 minimum window. Evidence is in `smoke-output/job-filters/`.

## Coverage and limitations

Source tests port the relevant archived JSON, RSS, structured HTML and location regressions, plus pipeline/FTS/closure/retention/criteria tests. The source catalog contains board-specific public discovery seeds; a board that changes or blocks public reads reports failure and keeps existing jobs. The live check is deliberately bounded; it does not certify all providers. Letter generation and the saved editing workspace arrive with M4.

## Verification history

- [Restored browsing controls and app branding](../verification/runs/2026-11-02-job-filters.md).

- [Stable source ordering](../verification/runs/2026-11-02-source-order.md).
- [Source expansion](../verification/runs/2026-11-02-source-expansion.md).
- [M3 discovery and triage](../verification/runs/2026-11-01-m3-discovery.md).
