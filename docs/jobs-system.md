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
- a training/history section for active and finished runs

When the page is empty, it invites the user to either:

- click `New Job`
- drag output audio files onto the page to create drafts quickly

### Draft Jobs

Draft jobs are editable saved jobs that have not been frozen into the queue yet.

- `New Job` opens an in-memory editor session first.
- Saving a new job creates a backend draft through `jobs:createDraft`.
- Saving an existing draft updates it through `jobs:saveDraft`.
- Draft cards expose `Edit`, `Queue`, `Copy`, and `Delete`.
- `Queue All` enqueues every valid draft and skips drafts missing required fields.
- New jobs remember the last-used preset, the last-used output root mode, and the last-used exported-model naming preferences to speed up repeated comparison runs.

Drafts are where users can iterate safely before they commit a run to the queue.

### Drag And Drop Draft Creation

The Jobs page supports dragging output audio files directly onto the main panel.

- supported file extensions include `.wav`, `.mp3`, and `.flac`
- each dropped output file becomes its own draft
- the draft name defaults to the output filename without extension
- the output root defaults to the dropped file's directory
- the input audio defaults to the bundled NAM training signal when available
- the preset defaults to the last-used visible preset, then the default preset, then the first visible preset

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
- Clicking `Cancel` with unsaved edits opens a confirm dialog so the user can save, keep editing, or discard changes.

### Input Audio Modes

Input audio can be driven in two ways:

- `Default`
  - uses the bundled NAM `v3_0_0.wav` training signal
  - can optionally be exported to disk with `Save Default to Disk`
- `Custom`
  - lets the user browse to a specific input audio file

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

The queue UI shows the queued list in reverse visual order compared to the internal logical queue so the “next up” behavior feels natural in the interface.

### Training And History View

Active and finished jobs appear in the training section.

- active jobs surface stop and force-stop controls
- finished jobs can be retried
- result folders can be opened from the UI
- terminal logs can be expanded and refreshed while a job is active
- `Clear Finished` removes finished runtime entries from the queue history panel
- while a run is active, elapsed time is measured from the start of the training run and remaining time is estimated against the full planned epoch count rather than the current epoch only
- collapsed cards now show status-specific quick stats:
  - queued and validating cards show preset and planned epochs
  - preparing cards show preset, detected device summary, and planned epochs
  - running and stopping cards show progress/ESR plus elapsed and remaining or stop mode details
  - successful cards show preset, total runtime, and final ESR
  - failed and canceled cards prioritize total runtime and failure or stop reason, with ESR when available

## Job Schema

Jobs use the `JobSpec` schema.

```ts
interface JobSpec {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  presetId: string | null
  appendPresetToModelFileName: boolean
  appendEsrToModelFileName: boolean
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
    latencySamples?: number
  }
  uiNotes?: string
}
```

### Schema Notes

- `presetId` links the run to a training preset rather than embedding the full recipe.
- `inputAudioIsDefault` records whether the bundled default training signal is being used.
- `outputRootDirIsDefault` tracks whether the root is following an automatic mode versus a custom folder choice.
- `trainingOverrides` are intentionally narrow. Jobs override only the fields that need run-specific flexibility.
- `metadata` is for NAM artifact tagging, not for configuring the core training recipe.
- `appendPresetToModelFileName` controls whether the exported `.nam` file includes the selected preset name after the job name.
- `appendEsrToModelFileName` controls whether the exported `.nam` file includes the best validation ESR after training finishes.
- New jobs seed both filename options from the user's most recent checkbox choices in the job editor.

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

- NAM-BOT waits for a freshly created timestamped run folder before it publishes the mirrored `.log` file into that folder
- this keeps each queued job's log, ESR tracking, and final `.nam` artifact bound to the correct training run instead of reusing a folder from the previous job

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
  - writes to `data.common.delay` for `nam-full`
- `NAM Metadata`
  - is written back into the final `.nam` file after a successful run

If a selected preset locks epochs or latency through expert config, the job editor shows those fields as read-only.

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

### Unqueue And Retry

- `Unqueue` restores a queued item back into drafts.
- `Unqueue All` restores every waiting queue item back into drafts.
- `Retry` reuses the frozen job from a finished run and schedules it again.
- `Clear Finished` removes finished history items from the queue manager view.

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

- switching to another section does not discard the open editor session
- returning to Jobs restores the in-progress editor state
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
- the last-used preset helps seed faster new-job creation
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
  "presetId": "wavenet-standard",
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
    "latencySamples": 0
  }
}
```

## Current Defaults

Current built-in job defaults are aligned with the default WaveNet preset path.

- job name starts as `New Job`
- preset defaults to `wavenet-standard`
- input audio defaults to the bundled NAM v3 training signal
- epochs default to the preset epoch default
- latency defaults to `0`
- output root defaults to `Settings Default` when `Default Model Output Root` is configured
- otherwise output root defaults to the training output file folder
- once the user saves a different output-root mode, future new drafts reuse that preference

## Future Extensions

Likely future additions to the jobs system:

- richer batch creation flows
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
