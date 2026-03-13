# Contributing To NAM-BOT

Thanks for taking an interest in NAM-BOT.

This project is still early, so the most helpful contributions are usually a few larger improvements rather than lots of tiny churn.

The biggest one by far is macOS support. NAM-BOT was built with that in mind where practical, but it has mostly been developed and tested on Windows because I am not a Mac user and do not have a Mac machine available for building and validation. If you are comfortable with Electron packaging, platform-specific path/process behavior, or testing on Apple hardware, that would be an especially valuable contribution.

## Before You Start

- Read [README.md](./README.md) for the project overview and setup flow.
- Read [AGENTS.md](./AGENTS.md) if you are contributing with an AI coding assistant inside this repo.
- Check existing issues and pull requests before starting duplicate work.

## Development Setup

```bash
npm install
```

Purpose: installs project dependencies and rebuilds native Electron modules such as `node-pty`.

```bash
npm run dev
```

Purpose: starts the Electron app in development mode with hot reload.

```bash
npm run build
```

Purpose: builds the Electron main process, preload script, and renderer for production.

```bash
npm run package
```

Purpose: builds the app and creates the Windows installer output in `release/`.

## GitHub Actions And Releases

This repo includes two GitHub Actions workflows:

- `CI`: runs on pushes to `main` and on pull requests, installs dependencies with `npm ci`, and runs `npm run build`
- `Release`: packages the Windows app and publishes release assets when a Git tag matching `v*` is pushed

The release workflow does not run on every commit push.

To trigger a real release build, push a version tag such as:

```bash
git tag v0.3.0
git push origin v0.3.0
```

You can also run the release workflow manually from the GitHub Actions tab by using `workflow_dispatch` and entering a release tag such as `v0.3.0`.

## Project Context

NAM-BOT is built with:

- Electron + electron-vite
- React + TypeScript
- Zustand for renderer state
- electron-log for logging
- electron-builder for packaging

There is currently no formal automated test suite in the repo, so contributors should at minimum run `npm run build` before opening a pull request.

If you are working on cross-platform or packaging changes, please call out exactly what machine and OS version you tested on.

## Pull Request Guidelines

- Keep pull requests focused. Small, single-purpose PRs are much easier to review.
- Update documentation when changing a core workflow or screen.
- Prefer plain-language UI copy. Many NAM-BOT users are not deep Python or Electron developers.
- Do not mix unrelated refactors into a fix PR unless they are required to make the change safe.
- If your change affects packaging, startup flow, diagnostics, Jobs, Presets, Settings, Dashboard, or setup guidance, mention that clearly in the PR description.

## Code Style Notes

- Use TypeScript with explicit parameter and return types.
- Avoid `any`.
- Follow the existing Electron split between `main`, `preload`, and `renderer`.
- Wrap async IPC work in `try` / `catch`.
- Use `electron-log/main` for main-process logging.
- Preserve existing UI patterns unless there is a good reason to change them.

## Reporting Bugs

When filing an issue, include:

- What you expected to happen
- What actually happened
- Whether you are using Conda, a direct Python executable, or another environment layout
- Whether the machine is CPU-only or GPU-enabled
- Any useful output from the Diagnostics screen or `nam-bot.log`

## High-Value Contributions

- Porting the app to macOS and validating the Electron packaging flow on real Mac hardware
- Fixing platform-specific path, shell, or process-launch issues that block cross-platform support
- Improving diagnostics for tricky GPU, torch, Conda, or environment mismatch problems
- Tightening the onboarding flow for users who do not already have a working local NAM setup
- Adding polished screenshots, GIFs, and documentation that help the public repo feel approachable

## Questions

If you are unsure whether a change fits the project, open an issue first and describe the idea before spending a lot of time on implementation.
