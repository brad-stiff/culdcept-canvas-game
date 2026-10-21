# culdcept-canvas-game

Electron + Vite + TypeScript Free Battle clone of **Culdcept Saga** (personal / at-home use). Application code lives in the [`app`](./app) workspace.

**Phase 4 (current):** Culdcept **Revolt** cards playable under **Saga** Free Battle rules. Starter books stay Saga-only; deck builder can opt in to mix Revolt ids (still 34/8/8). Recycle-to-book, Synergy, and World-spell globals are mapped; remaining Revolt turn rules (Fatigue, gates, two dice) are later. Still **2–4** cepters.

## Prerequisites

- [Node.js](https://nodejs.org/) **20.19+** or **22.12+** (required by [electron-vite](https://electron-vite.org/guide/))
- npm **7+** (for workspaces)

## Setup

From the repository root:

```bash
npm install
```

This installs dependencies for the root workspace and [`app`](./app) (Electron, Vite, TypeScript, ESLint, Jest, etc.).

## Development

Start the Electron app with the Vite dev server (renderer HMR, main/preload hot reload via electron-vite):

```bash
npm run dev
```

Equivalent from [`app`](./app):

```bash
cd app && npm run dev
```

## Production build and run

Build bundles the main process, preload, and renderer into [`app/out`](./app/out) (see `main` in [`app/package.json`](./app/package.json)):

```bash
npm run build
```

Run the **built** app (electron-vite preview loads the production output):

```bash
npm run start
```

### Packaging (unsigned home builds)

```bash
npm run pack          # platform dir under app/dist-packaged
npm run dist:mac      # macOS dmg/zip
npm run dist:win      # Windows nsis/portable (best on a Windows machine)
```

### Card catalogs (Saga + Revolt)

Regenerate both JSON catalogs from the markdown sources under [`app/data/sources`](./app/data/sources):

```bash
npm run cards:parse
```

Download Saga + Revolt card art from Culdcept Central (personal / at-home use only; gitignored):

```bash
npm run cards:art
```

Files land in [`app/src/renderer/public/assets/cards`](./app/src/renderer/public/assets/cards) as `{cardId}.jpg` (Revolt ids are `revolt-{slug}.jpg`).

## Tests

```bash
npm run test
```

Jest is configured in [`app/jest.config.cjs`](./app/jest.config.cjs); tests live next to source (for example `*.test.ts` under [`app/src`](./app/src)).

## Linting and types

```bash
npm run lint
npm run typecheck
```

Format with Prettier (from [`app`](./app)):

```bash
cd app && npm run format
```

Or invoke directly: `npm run format -w app`.

## Project layout

| Path | Purpose |
|------|--------|
| [`app/`](./app) | Electron app: `src/main`, `src/preload`, `src/renderer`, `src/shared` |
| [`app/electron.vite.config.ts`](./app/electron.vite.config.ts) | electron-vite build configuration |
