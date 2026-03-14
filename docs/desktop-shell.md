# Desktop Shell

NAM-BOT now uses a real Electron application shell instead of relying on the default Electron menu and a plain browser-style window.

## Menu Bar

- On Windows, the menu bar stays visible so app navigation and support actions are always easy to find.
- On macOS, the standard app menu stays visible and follows normal platform conventions.

The menu is organized around the screens that already exist inside the app:

- `File`: create a new Job or Preset, open the logs folder, open the workspace folder, and quit.
- `Navigate`: jump straight to Dashboard, Jobs, Presets, Diagnostics, Setup Guide, Settings, or Credits.
- `Edit`: standard native text-edit roles such as Undo, Redo, Cut, Copy, Paste, and Select All.
- `View`: zoom controls, fullscreen, and dev-only reload / devtools items while running in development.
- `Help`: setup links, diagnostics, project links, and a conventional About dialog.

## Native Behaviors

- Active training updates the taskbar progress indicator so Windows shows that NAM-BOT is busy.
- Finishing, failing, or canceling a job triggers a desktop notification. Clicking the notification brings the app forward and opens Jobs.
- If a training job is still active, closing the window prompts before quitting because the trainer will be force-stopped.
- `Help > About NAM-BOT` opens a conventional version dialog, while the in-app About route remains available as the Credits screen.
- The in-app About route also performs a background GitHub Releases check on app load and highlights the About nav item when a newer stable version is available.

## Support Folders

- Logs live under the app data folder in `logs/nam-bot.log`.
- Workspaces default to the configured workspace root from Settings. If no custom workspace root is set, NAM-BOT falls back to the app data `workspaces/` folder.

## Running And Packaging

- `npm run dev`: starts Electron in development mode with the renderer dev server and hot reload.
- `npm run build`: builds the main process, preload script, and renderer for production.
- `npm run preview`: launches the production build locally for a quick smoke test.
- `npm run package`: runs the production build and then creates the Windows installer package.
