# Settings System

The Settings page manages global configuration for NAM-BOT, including backend paths, default metadata, and general application behavior.

## Auto-save Behavior

Settings in NAM-BOT are automatically saved after a short pause, and the header also provides an explicit **Save Settings** button.

- A short debounce (approximately 500 ms) prevents constant disk writes while typing.
- Navigating away flushes the current settings draft instead of canceling the pending save.
- The header reports `Unsaved changes`, `Saving`, `Saved`, or a visible save error.
- **Validate Backend** first saves the exact settings shown on screen, then validates that saved snapshot.
- Changing backend settings invalidates earlier backend, accelerator, launch, and NAM-version results so a stale `Backend Ready` result is not displayed for the new target.

## Configuration Categories

### Backend Configuration

- **Conda Executable Path**: Path to the Conda executable NAM-BOT should use. On Windows this is often `conda.exe`; on macOS it is usually `conda`.
- **Backend Mode**: Choose between using a named Conda environment, a prefix path, or a direct Python executable.
- **Environment/Python Path**: Specific identifiers for your NAM environment.
- **A2 local training requirement**: The selected environment must have `neural-amp-modeler>=0.13.0` for A2 presets. Diagnostics and job enqueue checks use this same backend configuration to detect the installed NAM version.

### User Information

- **Default Author Name**: Auto-filled into the "Modeled By" field when creating new Jobs or "Created By" when creating new Presets.
- **Default Author URL**: Auto-filled into the "Website / Profile" field for new Presets.

### Output Configuration

- **Default Model Output Root**: The first-choice folder new drafts use for trained NAM model output, unless the job editor is set to follow the training output file folder or a custom folder.
- **Workspace Root**: Where temporary training files and logs are stored.

### Application Settings

- **Automatically open results folder**: Opens the completed run folder in your system file browser once training finishes.
  On Windows this usually means File Explorer. On macOS this means Finder.
- **Persist queue on exit**: Saves the current job queue to disk so it can be restored on next launch.
- **Log Retention**: How many days to keep training logs before cleanup.
