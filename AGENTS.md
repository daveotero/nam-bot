# AGENTS.md - NAM-BOT Development Guide (v0.3.0)

This document provides guidance for AI agents working on the NAM-BOT project.

---

## 0. Working with Contributors

- Assume some contributors are new to Electron or desktop-app tooling; explain concepts in plain language, especially around the Electron build, development, and packaging workflow.
- Spell out the exact npm scripts or commands (and their purpose) when you reference them so future threads understand how to start the dev server and package the app from scratch.

### 0.1 Project-Local Agent Skills

- Project-local agent workflow files live under `.agents/`.
- Use `.agents/skills/nam-release-workflow/SKILL.md` when the user asks to update the changelog, choose a version bump, clean generated release trash, commit, or push.

### 0.2 Documentation Discipline

- When a significant change is made to a core feature, update the relevant documentation in `docs/` as part of the same work whenever practical.
- Core features include, at minimum, Jobs, Presets, Settings, Diagnostics, Dashboard, and Setup Guide.
- If no matching document exists yet, create one rather than leaving the feature undocumented.

---

## 1. Project Overview

NAM-BOT is a desktop training front-end for Neural Amp Modeler (NAM). Built with Electron + electron-vite + React + TypeScript, it provides a modern UI for managing NAM training jobs with queueing, presets, and diagnostics.

**Tech Stack:**

- Electron 40.x with electron-vite
- React 19 + TypeScript
- Zustand for state management
- electron-log for logging
- electron-builder for packaging

---

## 2. Build Commands

```bash
# Development - runs app in development mode with hot reload
npm run dev

# Production build - builds all three targets (main, preload, renderer)
npm run build

# Preview production build
npm run preview

# Package Windows installer (builds first, then packages)
npm run package
```

## 2.1 GitHub Actions Release Flow

- `.github/workflows/ci.yml` runs on pushes to `main` and on pull requests and should be treated as the baseline build-health check.
- `.github/workflows/release.yml` is for distributable Windows releases and should only publish when a Git tag matching `v*` is pushed, for example `v0.2.5`, or when manually triggered with `workflow_dispatch` and an explicit release tag input.
- When explaining release flow to contributors, spell out that ordinary pushes do **not** create GitHub Releases automatically.
- Preferred release trigger example:

```bash
git tag v0.3.0
git push origin v0.3.0
```

**Build Output:**

- `out/` - Compiled JavaScript
- `release/` - Packaged installers
  - `NAM-BOT-Setup-1.0.0.exe` - NSIS installer
  - `win-unpacked/NAM-BOT.exe` - Portable executable

---

## 3. Project Structure

```text
nam-bot/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts            # Entry point, window creation
│   │   ├── backend/            # NAM backend adapter
│   │   ├── config/             # Job config builder
│   │   ├── ipc/                # IPC handlers
│   │   ├── jobs/               # Queue manager
│   │   ├── persistence/        # Settings/data stores
│   │   └── types/              # TypeScript types
│   ├── preload/
│   │   └── index.ts            # Secure contextBridge API
│   └── renderer/               # React UI
│       ├── App.tsx             # Main app component
│       ├── features/           # Screen components
│       ├── state/              # Zustand stores
│       └── styles/             # CSS
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
└── package.json
```

---

## 4. Code Style Guidelines

### 4.1 TypeScript

- **Always use explicit types** for function parameters and return types
- **Use strict mode** - no `any` types
- **Use interfaces** for object shapes, types for unions
- **Avoid `as` casts** - use proper type guards instead

### 4.2 Imports

- **Order imports**: external → internal → relative
- **Use named imports** for React and libraries

```typescript
import { useState, useEffect } from 'react'
import { useAppStore } from './state/store'
import { JobSpec } from '../types/jobs'
import { validateBackend } from '../backend/adapter'
```

### 4.3 Naming Conventions

| Type               | Convention | Example             |
| ------------------ | ---------- | ------------------- |
| Files              | kebab-case | `queueManager.ts`   |
| Types/Interfaces   | PascalCase | `JobSpec`           |
| Functions          | camelCase  | `validateBackend()` |
| Variables          | camelCase  | `isRunning`         |
| Components         | PascalCase | `Settings.tsx`      |

### 4.4 React Components

- Use **functional components** with hooks
- Use **inline styles** for simple styling (matches design system)

```typescript
export default function Settings() {
  const { settings, loadSettings } = useAppStore()
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])
}
```

### 4.5 Error Handling

- **Always wrap async IPC calls** in try/catch
- **Log errors** using `electron-log/main`

```typescript
// Main process
try {
  const result = await validateBackend(settings)
  return result
} catch (error) {
  log.error('Backend validation failed:', error)
  throw error
}
```

### 4.6 Logging

- Use `electron-log/main` in main process
- Log levels: `log.info()`, `log.warn()`, `log.error()`

```typescript
import log from 'electron-log/main'
log.info('Settings loaded from:', settingsPath)
```

---

## 5. Key Patterns

### 5.1 IPC Communication

Renderer communicates with main process via contextBridge:

```typescript
// Preload
contextBridge.exposeInMainWorld('namBot', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
  }
})

// Renderer
const settings = await window.namBot.settings.get()
```

### 5.2 State Management

Use Zustand for global state:

```typescript
export const useAppStore = create<AppState>((set) => ({
  settings: null,
  loadSettings: async () => {
    const settings = await window.namBot.settings.get()
    set({ settings })
  },
}))
```

---

## 6. Adding New Features

### 6.1 New IPC Handler

1. Add handler in `src/main/ipc/<feature>.ts`
2. Register in `src/main/index.ts`
3. Add to preload API in `src/preload/index.ts`

### 6.2 New UI Screen

1. Create component in `src/renderer/features/<feature>/`
2. Add route in `src/renderer/App.tsx`
3. Add nav item in sidebar

---

## 7. Testing

No test framework currently. To add:

```bash
npm install -D vitest @testing-library/react jsdom
npx vitest
```

---

## 8. Troubleshooting

**Dev server won't start:** Check if ports 5173/5174 are available, delete `node_modules/.vite` cache

**Build fails:** Ensure all TypeScript errors are resolved, check `npm run build` output

**Installer fails:** Check electron-builder.yml configuration, ensure `out/` exists
