---
title: Open questions
section: Discussions
updated: 2026-11-01
---
# Open questions

Implementation and packaged CI verification are complete through M5. The release sequence still needs the user’s explicit go-ahead.

| Item | When | State |
| --- | --- | --- |
| Rename the repository to `werk` | First release (M5) | Ready for approval; no rename performed. Decided ([REB-rename](../decisions/index.md#repository-and-working-agreement)). The user approves the rename; the agent then updates the remote and verifies the release-check target. |
| Windows-PC trial and first tag | After the repository decision | Use the [verified Windows artifact](https://github.com/rengwu/ununemploy/actions/runs/41283633752/artifacts/13073868321). The user tests it on their PC, then approves the first `v0.1.0` tag. CI creates a draft release; the user publishes it. |
| Old ununemploy install on the user's Windows PC | Any time | The user removes it through Settings → Apps. |
