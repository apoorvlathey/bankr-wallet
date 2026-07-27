# WalletChan Docs

End-user documentation for [docs.walletchan.com](https://docs.walletchan.com),
built with Vocs in the WalletChan pnpm workspace.

## Local development

From the repository root:

```bash
pnpm install
pnpm dev:docs
```

Build and preview:

```bash
pnpm build:docs
pnpm --filter @walletchan/docs preview
```

Vocs 2.6 uses Waku, which supports Node 22.15, 24, and 26 release lines. Use
Node 24 on Vercel.

## Vercel project

Create a separate Vercel project for this monorepo with:

| Setting | Value |
| --- | --- |
| Root Directory | `apps/docs` |
| Framework | Other / auto-detected Vocs |
| Install Command | `pnpm install` |
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| Node.js | 24 |
| Production domain | `docs.walletchan.com` |

Vocs detects Vercel automatically. No adapter setting is required.

## Content rules

1. Use current code and tests as the availability source of truth.
2. Treat `CHANGELOG.md`, package changelogs, `DESIGN.md`, and
   `_docs/WARM_MIDNIGHT.md` as discovery sources, then verify every old claim
   against the current implementation and feature gates.
3. Frame WalletChan as an Ethereum and EVM browser wallet with clear request
   review, multiple custody/signing models, dapp connectivity, asset movement,
   security, privacy, and smart-account features. Treat Bankr as an optional
   remote-signing account and Bankr chat as one feature, not the product
   identity.
4. Every transactional page must cover private key, seed phrase, Ledger,
   view-only, Safe, and Bankr behavior where relevant.
5. Do not advertise preview/QA routes, disabled sponsored Base USDC transfer,
   deprecated `eth_sign`/typed-data v1, or removed Private Send.
6. Give every page a unique title and description, focused headings, and
   descriptive internal links.
7. Update `vocs.config.ts` navigation in the same change as any page move.
8. Run `pnpm --filter @walletchan/docs audit:markdown` and
   `pnpm build:docs` before publishing.

Vocs automatically publishes keyword search, `.md` page variants,
`/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/robots.txt`, canonical
metadata, and the docs MCP endpoint.
