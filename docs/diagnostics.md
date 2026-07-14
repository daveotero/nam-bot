# Diagnostics Screen

## Overview

The Diagnostics screen is NAM-BOT's main environment-health page.

It is designed to answer two practical questions before or during training:

- can NAM-BOT actually reach the configured NAM backend
- can that backend use the accelerator path you expect, especially CUDA on Windows or MPS on Apple Silicon
- does the environment avoid known compromised Lightning releases before NAM-BOT imports NAM or Lightning
- can NAM-BOT launch the same terminal process path used by real training jobs

The screen is intentionally split into compact readiness areas so users can tell the difference between "NAM is not set up correctly," "NAM works but GPU support is not healthy yet," and "basic checks pass but the actual training launch path is blocked."

## Goals

- Give users a fast pass/fail check for the currently selected backend target.
- Explain common Conda, Python, NAM, torch, and accelerator problems in plain language.
- Catch real process-launch failures before the user queues a training job.
- Provide copyable commands for the most likely fixes without forcing users to build commands by hand.
- Export enough context for deeper troubleshooting in support threads or LLM tools when the built-in guidance is not enough.

## User Experience

### Automatic Loading

The Diagnostics screen auto-loads its checks when the page opens.

- backend validation runs if there is no current validation snapshot
- accelerator diagnostics run if there is no current accelerator snapshot
- training launch diagnostics run if there is no current launch-readiness snapshot
- the `Re-check All` button refreshes backend, accelerator, training launch, and NAM version checks together
- a failed automatic request is retained as an error instead of being retried in a render loop
- failed checks show a visible error and wait for `Re-check All` before trying again
- results are tied to the settings revision that started them; changing Settings discards stale in-flight results

This keeps the page useful as a quick status check even when the user has not manually triggered anything yet.

### Summary Tiles And Action Center

The top of the screen shows four compact readiness tiles:

- Backend
- Accelerator
- Training Launch
- NAM Version

Each tile shows a short status, a one-line result, and the latest check time when applicable.

Below the tiles, Diagnostics shows one action center rather than a stack of separate troubleshooting panels.

- If everything is ready, the action center reports `Ready To Train`.
- If something needs attention, it chooses the highest-priority issue and shows what happened, what it likely means, how to fix it, and how to verify the fix.
- Lower-priority issues are summarized as compact `Also detected` badges so the user is not forced to juggle many open sections.

The priority order is:

1. backend reachability problems
2. Lightning security blocks
3. training launch failures
4. workspace/output path problems
5. NAM installation or trainer command problems
6. accelerator problems
7. version/update advisories

### Check Matrix

The detailed results are shown as a compact check matrix instead of large repeated cards.

The matrix groups rows by:

- Backend
- Training Launch
- Accelerator
- NAM Version

Rows use `PASS`, `CHECK`, `FAIL`, and `SKIP` labels. Failed rows can include one-line guidance directly in the row, while full troubleshooting exports and raw facts stay in `Advanced Details`.

The NAM Version group also doubles as the A2 local-training gate reminder. NAM-BOT currently requires `neural-amp-modeler>=0.13.0` for A2 presets, and version/update advisories include the environment-specific upgrade command.

### Backend Diagnostics Panel

The top panel focuses on basic backend reachability.

It shows an overall status banner:

- `BACKEND READY`
- `BACKEND NOT READY`

It then breaks the result into individual checks:

- Conda reachable
- environment reachable
- Python reachable
- NAM installed
- full NAM entry path available

Before NAM-BOT runs NAM commands, it performs a metadata-only Lightning package check with Python package metadata. This avoids importing `nam`, `lightning`, or `pytorch_lightning` until the selected environment has been checked for the known compromised Lightning `2.6.2` and `2.6.3` releases.

Each check shows:

- a pass or fail state
- a plain-language message
- a suggested next action when one is available

This panel is meant to answer "Can NAM-BOT actually run the configured training environment at all?"

### Training Launch Readiness

The Training Launch check answers a different question from backend validation:

"Can NAM-BOT launch the same terminal process path that real training uses?"

This matters because backend validation uses short `child_process` checks, while real training uses `node-pty` so the app can stream terminal output. A machine can pass backend validation and still fail to launch training with an OS-level error such as `posix_spawnp failed`.

Training launch diagnostics check:

- Conda is reachable from the app
- the selected backend mode is compatible with the current trainer launch path
- NAM-BOT can create and write a temporary training workspace
- a PTY can launch Python through `conda run --no-capture-output`
- a PTY can launch `nam-full --help` through the same path
- on macOS, the packaged `node-pty` helper exists and has executable permissions
- macOS app location warnings such as running from a DMG or app translocation
- fragile Conda settings such as relying on bare `conda` instead of a full executable path

The launch probe intentionally runs harmless commands. It does not start a training run or require a queued job.

If launch readiness fails, Diagnostics should explain whether the likely problem is:

- a bare or unreachable Conda executable
- unsupported Direct Python launch mode
- a blocked or unwritable workspace folder
- a PTY launch failure before NAM starts
- a `nam-full` launch failure through the training terminal path
- macOS app location or architecture issues

### Accelerator Diagnostics Panel

The second panel focuses on torch and hardware visibility.

The exact meaning depends on the machine:

- Windows + NVIDIA users will mostly care about CUDA visibility.
- Windows + AMD GPU (RX 7000, RX 9000, PRO W7000 series) users will see ROCm GPU visibility.
- Apple Silicon users will mostly care about MPS visibility.
- CPU-only systems may still be healthy if no supported accelerator is expected.

The summary banner collapses the result into one of a few user-facing states:

- `GPU READY`
- `CHECK LIGHTNING`
- `CPU-ONLY TORCH`
- `CUDA NOT VISIBLE`
- `NOT CHECKED`
- `PROBE FAILED`

This panel is meant to answer "If training runs, will it use the hardware path I expect?"

### AMD ROCm Accelerator Support

NAM-BOT detects AMD GPU acceleration through PyTorch's ROCm support on Windows. When an AMD GPU is properly configured:

- The accelerator panel displays `✓ ROCM GPU READY`
- The detail message shows "ROCm (AMD) GPU is visible"
- The HIP version is reported in the extended details

**How ROCm Detection Works**

AMD's ROCm PyTorch builds use HIP (Heterogeneous-Interface for Portability) to map GPU acceleration through PyTorch's existing CUDA API. This means:

- `torch.cuda.is_available()` returns `True` for ROCm builds
- `torch.cuda.device_count()` accurately reflects AMD GPUs
- NAM-BOT differentiates AMD from NVIDIA by checking `torch.version.hip`

When `torch.version.hip` has a value (and `torch.version.cuda` is `None`), NAM-BOT displays ROCm-specific messaging rather than CUDA messaging.

**Hardware and OS Support**

- **Windows**: AMD Radeon RX 7000, RX 9000, and PRO W7000 series GPUs via official ROCm wheels
- **Python Version**: Python 3.12 is strictly required for official Windows ROCm PyTorch wheels
- **macOS**: ROCm is not supported on macOS (Intel or Apple Silicon). Intel Mac users must use CPU-only training.

**Details Toggle Fields**

The expanded accelerator details include:

- ROCm HIP version (shows the ROCm SDK version when using AMD GPU)
- All existing CUDA, MPS, and host GPU fields

### Details Toggle

Accelerator details are collapsed by default behind `Show Details`.

When expanded, the panel shows the concrete probe facts that NAM-BOT collected, including:

- selected target environment
- Python version, executable, and platform
- host NVIDIA visibility and driver info
- torch import state, version, and CUDA build
- CUDA availability and device count
- MPS availability on supported macOS systems
- NAM import state and version
- Lightning package state and CUDA agreement

This is the "what did the app actually see?" layer of the screen.

## Guided Fixes

When the accelerator probe identifies a known problem shape, the Diagnostics screen shows a guidance card with ready-to-copy commands.

The current guided paths cover cases such as:

- torch missing
- torch import failing
- compromised Lightning `2.6.2` or `2.6.3` detected
- Lightning package metadata could not be verified safely
- NAM missing
- NAM import failing
- CPU-only torch on a machine that appears to have NVIDIA hardware
- CUDA not visible from the selected environment
- torch and Lightning disagreeing about CUDA
- probe execution failures
- PTY launch failures such as `posix_spawnp failed`
- missing or non-executable packaged `node-pty` helpers on macOS
- NAM-BOT running from fragile macOS app locations such as a DMG or app translocation path
- workspace folder creation/write failures
- Conda configured as a bare command when a full executable path would be more reliable

The commands are generated against the user's currently selected backend target, so the same screen works for:

- Conda environment name mode
- Conda prefix mode
- direct Python mode

When the target uses Conda, the guidance can also include an activation step before the repair commands.

## Troubleshooting Export

If backend validation, Training Launch readiness, or accelerator status is anything other than fully ready, the screen exposes a troubleshooting export section.

That section supports two exports:

- `Copy AI Troubleshooting Prompt`
- `Copy Raw Diagnostics JSON`

### AI Troubleshooting Prompt

The AI prompt is written for tools like ChatGPT or Claude.

It includes:

- host platform details from the running app
- the active NAM-BOT backend configuration
- backend validation results
- accelerator diagnostics results
- training launch readiness results
- already-prepared verification and repair commands for the exact target environment

The prompt explicitly asks the assistant for:

1. the most likely root cause
2. exact commands to run next
3. how to verify the fix succeeded
4. whether NAM training should use GPU after the fix

This is meant to save users from manually restating their machine details and failed checks from scratch.

### Raw Diagnostics JSON

The raw JSON export is a structured snapshot of the same diagnostic state.

It is useful for:

- issue reports
- support threads
- manual inspection
- pasting into other tools that prefer structured input

## Common Reading Guide

### If Backend Is Not Ready

Start with the backend panel first.

- fix Conda path or environment targeting problems before worrying about GPU state
- use the per-check suggestion text as the first next step
- once backend validation passes, run `Re-check All` and then revisit Training Launch and accelerator status

### If Backend Is Ready But GPU Is Not

Start with the accelerator panel.

- if the machine is intended to be CPU-only, `CPU-ONLY TORCH` may be completely acceptable
- if the machine should use NVIDIA CUDA, pay attention to torch build state, CUDA availability, and host NVIDIA visibility
- if the machine is Apple Silicon, pay attention to the reported `MPS available` field rather than NVIDIA host checks
- if torch sees CUDA but Lightning does not, inspect package mismatch rather than reinstalling NAM immediately
- if NAM-BOT reports a Lightning security block, repair the Python environment before running validation or training

### If Backend Is Ready But Training Launch Fails

Start with the Training Launch rows.

- if `PTY Python launch` fails, the environment may be valid but the operating system or app runtime cannot start the training terminal process
- on macOS, check the reported `node-pty helper` facts in Advanced Details or the raw diagnostics export to confirm the packaged helper exists and is executable
- if Conda is configured as `conda`, use the full Conda executable path from `which conda` on macOS/Linux or `where conda` on Windows
- on macOS, move NAM-BOT into `/Applications`, right-click it, choose Open, and re-run Diagnostics
- make sure the app build matches the CPU architecture, especially Apple Silicon `arm64`
- set the Default Workspace Root to a local writable folder while troubleshooting
- if Python launches but `nam-full` does not, repair or reinstall `neural-amp-modeler` in the same environment

### Lightning Security Block

NAM-BOT blocks validation, version detection, accelerator probing, `nam-hello-world`, and training launch if package metadata reports `lightning` or `pytorch-lightning` version `2.6.2` or `2.6.3`.

Recommended repair commands for the affected environment:

```bash
pip show lightning pytorch-lightning
pip uninstall -y lightning pytorch-lightning pytorch_lightning
pip install "pytorch-lightning<=2.6.1"
pip install --upgrade "neural-amp-modeler>=0.13.0"
```

If the affected Lightning package was already imported in that environment, treat the machine or environment as potentially compromised and rotate credentials that may have been present.

### If The Built-In Fixes Are Not Enough

Use the troubleshooting export.

- copy the AI prompt for a plain-language next-step walkthrough
- copy the JSON if you need a fuller structured snapshot
- include the probe notes if you are filing a bug or asking someone else to help debug the machine

## Process Boundaries

The Diagnostics feature spans both the renderer and Electron main process.

### Renderer Responsibilities

- display validation and accelerator summaries
- show pass/fail cards and extended probe facts
- surface ready-to-copy commands and exports
- manage local UI state such as details toggles and export visibility

### Main Process Responsibilities

- validate the configured backend target
- launch the accelerator probe against the selected environment
- collect host and runtime details
- return structured summaries that the renderer can display directly

## Relationship To Settings

Diagnostics depends on the current Settings target.

- changing backend mode changes which environment is probed
- changing the Conda executable path changes which Conda install NAM-BOT uses
- changing the environment name, prefix, or direct Python path changes the target for all validation and repair commands

In practice, Settings answers "what should NAM-BOT use?" and Diagnostics answers "does that target actually work?"

## Future Extensions

Likely future additions to the Diagnostics screen:

- clearer differentiation between expected CPU-only systems and unexpected GPU failures
- richer host-hardware summaries
- more targeted remediation paths for package-version conflicts
- optional export-to-file support for support bundles
- tighter cross-platform guidance for macOS and future Linux support
