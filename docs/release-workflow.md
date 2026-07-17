# Release Workflow

NAM-BOT has separate workflows for stable/tagged releases and rolling preview builds. Ordinary branch pushes run CI but do not create a stable GitHub Release.

## Local Release Checks

Run these commands from the repository root before publishing:

```bash
# Type-check main, preload, renderer, shared code, and tests; run every test; then build all Electron targets.
npm run check

# Confirm the dependency tree has no known npm advisories.
npm audit
```

`npm test` runs the Vitest application suite and the Node release-metadata tests. `npm run build` builds the Electron main, preload, and renderer targets without packaging an installer.

## Stable And Prerelease Tags

`.github/workflows/release.yml` runs for a pushed `v*` tag or a manually selected existing tag. Before packaging, it requires all three of these values to agree:

- the Git tag, such as `v0.6.3`
- the `package.json` version, such as `0.6.3`
- a matching `CHANGELOG.md` heading, such as `## [0.6.3] - 2026-07-13`

The workflow stops before packaging if they differ. It also verifies that the tag already exists instead of allowing GitHub CLI to create one implicitly.

A Semantic Version with a prerelease suffix, such as `0.6.4-rc.1`, produces a GitHub prerelease and is not marked as the latest stable release. A version without a suffix produces the latest stable release.

After the release commit has been pushed and smoke-tested, publish the confirmed tag explicitly:

```bash
# Create the release tag locally after replacing the example with the prepared version.
git tag v0.6.4

# Push only that tag, which starts the public release workflow.
git push origin v0.6.4
```

Do not push a release tag until the user has explicitly confirmed it.

## Preview Builds

`.github/workflows/preview-release.yml` runs on pushes to `main`. It stamps each packaged app with a unique version such as:

```text
0.6.3-preview.184.ga1b2c3d
```

The run number and short commit hash keep preview artifacts distinct, including workflow reruns for the same commit. Preview releases are always GitHub prereleases and never replace the latest stable release.

## Packaging Commands

For local packaging:

```bash
# Build all Electron targets, then package the Windows installer.
npm run package

# Build and package Windows using the repository's Windows packaging script.
npm run package:win

# Build and package macOS, then verify the bundled node-pty helper.
npm run package:mac
```
