# Development

This is a pnpm workspaces monorepo containing the browser extension (`apps/extension`) and the landing page website (`apps/website`).

## Pre-requisites

- Node.js (see .nvmrc for the version)
- pnpm

## Project Structure

```
walletchan/
├── apps/
│   ├── extension/    # Browser extension (Vite + React + Chakra UI)
│   └── website/      # Landing page (Next.js + Chakra UI)
├── packages/
│   └── shared/       # Shared design tokens and assets
└── package.json      # Root workspace
```

## Building from source

1. Install dependencies: `pnpm install`
2. Build the extension: `pnpm build:extension`
3. The built extension will be in `apps/extension/build/`

## Running the extension in development mode

1. Install dependencies: `pnpm install`
2. Build the extension: `pnpm build:extension`
3. Load the extension in your browser:
   - Chrome/Brave/Arc: Go to `chrome://extensions`, enable Developer mode, click "Load unpacked", select `apps/extension/build/`
   - Or use the scripts:
     - Chrome: `pnpm --filter @walletchan/extension chrome:run`
     - Firefox: `pnpm --filter @walletchan/extension firefox:run`

## Running the website in development mode

```bash
pnpm dev:website
```

This starts the Next.js dev server at `http://localhost:3030`. The port is intentionally non-default — it must match `WALLETCHAN_DEV_PORT` in `apps/extension/src/constants/externalUrls.ts` so `pnpm dev:extension` can round-trip API calls against your local dev server.

## Workspace Commands

From the root directory:

| Command                | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `pnpm install`         | Install all dependencies                                          |
| `pnpm build:extension` | Build the browser extension                                       |
| `pnpm build:website`   | Build the website                                                 |
| `pnpm build`           | Build both extension and website                                  |
| `pnpm dev:extension`   | Run extension in dev mode                                         |
| `pnpm dev:website`     | Run website in dev mode                                           |
| `pnpm zip`             | Create extension zip for distribution (GitHub Releases)           |
| `pnpm zip:cws`         | Create CWS-ready zip (strips `key` defensively, no-op today)      |
| `pnpm lint`            | Lint the extension code                                           |

## Releasing & Publishing

See [`PUBLISHING.md`](./PUBLISHING.md) for the full release workflow, Chrome Web Store upload process, and self-hosted auto-update system.

Quick reference:

```bash
pnpm release:patch  # 0.2.0 → 0.2.1 (bug fixes)
pnpm release:minor  # 0.2.0 → 0.3.0 (new features)
pnpm release:major  # 0.2.0 → 1.0.0 (breaking changes)
```
