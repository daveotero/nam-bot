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

### 4. `node-pty` packaging guard
Training uses `node-pty` so NAM-BOT can stream terminal-style output from the NAM trainer. On macOS, `node-pty` relies on a bundled native `spawn-helper` executable.

The macOS builder now:

- unpacks `node_modules/node-pty/**/*` outside `app.asar`
- runs `build/after-pack.cjs` after packaging to find every bundled `spawn-helper`
- restores executable permissions with `chmod 755` when needed
- fails the macOS release or preview workflow if the helper is missing or still not executable

This protects packaged DMGs from `posix_spawnp failed` startup failures where backend validation passes but the PTY training terminal cannot start.

### 5. `src/main/types/index.ts` — Platform-aware Conda default
Original default was `'conda.exe'` (Windows-only path). Changed to:
```typescript
condaExecutablePath: process.platform === 'win32' ? 'conda.exe' : 'conda'
```
Without this fix, the app silently fails to find Conda on macOS.

### 6. `package.json` — Build scripts
Added:
```json
"package:mac": "npm run build && electron-builder --mac --config electron-builder.yml && node build/verify-macos-node-pty.cjs release",
"package:win": "npm run build && electron-builder --win --config electron-builder.yml"
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

Output: `release/NAM-BOT-{version}-macOS-arm64.dmg` (Apple Silicon) and `release/NAM-BOT-{version}-macOS-x64.dmg` (Intel)

## Release Policy

- `v*` tags publish the stable GitHub release for both Windows and macOS.
- The shared `release.yml` workflow builds the Windows installer, Windows portable ZIP, and both macOS DMGs from the tagged commit.
- `preview-release.yml` still publishes prerelease preview builds from `main`, but those entries do not replace the latest stable tagged release.

## Code Signing & Notarization

**CI-built DMGs are unsigned.** macOS may show a Gatekeeper warning on first launch.
To bypass: right-click the app → Open → Open anyway.

Signed + notarized releases can be produced manually by the maintainer using a Developer ID Application certificate. CI builds intentionally skip signing (`CSC_IDENTITY_AUTO_DISCOVERY=false`) so releases are reproducible by anyone without Apple credentials.
