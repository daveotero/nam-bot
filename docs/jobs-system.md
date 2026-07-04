# Jobs System

## Overview

NAM-BOT jobs are the runnable training units of the app. A job combines:

- a preset reference for the base NAM training recipe
- the paired input and output audio file paths used for the capture
- a small set of run-specific overrides such as epochs and latency
- optional NAM metadata that can be written back into the finished model

Jobs are intentionally separate from presets.

- presets define reusable training recipes
- jobs define one specific training run
- queue items freeze a job at enqueue time so later edits do not mutate an already queued run

## Goals

- Keep everyday job creation simple for users who just want to point at files and run training.
- Support batch-oriented workflows through drafts, queueing, drag-and-drop creation, and retry.
- Preserve enough run context to inspect output folders, logs, progress, and final artifacts.
- Keep editable drafts separate from frozen queue items so the queue stays predictable.

## User Experience

### Jobs Page

The Jobs screen is split into a few major states:

- an editor for creating or editing one job
- a drafts list for saved-but-not-yet-queued jobs
- a queue section for waiting jobs
- a training section for active runs
- a finished section for completed, failed, and stopped runs

When the page is empty, it invites the user to either:

- click `New Job`
- drag output audio files onto the page to create drafts quickly

### Draft Jobs

Draft jobs are editable saved jobs that have not been frozen into the queue yet.

- `New Job` opens an in-memory editor session first.
- Saving a new job creates a backend draft through `jobs:createDraft`.
- Saving an existing draft updates it through `jobs:saveDraft`.
- Draft cards expose `Edit`, `Queue`, `Copy`, and `Delete`.
- Draft, queue, training, and finished cards show the selected preset's architecture tag: `A2`, `A1`, or `CUSTOM`.
- Draft cards also expose `Create Batch`, which uses that draft as a template for multiple output audio files.
- Draft cards can be reordered by drag-and-drop. The lowest visible draft is the first draft used by `Queue All`.
- `Queue All` enqueues every valid draft from bottom to top and skips drafts missing required fields.
- While a draft is being queued, its Queue button changes to `Queueing...` and draft actions are disabled to prevent duplicate enqueue clicks.
- Draft delete confirmation includes a `Don't show this again` option that bypasses future draft-delete confirmations on that device.
- New jobs default to the A2 preset and remember the last-used output root mode, the last-used exported-model naming preferences, and a small set of low-risk reusable capture fields.

Drafts are where users can iterate safely before they commit a run to the queue.

### Create Batch From A Draft Template

`Create Batch` opens a batch editor after output audio files are selected, then creates one new editable draft per selected output audio file when saved.

- the selected draft is the explicit template source
- queued and finished runtime cards can also be used as the explicit template source through `Create Batch` / `Use as Template`
- shared template fields can be reviewed and edited once before the generated drafts are created
- job name and NAM model name are regenerated from each output filename without its extension
- if the batch editor's shared metadata model name is left blank, each generated model uses its output filename; if a shared metadata model name is typed, every generated draft uses that value
- the template draft, generated drafts, and their later training/finished cards show a `Batch: <template name>` badge for traceability
- generated drafts are still normal drafts and can be edited independently before queueing

Shared fields copied from the template include:

- selected preset
- input audio mode and path
- training overrides such as epochs and latency
- final model filename options
- NAM metadata such as modeled by, gear type, gear make, gear model, tone type, send level, and return level
- notes

File-specific fields regenerated for each selected output file include:

- job name
- NAM metadata model name
- output audio path
- output root directory when the template follows the training output file folder

The batch badge is display-only. It does not create a locked group, and editing one generated draft does not update the others.

### Drag And Drop Draft Creation

The Jobs page supports dragging output audio files directly onto the main panel.

- supported file extensions include `.wav`, `.mp3`, and `.flac`
- dropping or selecting one output file creates one draft directly
- dropping or selecting multiple output files opens the batch editor before any drafts are created
- the draft name defaults to the output filename without extension
- the NAM model name defaults to the output filename without extension
- the output root defaults to the dropped file's directory
- the input audio defaults to the bundled NAM training signal when available
- the preset defaults to the A2 default preset, then the first visible preset

This is intended to speed up common “I already have my re-amped captures on disk” workflows.

### Job Editor

The editor is used when:

- creating a new job
- editing an existing draft

The editor includes:

- job name
- input audio source
- output audio path
- output root directory mode
- final model filename options
- preset selection
- training overrides for epochs and latency
- NAM metadata fields for the final `.nam` artifact

The editor shows `Save Job` buttons at both the top and bottom of the form.

- Save buttons stay neutral when the editor is clean.
- Save buttons turn green only when the job has unsaved changes and the current editor state is valid to save.
- `Use Output Filename` beside Job Name and Model Name copies the selected output audio filename stem into that field.
- Clicking `Cancel` with unsaved edits opens a confirm dialog so the user can save, keep editing, or discard changes.
- Choosing another app section from the sidebar or app menu while the editor has unsaved edits opens a discard warning before navigation.

### Input Audio Modes

Input audio can be driven in two ways:

- `Default`
  - uses the bundled NAM `v3_0_0.wav` training signal
  - can optionally be exported to disk with `Save Default to Disk`
  - generates the strict official-style V3 split where training stops 9 seconds before the end and validation uses the final 9 seconds
- `Custom`
  - lets the user browse to a specific input audio file
  - treats the pair as user-managed training data rather than official V3-shaped data
  - generates a generic split where training stops 10 seconds before the end and validation uses the final 10 seconds
  - sets `data.common.require_input_pre_silence` to `null` so NAM does not reject continuous custom DIs that lack a silent boundary before validation

Custom input validation ESR is a local holdout metric for that specific pair and should not be treated as directly comparable to official V3 ESR unless the custom validation material is equivalent. Users can refine the generated split with a preset `Data JSON` expert override when a custom training signal has a known layout.

For an older V2-style custom input, a useful override is:

```json
{
  "train": {
    "stop_seconds": -20.0
  },
  "validation": {
    "start_seconds": -20.0,
    "stop_seconds": -11.0
  }
}
```

### Output Root Modes

The output root directory can be driven in three ways:

- `Settings Default`
  - uses the `Default Model Output Root` from Settings when configured
  - is the first-choice default for new drafts when no other output-root preference has been saved yet
- `Training Output File Folder`
  - follows the directory of the chosen output audio file
  - becomes the fallback default when no Settings output root is configured
- `Custom Folder`
  - lets the user browse to a specific directory
  - remembers the last custom folder path after the draft is saved

### Final Model Filename

The final exported `.nam` filename always starts with the job name.

- `Append preset name`
  - adds the selected preset name after the job name
- `Append final ESR`
  - adds the best validation ESR after the preset segment when enabled, or directly after the job name when preset naming is off
- `Also copy final model to output audio folder`
  - keeps the finalized `.nam` in the training folder, then writes an additional copy beside the selected output audio file

The suffix order is fixed so filenames read consistently:

- `Job Name`
- `Job Name - Preset Name`
- `Job Name - Preset Name - ESR 0.0123`

### Queue View

Queued jobs appear in their own section.

- queued items can be reordered by drag-and-drop
- only queued and validating items are reorderable
- `Unqueue All` restores waiting queue items back into drafts
- individual queued jobs can also be unqueued one at a time

The queue UI follows the same bottom-first execution model as drafts. The lowest visible queued job is the next item to move into Training, and drag-and-drop reordering preserves that logical order.

- A2 jobs are preflighted before enqueue. If the selected NAM environment is confirmed older than `neural-amp-modeler` `0.13.0`, enqueue is blocked with an upgrade command.
- If Diagnostics has not confirmed the selected NAM version yet, A2 jobs can be queued but pause as diagnostics-blocked queued items instead of failing. Run Diagnostics or `Re-check All` to confirm the environment; a valid NAM version resumes the queue automatically.
- Batch enqueue preflights all selected drafts before adding any of them to the queue so partial A2 batch enqueue does not occur.
- The A2 gate uses the NAM version already collected by Diagnostics so queueing drafts does not spawn new Python probes while another job is training.
- The renderer shows an immediate queueing state while this preflight runs so validation does not look like a missed click.

### Training View

Active jobs appear in the training section.

- active jobs surface stop and force-stop controls
- terminal logs can be expanded and refreshed while a job is active
- while a run is active, elapsed time is measured from the start of the training run; remaining-time estimates are intentionally not shown because they proved unreliable across NAM training runs
- expanded active-job details use a compact three-column layout: preset/training facts, ESR comparison, and artifact links

### Finished View

Completed, failed, and stopped jobs appear in the finished section.

- failed and stopped jobs can create a new editable draft so settings can be changed before queueing another pass
- successful jobs can also create a new editable draft for another pass
- successful result folders can be opened from the UI
- finished cards can be used as templates for new editable drafts by selecting one or more new output audio files
- terminal logs can be expanded after the run has finished
- `Clear Finished` removes all finished runtime entries from the finished section
- individual finished items can also be cleared from their card
- expanded finished-job details use the same compact layout as active jobs, with artifact links instead of full path rows
- across queue, training, and finished sections, collapsed runtime cards show status-specific quick stats:
  - queued and validating cards show preset and planned epochs
  - preparing cards show preset, detected device summary, and planned epochs
  - running and stopping cards show progress/ESR plus elapsed time or stop mode details
  - successful cards show preset, total runtime, and best ESR
  - failed and canceled cards prioritize total runtime and failure or stop reason, with ESR when available

For A2 Packed WaveNet jobs, NAM-BOT uses the highest-quality packed submodel as the primary ESR. With the default built-in A2 preset, that means A2 Full ESR is used for the headline runtime card, exported filename ESR suffix, and official `metadata.training.validation_esr` value. With the bundled A2 Heavy 12 preset, the `channels_12` Heavy submodel becomes the primary ESR because it is the highest-quality packed tier. Expanded details show all available packed submodel ESRs as a compact single-column comparison list from smallest to largest tier when NAM writes `packed_best.json`. NAM's aggregate packed ESR is not surfaced because it is a sum across submodels rather than the value most users compare against A1.

Expanded active and finished cards show compact text links for available artifacts, including the workspace folder, output folder, workspace terminal log, saved run log, and model file. Hovering a link shows the full path. Folder links open directly; file links reveal the file in its folder. Links are job-scoped through IPC so the renderer only asks NAM-BOT to open known artifacts for that runtime entry.

While the queue runner is processing training work, NAM-BOT starts Electron's system sleep blocker. Windows uses `prevent-display-sleep`, the strongest Electron blocker, to avoid system sleep during long batches and during handoff between queued jobs. Other platforms use `prevent-app-suspension`, which keeps the system active while still allowing the display to sleep. The blocker is released as soon as the queue runner is idle and no active training job remains, or when the app exits.

## Job Schema

Jobs use the `JobSpec` schema.

```ts
interface JobSpec {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  batchId?: string
  batchSourceName?: string
  presetId: string | null
  appendPresetToModelFileName: boolean
  appendEsrToModelFileName: boolean
  copyFinalModelToOutputAudioFolder: boolean
  inputAudioPath: string
  inputAudioIsDefault: boolean
  outputAudioPath: string
  outputRootDir: string
  outputRootDirIsDefault: boolean
  metadata: {
    name?: string
    modeledBy?: string
    gearType?: 'amp' | 'pedal' | 'pedal_amp' | 'amp_cab' | 'amp_pedal_cab' | 'preamp' | 'studio' | ''
    gearMake?: string
    gearModel?: string
    toneType?: 'clean' | 'overdrive' | 'crunch' | 'hi_gain' | 'fuzz' | ''
    inputLevelDbu?: number
    outputLevelDbu?: number
  }
  trainingOverrides: {
    epochs?: number
    latencyMode?: 'manual' | 'auto'
    latencySamples?: number
    packedSubmodels?: Array<{
      submodelIndex: number
      submodelName?: string | null
    }>
  }
  uiNotes?: string
}
```

### Schema Notes

- `presetId` links the run to a training preset rather than embedding the full recipe.
- `inputAudioIsDefault` records whether the bundled default training signal is being used.
- `outputRootDirIsDefault` tracks whether the root is following an automatic mode versus a custom folder choice.
- `trainingOverrides` are intentionally narrow. Jobs override only the fields that need run-specific flexibility.
- `trainingOverrides.packedSubmodels` is optional. When omitted, A2 Packed WaveNet jobs train every submodel declared by the selected preset. When present, NAM-BOT filters `model.net.config.submodels` by submodel index and name before writing `model.json`.
- `metadata` is for NAM artifact tagging, not for configuring the core training recipe.
- After a successful export, NAM-BOT also writes back metadata it can derive reliably. It updates `metadata.date`, writes the final validation ESR to `metadata.training.validation_esr`, and writes NAM-BOT-specific traceability under `metadata.nam_bot`.
- For packed A2 exports, `metadata.training.validation_esr` uses the highest-quality packed submodel ESR when packed submodel metrics are available. With the default built-in A2 preset this is A2 Full; with the bundled A2 Heavy 12 preset this is A2 Heavy. Per-submodel ESRs are written under `metadata.nam_bot.packed_submodels` because NAM's official training metadata schema currently exposes only one `validation_esr` field.
- `metadata.nam_bot` is intentionally outside the official NAM `metadata.training` object so custom fields do not interfere with plugin parsers that expect the NAM Trainer schema. Current NAM-BOT fields are `trained_epochs`, `preset_name`, `manual_latency_samples`, and `auto_latency_samples`.
- Older models that still contain NAM-BOT traceability under `metadata.training.nam_bot` are treated as legacy-compatible input if NAM-BOT rewrites metadata again; those values are migrated into `metadata.nam_bot` rather than preserved inside `metadata.training`.
- `appendPresetToModelFileName` controls whether the exported `.nam` file includes the selected preset name after the job name.
- `appendEsrToModelFileName` controls whether the exported `.nam` file includes the best validation ESR after training finishes.
- `copyFinalModelToOutputAudioFolder` keeps the normal training-folder model and publishes an additional finalized copy into the directory containing `outputAudioPath`.
- `batchId` and `batchSourceName` are optional display-only traceability fields for drafts and runtime cards created from the same batch/template flow.
- New jobs seed filename and final-copy options from the user's most recent checkbox choices in the job editor.

## Runtime State

Queued and finished runs use a separate runtime object, `JobRuntimeState`.

Important runtime fields include:

- `jobId`, `jobName`, and `status`
- `frozenJob` for the exact job snapshot that was queued
- timestamps such as `queuedAt`, `startedAt`, and `finishedAt`
- progress fields such as `plannedEpochs` and `currentEpoch`
- resolved paths such as workspace, run directory, generated configs, logs, and published model output
- terminal progress summaries, checkpoint summaries, device summaries, and user-facing messages

For queued runs that share the same output root:

- NAM-BOT binds each active run to the timestamped output folder whose folder name time matches that run's start window
- root-level fallback is only used when fresh training artifacts exist directly in the output root itself
- this keeps each queued job's log, ESR tracking, and final `.nam` artifact bound to the correct training run even when previous run folders are touched during finalization

### Job Status Values

Jobs move through these statuses:

- `draft`
- `queued`
- `validating`
- `preparing`
- `running`
- `stopping`
- `succeeded`
- `failed`
- `canceled`

Stop requests use two modes:

- `graceful`
- `force`

## What The Editor Fields Drive

The friendly job editor fields map to concrete training behavior.

- `Job Name`
  - labels the draft and queue item in the UI
- `Input Audio`
  - points to the dry training signal used by the run
- `Output Audio`
  - points to the re-amped capture that NAM is learning from
- `Output Root Directory`
  - controls where the run workspace and artifacts are written
- `Preset`
  - selects the base training recipe
- `Epochs`
  - overrides the preset default unless the preset locks that field
- `Latency / Delay`
  - supports `Manual` and `Auto-align`
  - `Manual` writes the entered value to `data.common.delay` for `nam-full`
  - manual `0` means no latency correction and no auto calculation
  - `Auto-align` runs NAM's standard-input latency analyzer before training, then writes the calculated value to `data.common.delay`
- `NAM Metadata`
  - is written back into the final `.nam` file after a successful run

If a selected preset locks epochs or latency through expert config, the job editor shows those fields as read-only.

### Latency Auto-Alignment

NAM-BOT's auto-align path intentionally reuses the latency analyzer from the official NAM GUI trainer rather than maintaining a separate DSP implementation.

- auto-align detects the standard NAM input version through NAM itself
- recognized NAM training DIs with built-in ticks, including v2 and v3, can be analyzed because NAM stores separate tick-location data for each version
- custom or unrecognized input files may fail auto-align and should use manual latency instead
- if NAM cannot calculate a recommended delay, the job fails before training starts so the user can switch to `Manual` and enter a known value
- expanded training cards show compact latency details beside the preset details: `Latency` (`Manual` or `Auto-align`) and the actual `Delay` used for the run
- terminal logs include NAM-BOT preflight annotations for manual delay, auto-align start, auto-align result, warnings, and the handoff into `nam-full`

This is a preflight step because `nam-full` expects a concrete `data.common.delay` value. NAM-BOT calculates that value first, then launches `nam-full` with ordinary config files.

When changing presets, the job editor adopts the next preset's epoch default only if the current epoch value still matches the previous preset default. Manually customized epoch values are preserved across preset changes.

For Packed WaveNet presets with three or more submodels, the job editor shows an advanced packed-submodel checklist next to the preset selector. Every tier is selected by default. Deselecting tiers stores a job-level `packedSubmodels` override, which lets experimental presets such as Heavy or Ultra packs train only a subset of their declared submodels without creating another preset.

## Queue Lifecycle

The normal job lifecycle is:

1. create or edit an in-memory job editor session
2. save it into the draft list
3. enqueue one or more drafts
4. freeze the draft into a queue item with a new task id
5. run validation, preparation, and training
6. inspect logs, output folders, and final artifacts
7. optionally retry, clear, or unqueue depending on state

### Freeze-On-Enqueue

When a draft is enqueued:

- the draft is cloned
- a new queue/task id is assigned
- the queue item stores that cloned `frozenJob`
- the original editable draft is removed from the drafts list

This prevents a user from accidentally changing the meaning of an already queued run.

### A2 Version Gate

NAM-BOT now defaults to local A2 training through the `a2-packed-wavenet` preset. A2 requires `neural-amp-modeler>=0.13.0` because earlier local `nam-full` installs do not include the required PackedWaveNet training path.

- enqueue checks the selected preset's architecture tag before freezing the job
- A2 jobs compare the Diagnostics-detected NAM version to `0.13.0`
- the same A2 gate runs again before training starts, using the known Diagnostics version rather than launching another version probe
- A1 and custom presets are not blocked by this A2-specific minimum version gate

### Unqueue And Finished Drafts

- `Unqueue` restores a queued item back into drafts.
- `Unqueue All` restores every waiting queue item back into drafts.
- `Create Draft` copies a finished run into Drafts so the user can tweak settings before queueing another pass. This is the primary recovery action for failed and stopped jobs.
- `Clear Finished` removes finished history items from the queue manager view.
- `Use as Template` on a finished history item opens the batch file picker and creates new editable drafts from that frozen run's settings without immediately queueing them.

## Persistence

### Draft Storage

Saved draft jobs are persisted in the Electron user data folder:

- Windows: `%APPDATA%\\NAM-BOT\\drafts.json`

This file stores the editable draft list, not the currently open unsaved editor session.

### Queue Storage

Queue runtime state is persisted separately:

- Windows: `%APPDATA%\\NAM-BOT\\queue.json`

This is handled by the queue manager and represents queued, active, and historical runtime items rather than editable drafts.

### Editor Session Persistence

The open job editor session is renderer-memory only.

- switching to another section with unsaved edits prompts before discarding the open editor session
- canceling that prompt keeps the user on the editor with the in-progress state intact
- the renderer session includes form values, selected preset, input mode, output-root mode, and validation visibility
- closing the app still discards an unsaved editor session that was never saved as a draft

## IPC And Process Boundaries

The Jobs feature spans the renderer and Electron main process.

### Renderer Responsibilities

- display drafts, queue items, logs, and editor state
- hold the unsaved editor session
- validate required fields for save and queue affordances
- react to queue-update and job-update events

### Main Process Responsibilities

- persist saved drafts
- open audio pickers and result folders
- manage queue operations such as enqueue, unqueue, retry, reorder, and clear
- resolve the bundled default training signal path
- launch and monitor actual training work through the queue manager

Important IPC handlers include:

- `jobs:createDraft`
- `jobs:saveDraft`
- `jobs:deleteDraft`
- `jobs:listDrafts`
- `jobs:reorderDrafts`
- `jobs:enqueue`
- `jobs:enqueueMany`
- `jobs:unqueue`
- `jobs:unqueueAll`
- `jobs:retry`
- `jobs:reorder`
- `jobs:listQueue`
- `jobs:openResultFolder`
- `jobs:chooseAudioFile`
- `jobs:getDefaultInputAudioPath`
- `jobs:saveDefaultAudioTo`

## Relationship To Presets

Jobs depend on presets but should stay smaller and more tactical than presets.

- presets define the base architecture and training recipe
- jobs point at one preset and override only a few run-specific fields
- the default A2 preset keeps new-job creation aligned with the current NAM training path
- preset locking rules can make job fields read-only when the preset explicitly owns them

This separation keeps:

- job creation fast
- preset reuse consistent
- queue behavior predictable

## Example Draft Job

```json
{
  "id": "8f32d3e2-5d2d-4f44-a7fd-d7ac1f1f4c55",
  "name": "JCM800 SM57 Edge",
  "createdAt": "2026-03-12T20:10:00.000Z",
  "updatedAt": "2026-03-12T20:14:00.000Z",
  "presetId": "a2-packed-wavenet",
  "tags": [],
  "inputAudioPath": "C:\\Users\\dave\\AppData\\Local\\Programs\\NAM-BOT\\resources\\v3_0_0.wav",
  "inputAudioIsDefault": true,
  "outputAudioPath": "D:\\Captures\\JCM800\\edge-of-breakup.wav",
  "outputRootDir": "D:\\Captures\\JCM800",
  "outputRootDirIsDefault": true,
  "metadata": {
    "name": "JCM800 Edge",
    "modeledBy": "Dave",
    "gearType": "amp",
    "gearMake": "Marshall",
    "gearModel": "JCM800",
    "toneType": "crunch",
    "inputLevelDbu": 4,
    "outputLevelDbu": -10
  },
  "trainingOverrides": {
    "epochs": 100,
    "latencyMode": "auto",
    "latencySamples": 0
  }
}
```

## Current Defaults

Current built-in job defaults are aligned with the default A2 Packed WaveNet preset path.

- job name starts as `New Job`
- preset defaults to `a2-packed-wavenet`
- input audio defaults to the bundled NAM v3 training signal
- epochs default to the preset epoch default
- latency mode defaults to `Auto-align` for the first new job
- after saving a job, future new drafts reuse the last saved `Manual` or `Auto-align` latency mode
- manual latency samples reuse the most recently saved manual value
- output root defaults to `Settings Default` when `Default Model Output Root` is configured
- otherwise output root defaults to the training output file folder
- once the user saves a different output-root mode, future new drafts reuse that preference
- custom input audio mode/path, latency mode, manual latency, modeled by, send level, and return level reuse the most recently saved job values
- broader NAM metadata is not silently copied from the previous job unless the user explicitly uses a draft as a batch template

## Future Extensions

Likely future additions to the jobs system:

- multi-select draft and history management
- more explicit draft tagging or grouping
- draft import/export
- stronger run templates for repeated capture workflows
- deeper queue filtering and history views
- richer validation around file pairing and sample-rate mismatches

The Jobs system should continue to favor a clear split between:

- unsaved renderer editor state
- persisted editable drafts
- frozen queue/runtime records

That separation is what keeps both the editing flow and the queue behavior understandable.
