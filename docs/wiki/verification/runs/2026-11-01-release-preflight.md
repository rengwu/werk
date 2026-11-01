---
title: Windows setup and release asset preflight
section: Verification
updated: 2026-11-01
result: Passed
---
# Windows setup and release asset preflight

Scope: the user's Windows-PC setup trial and installer selection for the [desktop release workflow](../../features/desktop.md). Tag creation, GitHub release creation and publication are outside this preflight; they await approval.

## Build and environment

The user tested the supplied `werk-0.1.0-setup.exe` from revision `5c258cd75290c5ed1d0fda101c745e4e28a58108`, [CI run 41283633752](https://github.com/rengwu/werk/actions/runs/41283633752). The subsequent [CI run 41295845898](https://github.com/rengwu/werk/actions/runs/41295845898) also passed at `269d7e50c2d8b547238342a7016064e2fa5c1759`; intervening changes were documentation only.

The release-command check used a dirty tree based on `269d7e50c2d8b547238342a7016064e2fa5c1759`. The SHA-256 of `.github/workflows/build.yml` was `e44f5dd29795311f85fe70c39b635f78a7da79109ed93b876b287615471a6a74`. macOS Bash ran the workflow's exact command with `gh` replaced by an argument/file validator. Downloaded macOS and Windows artifact trees were linked under a temporary `dist/` directory; the temporary directory was removed after the observations were saved. The macOS artifact was used only to verify directory layout, not to revalidate its older binary.

## Results

| Scenario | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| Windows-PC setup trial | User confirms the supplied build installs and works | User reported “windows build works fine. setup tested to be working.” | Passed | [Attributed report](../../evidence/2026-11-01-release-preflight/results.json) |
| Reproduce original release asset selection | Locate the cause of missing installer paths | Original globs matched no files because artifact downloads retain the `release/` directory | Passed | [Baseline observation](../../evidence/2026-11-01-release-preflight/results.json) |
| Corrected draft-release command | Select one DMG and one setup EXE, retain the repository, version and draft arguments | Both real installer files resolved; draft/title/repository arguments matched; smoke evidence was excluded | Passed | [Corrected observation](../../evidence/2026-11-01-release-preflight/results.json) |

## Findings and limits

The release step now selects `dist/*/release/*.dmg` and `dist/*/release/*-setup.exe`. Runtime code and the tested installers are unchanged. To repeat the bounded check, arrange downloaded `werk-macOS` and `werk-Windows` artifacts below `dist/`, then substitute an argument/file validator for `gh` when running the exact release command. Require two existing installer files and the `--draft` argument; do not execute the GitHub write before approval.

The Windows-PC outcome is user-reported, not an independently observed test. Individual assistant, sign-in, CV and tray interactions were not separately reported; their packaged automated coverage is recorded in [M5 verification](2026-11-01-m5-delivery.md). No version tag, draft release or publication was performed during this preflight. Actual tag-triggered delivery remains to be checked after approval.
