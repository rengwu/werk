---
title: Profile and search criteria
section: Features
updated: 2026-11-02
---
# Profile and search criteria

**FEAT-profile** implements [REB-profile and REB-criteria](../decisions/index.md#product). The latest SQLite `profile_versions` document is canonical. New installations have no saved revision and no candidate facts. The initial working-hours preference uses the computer's timezone and 09:00–18:00 hours.

## Entry points and outcomes

Profile has inline Save/Cancel forms for basics, eligibility preferences, experience, projects, education, additional facts and missing questions. Facts retain Confirmed, Preference or Inferred status and source references. User edits add an attributed revision. Previous versions → Restore appends a new revision. Concurrent edits against an old revision are rejected. Unsaved forms guard navigation and quit.

The Profile scrolling area fills the main pane beneath its fixed header. Its toolbar, readiness notice and sections share one centered content column, up to 760 px wide, and shrink to fit the minimum 900 × 600 window without horizontal scrolling. The scrollbar stays at the pane's right edge. Opening the assistant leaves the page size unchanged.

Search criteria stores target roles, location choices, work arrangements, timezone, work hours, minimum overlap and hidden companies. Its overlap preview calls the same backend function used by discovery: compare the user's local work hours with each country's 09:00–18:00 day and keep its best-overlapping IANA zone. [Geography attribution](../journal/2026-11-01-geography-attribution.md).

Readiness requires name, current location, target roles, useful background and work arrangements. Education or projects can supply background. Unknown citizenship and authorization answers do not block readiness. Setup links to profile/criteria and the [assistant](assistant.md); source selection and scanning arrive in M3.

## Verification recipe

Use [shared setup](../verification/setup.md). `npm test` exercises empty installation, evidence validation, revision conflict, restore, readiness and timezone overlap. Against a packaged test build, `WERK_EXE="<executable>" node --experimental-strip-types tests/profile-smoke.ts` builds a fictional profile through the assistant from an attached PDF, edits its name in the form, restores revision 1 as revision 3, opens the overlap preview and dismisses a dirty-navigation confirmation. Cleanup removes only the driver's temporary data.

## Coverage and history

Tests cover unknown eligibility, revisions and dirty navigation; full keyboard/accessibility audit and unsaved quit are revisited in M5. Awards can be preserved and added by the assistant; a dedicated awards form is not part of the specified profile sections.

- [Profile layout](../verification/runs/2026-11-02-profile-layout.md): empty, populated and editing states at wide and minimum window sizes.
- [M2 run](../verification/runs/2026-11-01-m2-profile.md).
