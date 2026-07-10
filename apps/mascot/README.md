# WalletChan Mascot Lab

An isolated character and motion experiment for WalletChan. This app is safe to
change without affecting extension, website, transaction, authentication, or
storage logic.

## Run

```bash
pnpm dev:mascot
```

Open `http://localhost:4327`.

Build the standalone lab with:

```bash
pnpm build:mascot
```

## What This Prototype Tests

- A fidelity-first presentation of the approved transparent mascot layers.
- An immutable neutral face with independent open/closed eyes, expression mouths,
  a Manpu status effect, independently staggered sleeping Z layers, and a
  separated success sparkle burst.
- Six semantic behaviors: idle, attentive, thinking, success, error, and sleep.
- Runtime intensity, gaze, prop, and reduced-motion controls.
- The same component at an extension-sized unlock context.
- Whether the art direction is worth taking into a real Rive rig.

The current motion is implemented with React, layered raster artwork, and CSS so
the approved character art and behavior contract can be evaluated without
pretending that code can author a binary Rive project. Rive's supported
authoring path still requires importing the layers in the editor and exporting
`.riv` there. This lab is not intended to become an in-house animation engine.

The live preview uses full-canvas 1024px transparent PNG layers from
`art/working/`. The raster-to-vector conversion turns the source texture into
thousands of horizontal segments that produce visible seam and moiré artifacts
when scaled, so it is retained only as a historical comparison under
`art/source/`.

## Rive Handoff

If this visual direction is approved:

1. Follow `art/rive/RIVE_BUILD_BRIEF.md`.
2. Import the approved 1024px layers listed in the build brief without cropping
   or changing their positions.
3. Preserve the semantic state names from `src/mascot/types.ts` and
   `src/mascot/presets.ts`.
4. Create a Rive View Model matching the semantic contract rather than exposing
   raw timeline names.
5. Rebuild the six behaviors in a Rive state machine.
6. Preserve rigid integer-aligned raster swaps before considering a separate
   pixel-inspired vector redraw.
7. Compare Rive output against this lab at extension scale.
8. Test `canvas-lite`, local WASM packaging, CSP, idle CPU, memory cleanup, and
   reduced motion before importing anything into the extension.

See [`../../_docs/MASCOT.md`](../../_docs/MASCOT.md) for the full strategy and
acceptance criteria.

## Reuse Boundary

The portable prototype lives in `src/mascot/`:

- `WalletChanMascot.tsx` — approved raster-layer renderer;
- `walletChanMascot.css` — state motion;
- `types.ts` — semantic runtime contract; and
- `presets.ts` — initial behavior vocabulary.

Do not import the lab directly into production yet. Promote the approved art,
contract, and eventual Rive asset into an intentionally shared package after the
pilot passes.
