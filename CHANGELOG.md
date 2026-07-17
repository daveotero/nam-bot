# Changelog

All notable changes to NAM-BOT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.4] - 2026-07-17

### Changed

- Updated vulnerable npm dependencies and refreshed the lockfile so the full dependency audit is clean.
- Terminal logs now load incrementally with bounded renderer history, while high-volume training progress updates and queue persistence are coalesced to reduce UI lag.
- Removed unsupported Direct Python configuration and unused queue-retention, log-retention, and launch-mode settings; older settings files migrate to supported Conda defaults.
- Stable releases now require matching tag, package, and changelog versions, and preview packages receive unique Semantic Versions and artifact names.

### Fixed

- Force Stop now always moves a job to a terminal state, including a clear failure state when process-tree termination cannot be confirmed.
- NAM prerelease versions now compare correctly for A2 compatibility checks instead of being treated as the matching stable release.

## [0.6.3] - 2026-07-13

### Added

- Added atomic JSON persistence with recoverable backups, transactional draft-to-queue recovery, and regression coverage for persistence and preset path safety.

### Changed

- Failed and stopped training cards now prioritize `Create Draft` so users can edit settings before queueing another run.
- Settings now expose explicit dirty, saving, saved, and error states, flush pending changes during navigation, and validate the exact saved settings snapshot.
- CI, preview, and release builds now require TypeScript checks and the Vitest suite before platform packaging, with least-privilege workflow permissions.
- Electron now uses renderer sandboxing, exact production navigation checks, denied permission requests, and an HTTPS host allowlist for external links.

### Fixed

- Auto-align preflight feedback now appears in the same terminal log as training, and expanded job details show the latency mode and actual delay used for the run.
- Training jobs now claim only artifacts created or changed during their own run, and failed, canceled, or zero-exit runs without a new model can no longer publish an older or partial model as successful.
- Workspace setup failures now terminate cleanly, and Stop, Force Stop, and shutdown cancel latency analysis and other preparation subprocesses as well as active training.
- Each training run now uses one immutable backend-settings snapshot from validation through process launch.
- Queue and batch persistence failures no longer delete the only durable draft copy; batch draft creation is atomic, idempotent, and guarded against duplicate submissions.
- User preset IDs can no longer traverse outside the preset directory.
- Diagnostic failures no longer trigger unbounded automatic IPC retries, and stale results are discarded after settings changes.
- TypeScript project boundaries and previously hidden source errors are fixed so production and test code are checked consistently.

## [0.6.2] - 2026-07-02

### Added

- Jobs now support a `Manual` or `Auto-align` latency mode, defaulting new jobs to auto-align while remembering the user's last saved mode.
- Auto-align jobs now run NAM's standard input latency analyzer before training and pass the calculated delay into `nam-full`.

### Changed

- Manual latency `0` now explicitly means no correction and no auto-calculation, preserving manually aligned capture workflows.

### Fixed

- macOS packages now unpack and verify the bundled `node-pty` helper, restoring executable permissions before DMGs are produced so packaged PTY training launch is less likely to fail before Python starts.
- Training Launch diagnostics now report the packaged `node-pty` helper path, executable state, and file mode in Advanced Details and troubleshooting exports.

## [0.6.1] - 2026-07-02

### Added

- Bundled `A2 Packed WaveNet Heavy 12`, an experimental built-in A2 quality preset with the official 3-channel Lite and 8-channel Full tiers plus a 12-channel Heavy tier and a 400-epoch default.
- Bundled `A2 Packed WaveNet Ultra 20`, an experimental five-tier A2 preset with Lite, Full, Heavy, Ultra, and Mammoth submodels and a 666-epoch default.
- Jobs using Packed WaveNet presets with three or more submodels now expose an advanced per-run submodel checklist, defaulting to all tiers while allowing smaller experimental runs without creating another preset.
- Multi-file output audio drops and selections now open a batch training editor so shared settings can be reviewed once before drafts are created.
- Queued job cards now expose `Create Batch` so waiting jobs can be reused as batch templates.
- Draft jobs can now be reordered by drag-and-drop, matching the queued job ordering workflow.
- Finished and active job details now include compact artifact links for workspace folders, output folders, run logs, and model files.

### Changed

- Standard `A2 Packed WaveNet` jobs now default to `200` epochs.
- Packed A2 tier labeling is now range-based, extending beyond Mammoth with Colossal and Leviathan names for custom larger packs.
- Changing a job's preset now adopts the next preset's epoch default only when the current value still matches the previous preset default, preserving manually customized epoch counts.
- The job editor now places advanced packed-submodel selection beside the preset picker in a vertical checklist, and the final model copy option now sits with the output-root controls.
- Expanded job and preset cards now use compact column layouts for easier scanning of packed ESRs, artifact links, preset values, and packed tiers.
- Preset cards now use the same non-button click-to-expand behavior as runtime cards and organize actions into compact right-side rows.
- The sidebar Diagnostics item now shows a small rotating work indicator while diagnostics checks are running.
- Jobs can now also copy the finalized `.nam` model into the output audio file's folder while keeping logs, checkpoints, and the original finalized model in the training folder.
- Draft and queue lists now use a consistent bottom-first execution model: the lowest visible draft queues first, and the lowest visible queued job trains next.

### Fixed

- A2 jobs with an unconfirmed NAM version now stay queued with a diagnostics-required notice instead of moving straight to failed before training starts.
- NAM-BOT now keeps the power-save blocker active across queued training handoffs, and Windows training runs use Electron's stronger `prevent-display-sleep` blocker to avoid system sleep during long batches.
- Closing the app no longer hits a stale active-training helper reference.
- Navigating away from unsaved job or preset editor changes now prompts before discarding the in-memory edits.

## [0.6.0] - 2026-06-29

### Added

- A2 Packed WaveNet local training is now the default NAM-BOT preset, with the official packed A2 config and A1 presets still available for compatibility.
- Presets now expose A1/A2 architecture tags, A2 recipe fields, A2-first preset ordering, and JSON override indicators for advanced custom recipes.
- Jobs now show architecture tags across drafts, queue cards, runtime cards, and finished runs.
- Dashboard diagnostics now summarize Backend, Accelerator, Training Launch, and NAM Version readiness in four compact cards.
- Added focused test coverage for A2 config generation, A1 preservation, NAM version comparison, expert net replacement, new-job defaults, custom input data splitting, and packed A2 ESR metadata.

### Changed

- A2 training now requires `neural-amp-modeler>=0.13.0`, with setup, diagnostics, and documentation updated to point users at the newer NAM requirement.
- A2 queue validation now uses the NAM version already collected by Diagnostics instead of launching a fresh Python/NAM version probe each time a job is queued.
- A2 Packed WaveNet jobs now use the highest-quality packed submodel ESR as the primary ESR for runtime cards, filename suffixes, and official `metadata.training.validation_esr`; per-submodel ESRs are kept under NAM-BOT metadata.
- Custom input jobs now treat paired audio as user-managed training data, using a generic final-10-second validation holdout and bypassing NAM's pre-validation silence guard by default.
- Runtime cards no longer show remaining-time estimates because they were too unreliable for real NAM training runs.
- New jobs and drag/drop drafts now prefer the current A2 default preset instead of reusing an older remembered A1 preset.
- Expert `model.net` overrides now replace the generated network block instead of deep-merging into it, avoiding mixed A1/A2 model configs.
- Queue actions now provide immediate `Queueing...` feedback and disable duplicate draft actions while enqueue validation is running.
- Presets, Jobs, Dashboard, Diagnostics, Settings, and README documentation now describe the A2 workflow, custom input validation behavior, and updated diagnostics surface.

### Fixed

- A1 WaveNet presets and imported legacy WaveNet JSON snippets now emit NAM `0.13`'s required layer-array `head` object schema, fixing immediate A1 startup crashes under newer NAM installs.
- Batch enqueue now preflights all selected drafts before adding any of them to the queue, preventing partial batches when an A2 version requirement fails.
- Queueing multiple A2 drafts no longer adds repeated NAM version probes while another training job is running, reducing avoidable process and memory pressure.
- Update checks now compare release candidates correctly, so `0.6.0` is not flagged as older than `0.6.0-rc.2` while RC installs still see the final stable release as newer.
- The NAM version update action no longer offers an irrelevant Settings shortcut when the fix is a Python environment package upgrade.

## [0.5.1] - 2026-05-11

### Added

- Diagnostics now include Training Launch readiness checks that verify workspace writability and the same PTY-based `nam-full` launch path used by real training jobs
- Focused Vitest coverage for generated job config validation and user-facing elapsed runtime labels

### Changed

- Diagnostics screen now uses compact readiness tiles, a prioritized action center, and a dense check matrix so setup guidance is easier to scan
- Lightning package metadata checks are de-duplicated across simultaneous diagnostics runs to reduce repeated Conda probes
- NAM-BOT now writes its own export traceability under `metadata.nam_bot` so custom fields stay out of the official NAM `training` object
- Jobs documentation now explains the metadata split between official NAM fields and NAM-BOT-specific fields

### Fixed

- Diagnostics no longer starts overlapping launch probes while earlier checks are still running, reducing status churn and repeated terminal commands
- Exported `.nam` files now preserve zero manual latency values and rewrite finalized metadata as compact JSON for better plugin compatibility
- Legacy `metadata.training.nam_bot` values are still migrated forward when NAM-BOT rewrites an existing export

## [0.5.0] - 2026-04-30

### Added

- Batch draft creation from a template draft, producing one editable draft per selected output file while preserving shared metadata and training settings
- Batch traceability labels across draft, training, and finished job cards so related jobs stay visually grouped after creation and completion
- Finished-job templating that creates editable draft jobs from selected new output files, plus a `Create Draft` action for successful runs that need another pass
- Remembered low-risk job defaults for custom input audio, latency samples, modeled-by metadata, send level, and return level
- Optional `Don't show this again` preference for draft-delete confirmations
- Focused Vitest coverage for template draft creation helpers

### Changed

- Jobs screen now separates active `Training` jobs from `Finished` runs for cleaner queue review
- Finished run actions now distinguish successful reruns from failed retries: successful jobs create drafts, while failed or stopped jobs can be retried directly
- Runtime card actions are grouped into compact primary and secondary rows instead of one wide button rail
- Job editor now includes `Use Output Filename` shortcuts for Job Name and Model Name
- Jobs documentation now covers batch/template workflows, finished run actions, batch traceability fields, and delete confirmation preferences
- GitHub Releases now publish the matching `CHANGELOG.md` version section as the release notes instead of relying on empty auto-generated notes

### Fixed

- Finished-card batch labels no longer stretch across the action area or render in inconsistent positions

## [0.4.7] - 2026-04-30

### Changed

- Setup guidance now recommends `neural-amp-modeler>=0.12.3` so fresh NAM environments inherit NAM's safe Lightning dependency constraint
- Diagnostics and setup docs now explain the PyTorch Lightning 2.6.2/2.6.3 security block and include repair commands for affected Python environments

### Fixed

- NAM-BOT now checks Lightning package metadata before importing NAM or Lightning and blocks validation, version checks, diagnostics, and training launch when compromised Lightning 2.6.2 or 2.6.3 is detected

## [0.4.6] - 2026-04-25

### Changed

- The old terminal has started answering a little differently when addressed in the right forgotten dialect
- Training telemetry now reports a stranger number, waits for the operator to read the room, and leaves a faint trail of relic static behind NAM-BOT
- Some signals that used to arrive on a metronome now drift, hesitate, and dare the patient to keep listening

## [0.4.5] - 2026-04-07

### Changed

- macOS is now a stable release platform; GitHub Actions release workflow now builds and publishes Windows installer, portable ZIP, and macOS DMG assets together for each `v*` tag
- Removed the separate macOS release workflow; all stable release assets are now built and published automatically by the main release workflow

## [0.4.5-rc.2] - 2026-04-06

### Changed

- Exported `.nam` files now also stamp a NAM-style `metadata.date` block at final write time for easier model sorting and provenance

### Fixed

- Exported `.nam` files now include additional NAM-BOT training metadata for the completed run, including `metadata.training.nam_bot.trained_epochs` and `metadata.training.nam_bot.preset_name`

## [0.4.5-rc.1] - 2026-04-06

### Added

- Pushes to `main` now publish GitHub prerelease preview builds for Windows and macOS so testers can download fresh binaries from the Releases page without replacing the latest stable tagged release
- Preview prerelease automation now keeps only the newest ten `main` push builds so the Releases page stays useful instead of filling indefinitely with old test builds

### Changed

- Jobs docs now note that exported `.nam` files keep confirmed training metadata NAM-BOT can derive after a successful run

### Fixed

- Exported `.nam` files now write confirmed training metadata back into the final model, including final validation ESR and non-zero manual latency values when available

## [0.4.4] - 2026-03-28

### Added

- Robust run-directory resolution for queued jobs, including fallback artifact-signature detection when timestamp ordering alone is ambiguous
- Focused Vitest coverage for delayed and out-of-order output-folder creation during queue handoff

### Changed

- Jobs screen collapsed runtime cards now use a status-specific summary layout so each state surfaces the most useful details at a glance (preset and epochs for queued/validating, live timing and progress for active runs, runtime plus outcome context for finished runs)
- Completed collapsed cards now show `Preset`, `Total Runtime`, and `Final ESR` without requiring expansion
- Failed and canceled collapsed cards now prioritize total runtime and stop/failure context, and show ESR only when checkpoint data exists
- Queue cards now include planned epochs in the default collapsed row for both queued and validating items
- Jobs system documentation now includes the new collapsed-card quick-stat behavior matrix
- Jobs documentation now explains the full run-folder detection timeline between one task completing and the next task starting

### Fixed

- Queue handoff no longer attaches the next task's `.log`, ESR metadata, or final `.nam` naming data to the previous run folder when NAM output directories appear late

## [0.4.3] - 2026-03-28

### Added

- Focused Vitest regression coverage for preset normalization and generated `model.json` output so legacy custom architectures stay pinned to their intended network config

### Changed

- Preset docs now explicitly describe automatic compatibility handling for older NAM-BOT custom-architecture exports

### Fixed

- Queued jobs now wait for their own fresh timestamped output folder before mirroring the training `.log`, preventing ESR tracking and final `.nam` metadata work from binding to the previous run's folder
- Legacy NAM-BOT custom presets from older releases now normalize raw `expert.model` architecture snippets into the canonical `net.config` shape so existing presets generate the correct custom `.nam` architecture instead of the standard WaveNet default

## [0.4.2] - 2026-03-23

### Added

- NAM version check in Diagnostics screen showing installed vs latest GitHub release version
- Automatic detection of installed NAM version from configured Python environment
- GitHub releases integration fetching latest version from official NAM repository
- Status badges for up-to-date, update available, and unable-to-check states
- Copyable pip upgrade command when update is available
- Version caching (24 hours) to avoid GitHub API rate limiting
- Graceful handling of offline and rate-limited scenarios

### Changed

- Diagnostics screen now includes dedicated NAM Version Check panel between backend and accelerator diagnostics
- Version check auto-loads with other diagnostics on screen open

### Fixed

- GitHub API endpoint corrected to use official `sdatkinson/neural-amp-modeler` repository instead of incorrect `nam-ml/model`
- Version cache file location moved to app data directory to avoid permission errors

## [0.4.1] - 2026-03-20

### Added

- AMD ROCm GPU support for Windows with automatic detection via HIP version
- AMD Radeon RX 7000/9000 and PRO W7000 series GPU support in diagnostics and dashboard
- New "AMD ROCm (Windows)" setup path in Help screen with Python 3.12 installation steps
- ROCm-specific diagnostic guidance with verification commands and HIP version reporting
- Dashboard display showing "AMD GPU: [device name]" for ROCm builds

### Changed

- Setup guide grid updated to 4-column layout for better visual balance across all GPU paths
- Diagnostics panel now correctly shows "✓ GPU READY" for all valid GPU configurations (NVIDIA, AMD, Apple Silicon)
- Help screen updated to mention AMD ROCm support in accelerator diagnostics

### Fixed

- Accelerator diagnostics label displaying "PROBE FAILED" for working CUDA and MPS GPUs
- GPU success state routing in Diagnostics panel to properly check issue types instead of status values

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
