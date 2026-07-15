# Avatar image cache audit domain

This domain is the only privileged remote-image byte pipeline used for ENS
avatars and token logos. Review in dependency order:

1. `constants.ts` — released storage key, TTL/LRU, byte, dimension, redirect,
   deadline, and concurrency limits.
2. `types.ts` — exact persisted entry schema.
3. `policy.ts` — public-HTTPS URL, raster MIME, and persisted data-URL gates.
4. `bodyReader.ts` — streaming response ceiling before body allocation.
5. `rasterSignature.ts` — generic-binary JPEG/PNG/GIF/WebP signature policy.
6. `scheduler.ts` — two-concurrent FIFO, same-URL single-flight, controller
   tracking, and wallet-reset epoch invalidation.
7. `transport.ts` — credentialless/referrerless manual redirect fetches.
8. `rasterizer.ts` — decode-to-pixels, 128px resize, bounded WebP re-encode,
   and unconditional bitmap cleanup.
9. `repository.ts` — locked best-effort `ensAvatarImageCache` commits, entry
   revalidation, 14-day expiry, 200-entry/5 MiB LRU, and stale-epoch cleanup.
10. `coordinator.ts` — cache-first public orchestration and null-on-error boundary.

`avatarImageCache.ts` is an export-only compatibility facade. Existing callers
retain the implementation function identities.

## Frozen security invariants

- Only public HTTPS raster sources are fetched; each of at most three redirect
  targets is manually revalidated. Explicit raster MIME types are accepted;
  generic `application/octet-stream` responses additionally require a known
  JPEG, PNG, GIF, or WebP signature before decode. Requests have a 10-second
  deadline and omit credentials and referrers.
- Bodies are streamed under 2 MiB, decoded to inert pixels, resized to at most
  128×128, and re-encoded under 512 KiB. SVG/document bytes are never cached.
- The exact cache key/schema, 14-day TTL, 200-entry ceiling, and 5 MiB ceiling
  remain compatible. Reads and writes are best-effort and never block wallet
  operation.
- Reset aborts active requests, invalidates queued/decoding work by epoch, and
  removes any commit whose storage write crossed that reset boundary.
