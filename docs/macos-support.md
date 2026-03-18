# macOS Support

macOS support added by **Alex Nasla** ([@alexnasla](https://linktr.ee/alexnasla)) — [spectredigital.com](https://spectredigital.com)

## What Was Changed

### 1. `build/icon.icns`
Generated from `build/icon.png` using macOS built-in tools (`sips` + `iconutil`).
electron-builder requires a proper `.icns` file for macOS builds — the original repo only included `.ico` (Windows) and `.png`.

```bash
mkdir -p /tmp/icon.iconset
sips -z 16 16     build/icon.png --out /tmp/icon.iconset/icon_16x16.png
sips -z 32 32     build/icon.png --out /tmp/icon.iconset/icon_16x16@2x.png
sips -z 32 32     build/icon.png --out /tmp/icon.iconset/icon_32x32.png
sips -z 64 64     build/icon.png --out /tmp/icon.iconset/icon_32x32@2x.png
sips -z 128 128   build/icon.png --out /tmp/icon.iconset/icon_128x128.png
sips -z 256 256   build/icon.png --out /tmp/icon.iconset/icon_128x128@2x.png
sips -z 256 256   build/icon.png --out /tmp/icon.iconset/icon_256x256.png
sips -z 512 512   build/icon.png --out /tmp/icon.iconset/icon_256x256@2x.png
sips -z 512 512   build/icon.png --out /tmp/icon.iconset/icon_512x512.png
sips -z 1024 1024 build/icon.png --out /tmp/icon.iconset/icon_512x512@2x.png
iconutil -c icns /tmp/icon.iconset -o build/icon.icns
```

### 2. `electron-builder.yml` — Mac targets
- Added `arm64` target alongside `x64` (Apple Silicon support)
- Added `category: public.app-category.music`
- Added `entitlementsInherit` pointing to the new plist

**Note on Universal Binary:** A universal (single fat binary) build was attempted but blocked by `node-pty`'s prebuilt native binaries — `@electron/universal` can't merge separate arm64/x64 `.node` files without a custom `afterPack` hook. Shipping two separate DMGs is the standard workaround for apps with native modules.

### 3. `build/entitlements.mac.plist`
Required for all Electron apps on macOS with hardened runtime. Grants:
- JIT compilation (required by V8/JavaScript engine)
- Unsigned executable memory (required by V8)
- Library validation disabled (required for `node-pty` native addon)

### 4. `src/main/types/index.ts` — Platform-aware Conda default
Original default was `'conda.exe'` (Windows-only path). Changed to:
```typescript
condaExecutablePath: process.platform === 'win32' ? 'conda.exe' : 'conda'
```
Without this fix, the app silently fails to find Conda on macOS.

### 5. `package.json` — Build scripts
Added:
```json
"package:mac": "electron-vite build && electron-builder --mac --config electron-builder.yml",
"package:win": "electron-vite build && electron-builder --win --config electron-builder.yml"
```

## Building for macOS

Requirements:
- macOS (must build on Mac for macOS targets)
- Node.js + npm
- Xcode Command Line Tools (`xcode-select --install`)

```bash
npm install
npm run package:mac
```

Output: `release/NAM-BOT-{version}-arm64.dmg` (Apple Silicon) and `release/NAM-BOT-{version}.dmg` (Intel)

## Release Policy

- `v*` tags continue to publish the standard Windows release automatically.
- macOS beta DMGs are built separately by a maintainer using the `Release macOS Beta` workflow.
- The macOS workflow checks out an existing release tag and attaches DMGs to that same GitHub Release later, so macOS assets can lag behind Windows until they are verified.

## Code Signing & Notarization

**CI-built DMGs are unsigned (beta).** macOS will show a Gatekeeper warning on first launch.
To bypass: right-click the app → Open → Open anyway.

Signed + notarized releases can be produced manually by the maintainer using a Developer ID Application certificate. CI builds intentionally skip signing (`CSC_IDENTITY_AUTO_DISCOVERY=false`) so releases are reproducible by anyone without Apple credentials.
