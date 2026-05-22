# WalletChan Website

Landing page for WalletChan at [walletchan.com](https://walletchan.com).

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI Library**: Chakra UI
- **Design System**: Bauhaus (see [STYLING.md](../../STYLING.md))
- **Animations**: Framer Motion
- **Hosting**: Vercel

## Development

```bash
# From the monorepo root
pnpm dev:website

# Or from this directory
pnpm dev
```

The dev server runs at `http://localhost:3030`. The port is intentionally non-default — the extension's `pnpm dev:extension` build expects it (see `apps/extension/src/constants/externalUrls.ts` → `WALLETCHAN_DEV_PORT`).

## Building

```bash
# From the monorepo root
pnpm build:website

# Or from this directory
pnpm build
```

Output is generated in `.next/`.

## Design System

The website uses the Bauhaus design system defined in [STYLING.md](../../STYLING.md). Key characteristics:

- **Colors**: Red (#D02020), Blue (#1040C0), Yellow (#F0C020), Black (#121212)
- **Typography**: Outfit font, bold uppercase headings
- **Components**: Hard shadows, thick borders, geometric shapes
- **No rounded corners** (except circles)

Shared design tokens are imported from `@walletchan/shared`.

## Deployment

The website is deployed to Vercel. Push to `master` to trigger automatic deployment.

## Full Specification

See [WEBSITE.md](../../WEBSITE.md) for the complete product requirements document including all sections, components, and design specifications.
