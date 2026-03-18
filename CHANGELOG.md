# Changelog

All notable changes to NAM-BOT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-03-18

### Added

- macOS beta support with packaged `arm64` and `x64` DMG outputs, platform-aware backend defaults, and macOS CI build coverage
- Maintainer-run `Release macOS Beta` workflow so macOS DMGs can be attached to an existing tagged release after verification
- Maintainer-facing macOS support notes under `docs/`

### Changed

- Setup guidance, settings copy, and diagnostics documentation now include macOS terminology such as Terminal, Apple Silicon, MPS, and Finder where relevant
- Release workflow now keeps the normal `v*` tag path focused on Windows while allowing macOS beta assets to lag behind until they are explicitly built and reviewed

### Fixed

- Conda detection, file-picker behavior, and renderer fallback paths so backend setup no longer assumes Windows-only executable names on macOS

## [0.3.6] - 2026-03-17

### Changed

- Job editor output-root modes now prioritize the Settings default path first, then the training output file folder, then a custom folder
- New drafts and drag-and-drop draft creation now remember the last saved output-root mode so repeated capture workflows keep the same preference
- Settings now labels the saved output location as `Default Model Output Root` to make its role in new draft creation clearer
- Windows release packaging now uses the committed `electron-builder.yml` profile in GitHub Actions so published installers carry the intended NAM-BOT app identity, icons, and shortcut settings

### Fixed

- New drafts now actually use the configured Settings output root as the default model output folder instead of always following the training output file folder
- Windows release packaging now skips native dependency rebuilds in the builder profile so the release workflow does not depend on a local Visual Studio toolchain

### Notes

- Early adopters updating from the first public Windows builds may need to uninstall the older NAM-BOT entry once if Windows shows a duplicate app entry during this installer identity transition

## [0.3.5] - 2026-03-16

### Added

- Job editor option to append the final validation ESR to the exported `.nam` filename after training finishes

### Changed

- Exported model filenames now follow a consistent suffix order: job name, preset name, then ESR
- Jobs screen groups the preset-name and ESR filename options into one `Final Model Filename` section below the output root directory controls
- Jobs documentation updated for the new filename options and ordering

## [0.3.4] - 2026-03-16

### Added

- Help menu `Check for Updates` action that forces a fresh GitHub release check and shows a native result dialog
- Job editor checkbox to append the selected preset name to the exported `.nam` filename, plus a remembered default for new jobs and drag-and-drop drafts

### Changed

- Help menu now groups `Check for Updates` with `About NAM-BOT` at the bottom where version-related actions are easier to find
- Jobs screen elapsed and remaining training time now reflect the full run instead of only the current epoch
- Desktop shell, About, and Jobs docs updated for the new update-check and job-output naming behaviors

## [0.3.3] - 2026-03-16

### Fixed

- Preset editor raw JSON import so `Import Into Editor` now applies validated JSON back into the manual editor instead of silently failing

## [0.3.2] - 2026-03-16

### Added

- New "Open Presets Folder" link in the application **File** menu (Shortcut: `Ctrl+Shift+P`)
- Exported user presets path from the persistence layer to allow deep-linking to the support folder

### Changed

- Presets system documentation updated to include guidance on the new application menu shortcut

## [0.3.1] - 2026-03-14

### Added

- Background GitHub release checking with a pulsing About-nav indicator and About-screen update links for latest release notes
- About screen documentation covering the new automatic update-check behavior

### Changed

- About screen version display now uses live app version info and keeps update messaging consolidated in the Project Info section
- README now emphasizes preset export/import sharing and creator metadata as a core NAM-BOT capability

## [0.3.0] - 2026-03-13

### Added

- First public-release repository snapshot prepared for standalone distribution on GitHub

### Changed

- Version line advanced to `0.3.0` to mark the first public NAM-BOT release milestone

## [0.2.6] - 2026-03-13

### Added

- Public repo docs: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`
- Diagnostics screen documentation and screenshot assets for the public README
- GitHub issue templates, a pull request template, and Windows CI / release workflows for public distribution

### Changed

- README rewritten for public open-source onboarding, setup guidance, release downloads, and embedded app screenshots
- Contributor and agent guidance expanded with GitHub Actions release-flow documentation
- Repo guidance and docs cleaned up for a safer public open-source starting point

### Fixed

- Jobs queueing flow so drafts disappear immediately on the Jobs screen after being queued
- Reward preset epoch default so the unlock now uses `666` epochs
- Windows app shell icon handling for development and packaged builds

## [0.2.5] - 2026-03-13

### Added

- About screen terminal easter egg with a hidden interactive flow
- Public-facing desktop shell polish with a real native app menu, About dialog, taskbar progress, notifications, and support-folder shortcuts
- Application icon assets for development and Windows packaging

### Changed

- About and Presets polish around the hidden terminal flow and a small unlockable bonus
- Windows app shell behavior so navigation and support actions are exposed through the Electron menu bar

### Fixed

- About page terminal prompt visibility, command-output behavior, and terminal interaction polish
- Preset ordering so user presets appear first and special-case entries are kept in a stable position
- Runtime icon lookup so Electron can use generated app assets in development and packaged builds

## [0.2.4] - 2026-03-12

### Added

- User Information settings for default author name and URL
- Dashboard overhaul with live job counts for Drafts, Queued, Training, Completed, and Errors
- Active Training dashboard section with live training cards and logs
- Jobs empty-state refresh with a browse action for audio imports

### Changed

- Settings now auto-save with debounced persistence instead of manual save/cancel actions
- Backend validation is now decoupled from silent settings persistence
- Accelerator diagnostics details are collapsed by default behind a Show Details toggle
- Draft and queue state moved into the global Zustand store for real-time sync across screens
- Jobs UI styling simplified and scaled for a cleaner multi-column dashboard fit
- Jobs audio picker and drag-and-drop restricted to `.wav` input for safer training compatibility

### Fixed

- Black-screen instability caused by state race conditions during Settings save flows
- Redundant unsaved-change warnings on the Settings screen
- Dashboard `ReferenceError` crashes tied to missing job count variables
- Shared TypeScript config issues affecting renderer utilities

## [0.2.2] - 2026-03-12

### Added

- Bursty dial-up typewriter effect for the About page
- Click-to-skip behavior for the About animation

### Changed

- Condensed Show Details layouts for Jobs and Presets
- Removed completed-job progress bars to reduce visual noise
- Refined About page styling and spacing for a more consistent terminal presentation

### Fixed

- About page CSS class naming clashes that caused incorrect styling on version labels and metadata

## [0.2.1] - 2026-03-12

### Added

- BBS-style About page with CRT styling and a pseudo-terminal easter egg
- Repository, personal site, studio, and support links inside the About experience
- Standard MIT license file
- About-page license and copyright notice

## [0.2.0] - 2026-03-12

### Added

- Presets screen with library, manual editor, JSON import mode, and preset import/export
- Reusable preset storage and preset-aware job defaults / locking behavior
- In-memory Jobs editor session persistence for unsaved edits
- Dedicated Jobs and Presets documentation under `docs/`

### Changed

- Top-of-panel save actions for Job and Preset editors
- Save buttons now reflect valid dirty state more clearly
- Jobs editor dirty-state tracking improved for save and cancel behavior

### Fixed

- Unsaved-change confirmation flows for dirty Preset and Job edits

## [0.1.3] - 2026-03-11

### Added

- Drag-and-drop reordering for the queued job list
- Optimistic UI updates while reordering queued jobs

### Changed

- Queue display order so the next job sits closest to the training area
- Tighter layout alignment and reduced required-field visual noise

### Fixed

- Empty draft creation when opening a new job and canceling immediately

## [0.1.2] - 2026-03-11

### Fixed

- CPU-only diagnostics guidance so CUDA installs are not recommended on unsupported machines
- Accelerator wording so CPU-only hosts are treated as valid CPU-training setups

## [0.1.1] - 2026-03-11

### Changed

- README rewritten around the in-app Setup Guide
- Source-build instructions expanded with plain-language explanations of each npm script

### Fixed

- Stale standalone setup docs that no longer matched the app’s current behavior

## [0.1.0] - 2026-03-11

### Added

- Accelerator diagnostics with torch, NAM, Lightning, host NVIDIA, and Python runtime probing
- Remediation cards for common backend and GPU environment failures
- Copyable troubleshooting exports, including AI-ready diagnostics text

### Changed

- Dashboard backend and accelerator status made more compact
- Saving backend settings now re-runs backend validation and accelerator diagnostics
- Diagnostics guidance rewritten with more direct success criteria and copyable commands
- Help renamed to Setup Guide
- Setup split into existing-environment and from-scratch paths, including machine-specific PyTorch guidance

### Fixed

- Windows accelerator probing by switching from unsupported multiline `python -c` calls to temporary scripts

## [0.0.5-alpha] - 2026-03-11

### Added

- Project-local release workflow skill under `.agents/skills/nam-release-workflow`
- Matching `AGENTS.md` hook for future release chores

### Changed

- PyTorch install guidance for NVIDIA users and clearer upstream wheel notes

## [0.0.4-alpha] - 2026-03-11

### Added

- Help page redesign with copyable setup commands
- Explicit Miniconda guidance and NVIDIA versus CPU install branching
- Global active-training indicator in the sidebar
- Conda-on-PATH detection

### Changed

- Terminal log polling decoupled from job update events
- Backend diagnostics no longer require an output directory
- Jobs split into Drafts, Queue, and Training
- Queueing now freezes drafts into runnable task snapshots
- Bulk queue actions and improved Show Details / logs behavior
- Output root selection expanded to include a settings-default mode
- Backend setup defaults updated around PATH-first Conda detection and startup validation
- Training cards simplified around structured progress and details

### Fixed

- Windows `conda run` handling by removing the unsupported `--` separator
- Job cancellation watchdog to escalate stuck stops
- Drag-and-drop queueing defaults for new jobs
- GPU detection regex improvements for Lightning logs

## [0.0.3-alpha] - 2026-03-09

### Added

- Drag-and-drop `.wav` job creation
- Absolute path capture via Electron `webUtils.getPathForFile`
- Automatic naming from audio filenames
- File picker browse buttons for path fields
- Bundled standard NAM `v3_0_0.wav` training signal
- Input and output path mode toggles
- NAM metadata fields in the Jobs editor

### Changed

- Audio fields now show filenames by default with full-path tooltips
- Numeric spinners and control alignment refined to match the project style
- Output-root sync behavior improved

### Fixed

- Robust command quoting for paths with spaces
- Numeric spinner visibility on Windows

## [0.0.2-alpha] - 2026-03-09

### Added

- Retro-arcade processing indicators and cursor effects
- Smarter backend-ready status button on Settings
- Enhanced page-header styling
- Locked viewport layout with independent scrolling regions
- Themed scrollbars and mobile responsiveness improvements

### Changed

- General typography, hover motion, progress bars, and layout polish
- Dashboard, Settings, and Diagnostics status synchronization

### Fixed

- Flexbox width jitter between sections
- TypeScript issues around IPC job drafts
- Stray `classNameName` typos in the dashboard

## [0.0.1-alpha] - 2026-03-09

### Added

- Electron 40.x + electron-vite + React 19 + TypeScript project scaffold
- Secure IPC with `contextBridge`
- Application logging with `electron-log`
- Windows packaging with `electron-builder`
- Settings persistence in app data
- Backend adapter with Conda / NAM validation
- Diagnostics screen with validation UI
- Queue manager with one-worker execution
- Built-in training presets
- Dashboard, Settings, Diagnostics, and Jobs screens

### Known Issues

- No automated test framework configured
- Presets manager UI was not yet implemented
- Logs viewer UI was not yet implemented
- Onboarding flow was not yet implemented
- No job persistence between sessions at the time of the initial alpha
- No macOS or Linux packaging support at the time of the initial alpha
