# About Screen

The About screen doubles as NAM-BOT's in-app credits and lightweight update surface.

## Update Checks

- NAM-BOT performs a background update check each time the app loads.
- The app uses the project's GitHub Releases feed as the source of truth.
- Checks are throttled to at most once per hour across restarts by caching the last known result in the app data folder.
- Users can bypass that throttle manually through `Help > Check for Updates`, which forces a fresh lookup immediately.
- Pre-releases are ignored, so only stable published releases count as updates.
- For local UI preview during development, you can spoof an available update by starting the app with `NAM_BOT_SPOOF_UPDATE_VERSION` set to a higher version than the packaged app.

## User Experience

- When NAM-BOT is already current, the About screen stays quiet and no extra update controls are shown.
- A manual menu-bar check always shows a native result dialog, even when no update is available.
- When a newer release exists, the About item in the left navigation shows a pulsing gold indicator.
- The About screen shows an animated CRT-style `Update available` marker next to the current version.
- Two actions appear when an update exists:
  - `Download latest` opens the newest GitHub release page in the default browser.
  - `View changelog` opens that release's notes page in the default browser.

## Terminal Diagnostics

- The About terminal includes a few undocumented responses for curious operators who try commands outside the visible menu.
- Some hidden diagnostics use short CRT-style loading sequences and should preserve the same terminal aesthetic as the rest of the screen.
- Any tucked-away NAM-BOT recovery protocol should keep input forgiving, avoid accidental prompt skips, and return cleanly to the normal About terminal.
- If a hidden terminal path grants a reward preset, the final action should still use the existing preset-library flow and report clearly when that preset is already available in Jobs.

## Development And Packaging

- `npm run dev`: starts the Electron app in development mode with hot reload so you can verify the About screen and update badge live.
- `npm run build`: builds the main process, preload script, and renderer for a production-ready smoke test.
- `npm run preview`: launches the built app locally for a quick production-style check.
- `npm run package`: builds the app and then creates the Windows installer output used for releases.
