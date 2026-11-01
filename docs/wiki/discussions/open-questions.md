---
title: Open questions
section: Discussions
updated: 2026-11-01
---
# Open questions

Implementation and packaged CI verification are complete through M5. The user approved the repository rename, now completed at [rengwu/werk](https://github.com/rengwu/werk), with the local remote updated and the release-check target verified. See [REB-rename](../decisions/index.md#repository-and-working-agreement). The user confirmed “windows build works fine. setup tested to be working.” The Windows-PC setup trial is complete; first-tag approval remains.

| Item | When | State |
| --- | --- | --- |
| First version tag | After the completed Windows-PC trial | Ready for approval to push `v0.1.0`. CI builds macOS and Windows installers and creates a draft release; the user publishes it. The user confirmed the [Windows build](https://github.com/rengwu/werk/actions/runs/41283633752/artifacts/13073868321) and setup work. This is a user-reported setup result; detailed manual feature checks were not individually reported. |
| Old ununemploy install on the user's Windows PC | Any time | The user removes it through Settings → Apps. |
