# werk

werk is a local desktop app for job discovery, fit assessment, private cover-letter drafts and a master CV. It runs on macOS Apple Silicon and Windows 11 x64. You review and submit applications yourself.

The rebuild is ready for pre-release testing. Installers are available in the [Build workflow artifacts](https://github.com/rengwu/werk/actions/workflows/build.yml); no public werk release has been published. The previous app is archived on [`legacy`](https://github.com/rengwu/werk/tree/legacy).

## Install

- **macOS:** open `werk-0.1.0-arm64.dmg` and drag werk to Applications. The build is ad hoc signed, without an Apple developer certificate or notarization. For the first launch, use System Settings → Privacy & Security → Open Anyway. If macOS calls the downloaded app damaged, remove its quarantine attribute with `xattr -dr com.apple.quarantine /Applications/werk.app`.
- **Windows:** run `werk-0.1.0-setup.exe`. If SmartScreen blocks the unsigned installer, choose More info → Run anyway. It installs for the current user.
- Closing the window keeps werk running in the macOS Dock or Windows tray. Quit stops it. Updates are notices with a download link; installing a newer version preserves the data folder.

## Use

Connect your ChatGPT subscription in Settings → AI, build a profile, set your search criteria, and scan. New installations start empty, with 17 API/RSS sources enabled and scraped boards off. Scans are manual unless you enable a schedule.

The assistant is an embedded pi session with full file, shell and network access on your computer. Share local paths or URLs, drop files, inspect tool calls, and steer or interrupt work while it runs. It uses `gpt-5.6-sol` with high reasoning through your ChatGPT subscription; it does not silently switch models or use API-key billing. Profile changes retain supporting evidence and version history. The assistant is instructed to prepare private drafts and never submit applications or contact others; full shell access is not a technical restriction on those actions.

Saving a job queues a plain-text cover letter. The CV page generates one master LaTeX CV from your profile, with editable source and PDF preview. Compilation uses bundled Tectonic inside an OS sandbox with no unsandboxed fallback. There are no per-job CVs.

Settings → Backup exports current personal records and latest documents. Restore replaces personal records and history while preserving sign-in and app settings. Credentials, conversation history and older versions are excluded from the ZIP. Data stays in `~/Library/Application Support/werk` on macOS or `%APPDATA%\werk` on Windows. There is no cloud account or telemetry.

Settings → General → Reset werk clears app data, conversations, ChatGPT sign-in and preferences after confirmation, then opens first-run setup. Export a backup first if you want to keep your profile, jobs, letters or CV. Original files and exports outside the app's data folder are preserved. See [factory reset](docs/wiki/features/factory-reset.md).

## Develop

Use Node 22.19+ (CI uses Node 24), then:

```sh
npm ci
npm run setup:latex
npm run dev
```

On Windows, install Go 1.24 and place the `latex-cache` artifact from the Build workflow in `resources/runtime/cache` before running `setup:latex`. The script downloads the pinned compiler, builds the Windows AppContainer helper and verifies offline compilation. macOS prepares the package cache from the fixed starter inside its sandbox. Compiler/cache files are ignored by Git and shipped in installers.

Development uses a separate `werk-dev` data folder. `WERK_DATA_DIR` selects an explicit local folder. Never use personal data for tests.

```sh
npm run check
npm test
npm run package
```

[Verification setup](docs/wiki/verification/setup.md) describes packaged and simulated-inference checks. Tags create draft releases only after explicit approval; the user publishes releases.

Documentation: [project wiki](docs/wiki/index.md). License: [MIT](LICENSE). Installers include third-party notices, the Tectonic license and the CV starter license.
