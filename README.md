# culdcept-canvas-game

Electron + Vite + TypeScript skeleton for a canvas 2D game (Culdcept-style). Application code lives in the [`app`](./app) workspace.

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

Packaging/installers are not configured yet; distribution is deferred.

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
