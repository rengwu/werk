---
title: Open questions
section: Discussions
updated: 2026-11-01
---
# Open questions

Implementation and packaged CI verification are complete through M5. The user approved the repository rename, now completed at [rengwu/werk](https://github.com/rengwu/werk), with the local remote updated and the release-check target verified. See [REB-rename](../decisions/index.md#repository-and-working-agreement). The user's Windows-PC trial and first-tag approval remain.

| Item | When | State |
| --- | --- | --- |
| Windows-PC trial and first tag | Before the first release | Use the [verified Windows artifact](https://github.com/rengwu/werk/actions/runs/41283633752/artifacts/13073868321), containing `release/werk-0.1.0-setup.exe`. The same installer is available locally under `release/`. The user tests installation, launch, ChatGPT sign-in, assistant tools, CV compilation and close/reopen/quit on their PC, then approves the first `v0.1.0` tag. CI creates a draft release; the user publishes it. |
| Old ununemploy install on the user's Windows PC | Any time | The user removes it through Settings → Apps. |
