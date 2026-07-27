# WalletChan Website

Landing page for WalletChan, a self-custodial multi-account Ethereum and EVM
browser wallet, at [walletchan.com](https://walletchan.com).

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI Library**: Chakra UI
- **Design System**: Warm Midnight (see [DESIGN.md](../../DESIGN.md))
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

The website uses WalletChan's Warm Midnight direction, defined in
[DESIGN.md](../../DESIGN.md) and
[WARM_MIDNIGHT.md](../../_docs/WARM_MIDNIGHT.md). Key characteristics:

- **Colors**: Near-black graphite surfaces, off-white text, financial blue, and
  restrained WalletChan amber
- **Typography**: Direct, readable hierarchy with condensed brand moments
- **Components**: Surface-lightness elevation, restrained borders, and
  product-led visuals
- **Shape**: Compact controls and softly rounded wallet surfaces

Shared design tokens are imported from `@walletchan/shared`.

## Deployment

The website is deployed to Vercel. Push to `master` to trigger automatic deployment.

## Full Specification

See [WEBSITE.md](../../_docs/WEBSITE.md) for the information-architecture
reference. Its preserved Bauhaus wireframes are historical; current visual
decisions come from `DESIGN.md` and `_docs/WARM_MIDNIGHT.md`.
