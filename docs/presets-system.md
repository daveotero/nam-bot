# Presets System

## Overview

NAM-BOT presets are the source of truth for training configuration. A preset defines:

- the user-facing library metadata for a training recipe
- the basic NAM training values exposed in the preset editor
- any expert JSON override blocks layered on top of the generated NAM config files
- optional sharing metadata for preset creators

Jobs do not own the full training recipe. Jobs only point at a preset and optionally override a small set of run-time values such as epochs and latency.

## Goals

- Keep presets understandable for musicians, producers, and tinkerers who do not want to edit raw NAM config files.
- Preserve access to advanced NAM configuration through expert JSON blocks.
- Make presets portable and shareable as standalone JSON files.
- Maintain backward compatibility as the preset format evolves.

## User Experience

### Library View

The presets page defaults to a library view rather than showing the editor at all times.

- User presets appear before built-in presets.
- Some special user-owned presets may be surfaced a little differently from normal library entries.
- Each preset is shown as a card with summary information.
- Clicking the card background toggles the same `Show More` / `Show Less` state as the explicit button.
- Built-in presets can be customized into user presets.
- User presets can be edited, duplicated, exported, and deleted.
- Any preset can be exported.

### Manual Editor

The manual editor is used when:

- creating a new preset
- editing an existing user preset
- duplicating a preset
- customizing a built-in preset

The manual editor exposes friendly fields for the most common NAM training choices:

- library metadata such as name, category, description, creator name, and creator link
- model family and architecture choice
- training defaults such as epochs, batch size, learning rate, learning-rate decay, `ny`, and MRSTFT loss

The editor shows a `Save Preset` button at both the top and bottom of the form.

- Save buttons stay neutral when the editor is clean.
- Save buttons turn green only when the preset has unsaved changes and the current editor state is valid to save.
- Clicking `Cancel` with unsaved preset edits opens a confirm dialog so the user can save, keep editing, or discard changes.

### Import JSON Mode

Import JSON is a separate mode within the preset editor.

- It accepts raw JSON pasted by the user.
- JSON is validated as the user types or pastes.
- Import stays disabled until the snippet is valid.
- Importing does not touch name, category, description, creator fields, or sharing metadata.
- Import only hydrates the technical training parts of the preset back into the manual editor.

This mode is intended for:

- full preset JSON copied manually
- raw `data`, `model`, and `learning` config objects
- WaveNet or LSTM model snippets

### Preset File Import / Export

Preset file sharing is separate from the raw JSON import mode.

- Each preset card has an `Export` button.
- The presets page header includes `Import Preset`.
- Export writes a standalone JSON file using the NAM-BOT preset schema.
- Import Preset accepts actual NAM-BOT preset files, not partial config snippets.

This split is intentional:

- `Import Preset` is for library-ready shared preset files.
- `Import JSON` inside the editor is for technical experimentation and raw config fragments.

## Preset Schema

Presets use the `TrainingPresetFile` schema.

```ts
interface TrainingPresetFile {
  schemaVersion: 1
  presetKind: 'training'
  id: string
  name: string
  description: string
  category: 'quality' | 'speed' | 'architecture' | 'custom'
  builtIn: boolean
  readOnly: boolean
  visible: boolean
  createdAt: string
  updatedAt: string
  lockedJobFields: Array<'epochs' | 'latencySamples'>
  values: {
    modelFamily: 'WaveNet' | 'LSTM'
    architectureSize: 'standard' | 'lite' | 'feather' | 'nano' | 'custom'
    epochs: number
    batchSize: number
    learningRate: number
    learningRateDecay: number
    ny: number
    fitMrstft: boolean
  }
  expert: {
    data?: Record<string, unknown>
    model?: Record<string, unknown>
    learning?: Record<string, unknown>
  }
  author?: {
    name?: string
    url?: string
  }
  origin?: {
    app?: string
    version?: string
  }
}
```

### Schema Notes

- `schemaVersion` is the compatibility anchor for exported and persisted preset files.
- `presetKind` distinguishes training presets from any future preset families.
- `author` is share-facing metadata for the person, company, or profile behind the preset.
- `origin` identifies the app and version that created or exported the preset file.

## Example Export

```json
{
  "schemaVersion": 1,
  "presetKind": "training",
  "id": "my-wavenet-preset",
  "name": "My WaveNet Preset",
  "description": "General-purpose amp capture preset.",
  "category": "custom",
  "builtIn": false,
  "readOnly": false,
  "visible": true,
  "createdAt": "2026-03-12T18:30:00.000Z",
  "updatedAt": "2026-03-12T18:42:00.000Z",
  "lockedJobFields": [],
  "values": {
    "modelFamily": "WaveNet",
    "architectureSize": "standard",
    "epochs": 100,
    "batchSize": 16,
    "learningRate": 0.004,
    "learningRateDecay": 0.007,
    "ny": 8192,
    "fitMrstft": true
  },
  "expert": {},
  "author": {
    "name": "Jane Doe",
    "url": "https://example.com"
  },
  "origin": {
    "app": "NAM-BOT",
    "version": "0.1.3"
  }
}
```

## Basic Fields and What They Drive

The manual editor fields map to the generated NAM config files.

- `Model Family`
  - selects the major network path: WaveNet or LSTM
- `Architecture`
  - selects one of the built-in architecture templates for the selected family
- `Default Epochs`
  - maps to trainer max epochs unless a job override replaces it
- `Batch Size`
  - maps to the training dataloader batch size
- `Learning Rate`
  - maps to optimizer learning rate
- `LR Decay`
  - maps to the learning-rate scheduler gamma value
- `NY`
  - maps to the training window length in `data.json`
- `Fit MRSTFT`
  - toggles the additional MRSTFT-related loss terms

## Expert Overrides

Expert overrides are optional JSON blocks merged on top of the generated base configs.

- `Data JSON` merges on top of generated `data.json`
- `Model JSON` merges on top of generated `model.json`
- `Learning JSON` merges on top of generated `learning.json`

For backward compatibility, NAM-BOT also accepts older custom-architecture preset exports where
`expert.model` is a raw WaveNet or LSTM config snippet instead of a full `model.json` override.
Those legacy shapes are normalized internally so existing shared presets from older NAM-BOT
versions continue to generate the intended `net.config`.

If an expert block overrides one of the friendly manual fields:

- that friendly field becomes read-only
- the editor shows a subdued `JSON Override` badge
- the override source and effective value are available on hover

This prevents silent conflicts between the manual controls and the expert JSON.

## Persistence

### Internal User Preset Storage

User presets are stored as one JSON file per preset in the Electron user data folder.

> [!TIP]
> You can quickly open this folder from the application's **File** menu by selecting **Open Presets Folder** (Shortcut: `Ctrl+Shift+P`).

- Windows: `%APPDATA%\\NAM-BOT\\presets`

Built-in presets are not stored there. They are defined in code and merged into the preset list after user presets.

### Special Preset Handling

The preset system supports a small amount of app-specific special-case behavior for select user-owned presets.

- special presets still use the normal user-preset save flow
- the library refreshes immediately after those presets are saved
- presentation may include light metadata cues in places where the UI cannot render richer custom badges

### Exported Preset Files

Exported preset files can be saved anywhere the user chooses.

- default suffix: `.nam-bot-preset.json`
- actual file contents: full `TrainingPresetFile` JSON

Exported files are intended to be easy to share in forums, GitHub repos, cloud drives, or direct messages.

## Import Rules

### Import Preset

The top-level `Import Preset` action:

- opens a file picker
- accepts a NAM-BOT preset JSON file
- normalizes the preset into the current schema
- saves it into the user preset library as a user-owned preset

If the imported file contains author metadata, it is preserved.

### Import JSON

The editor-level JSON import mode:

- does not write directly to the library
- validates and parses pasted JSON
- imports only the technical preset settings into the current editor session

This is intentionally different from importing a finished shared preset file.

## Compatibility Strategy

Backward compatibility is handled through schema normalization.

- All preset reads pass through `normalizeTrainingPreset()`.
- Missing fields are backfilled with defaults.
- Optional sharing metadata can be absent in older files without causing failures.
- Legacy custom-architecture presets from older NAM-BOT releases are upgraded from flat
  `expert.model` config snippets to the canonical `expert.model.net.config` shape during load.
- New fields should be added in a backward-compatible way whenever possible.

When the schema eventually changes:

1. bump `schemaVersion`
2. update normalization logic to migrate older shapes
3. keep exported files self-describing

## Relationship to Jobs

Jobs reference presets rather than duplicating the entire training configuration.

- presets define the base NAM training recipe
- jobs apply only limited run-specific overrides
- this keeps shared recipes reusable across many jobs

This separation is important for:

- a cleaner queue system
- consistent experimentation
- easier preset sharing between users

## Current Built-In Defaults

Current built-in defaults are aligned with the WaveNet-focused NAM presets:

- model family: `WaveNet`
- architecture: `standard`
- epochs: `100`
- batch size: `16`
- learning rate: `0.004`
- learning-rate decay: `0.007`
- `ny`: `8192`
- MRSTFT enabled: `true`

There is also a hidden LSTM compatibility preset used to preserve older drafts.

## Future Extensions

Likely future additions to the preset system:

- richer author/source metadata
- release notes or changelog metadata for shared presets
- additional model families or architectures
- richer preset discovery or filtering
- job editor parity for some preset-editing UX protections

The schema should continue to prefer optional nested objects over many flat top-level fields so it can evolve without becoming brittle.
