# WalletChan Rive Build Brief

## Source of Truth

Import the approved 1024px transparent layers from `../working/` into the Rive
editor. Do not crop, resize, recolor, simplify, or reinterpret them. Every layer
uses the same canvas specifically so it lands at the correct coordinates when
placed at the artboard origin.

Required canonical layers:

- `face-base-neutral-clean.png`;
- `eye-left-open.png` and `eye-right-open.png`;
- `eye-left-closed.png` and `eye-right-closed.png`;
- `mouth-idle-approved.png`;
- `mouth-concerned-approved.png`;
- `mouth-sleep-final.png`;
- `mouth-success-extracted.png`; and
- `effect-anger-manpu-approved.png`;
- `effect-sleep-z-small.png`;
- `effect-sleep-z-medium.png`; and
- `effect-sleep-z-large.png`; and
- `effect-success-sparkle-01.png` through
  `effect-success-sparkle-09.png`.

The converted SVG remains a historical comparison only. Its anonymous paths
and scanline seams are not the source of truth for this pilot.

## Artboard

- Name: `WalletChanMascot`
- Size: `1024 x 1024`
- Origin: center
- Fit: contain
- Transparent background
- Snap imported art and rigid props to whole or half pixels

## Hierarchy

```text
WalletChanMascot
├── CharacterRoot
│   ├── FaceBase
│   ├── Eyes
│   │   ├── LeftOpen
│   │   ├── RightOpen
│   │   ├── LeftClosed
│   │   └── RightClosed
│   └── Mouths
│       ├── Idle
│       ├── Concerned
│       ├── Sleep
│       └── Success
├── EffectsFront
│   ├── AngerManpu
│   ├── SuccessSparkles
│   └── SleepZs
│       ├── Small
│       ├── Medium
│       └── Large
└── Controls
```

Expression changes are rigid visibility swaps. Animate `CharacterRoot` and
effects, but do not deform or interpolate between raster face layers.

## View Model

Create an exported View Model named `MascotState`:

| Property | Type | Values / range |
| --- | --- | --- |
| `state` | Enum | `idle`, `attentive`, `thinking`, `success`, `error`, `sleeping` |
| `intensity` | Number | `0..1` |
| `gazeX` | Number | `-1..1` |
| `gazeY` | Number | `-1..1` |
| `accessory` | Enum | `none`, `lock`, `wallet` |
| `reducedMotion` | Boolean | `true`, `false` |
| `replay` | Trigger | one-shot replay |

Code and future LLMs must use this contract. They must not address timelines,
bones, or frame numbers.

## Timelines

### `Idle`

- Duration: 3.8 seconds, looping.
- CharacterRoot Y: `0 -> -4 -> 0`.
- CharacterRoot scale: `1 -> 1.006 -> 1`.
- Ambient sparkles use stepped opacity, not smooth glowing motion.

### `Attentive`

- Duration: 0.7 seconds, hold final pose.
- CharacterRoot Y: `0 -> -10 -> -4`.
- Scale: `1 -> 1.025 -> 1.012`.
- Rotation: `0 -> -1.5 -> 0` degrees.

### `Thinking`

- Duration: 2.6 seconds, looping.
- CharacterRoot drifts no more than 5px and 1 degree.
- Thought bubbles enter with stepped timing and settle above the bow.

### `Success`

- Duration: 0.82 seconds, one-shot.
- CharacterRoot jumps according to `intensity`, maximum 24px.
- Add a restrained two-stage settle.
- Stagger the nine approved success sparkles and drift them slightly outward.
  They appear only after the state is resolved and never during a pending
  transaction.

### `Error`

- Duration: 0.5 seconds, one-shot and settle.
- CharacterRoot X: `0 -> -9 -> 7 -> -3 -> 0`.
- Desaturate or darken slightly if it does not damage the pixel palette.
- Swap to `mouth-concerned-approved.png` and pop the approved anger Manpu.
- Do not add celebratory sparkles or make the reaction shame the user.

### `Sleeping`

- Duration: 4.6 seconds, looping slowly.
- CharacterRoot rotation stays within `-1.5..0.7` degrees.
- Reduce saturation/brightness slightly.
- Stagger the approved small, medium, and large Sleep Z layers by roughly
  560ms. Each moves upward slightly and fades without changing its saved canvas
  position.

## State Machine

Create `MascotMachine` with one stable state per timeline. Use the `state` enum
to transition between them. Transitions should blend for 120-200ms except:

- `success`: enter immediately, settle to `idle` after completion;
- `error`: enter immediately, hold the resolved error pose;
- `reducedMotion`: bypass looping timelines and display a static pose.

The `replay` trigger should restart the current one-shot timeline without
changing semantic state.

## Props

Props remain a future extension of the hierarchy. Keep the semantic property in
the View Model, but use `none` until approved full-canvas prop artwork exists.

## Export

- Export the runtime file to `../../public/rive/walletchan-mascot.riv`.
- Preserve the editable Rive backup as
  `../working/walletchan-mascot.rev` when the plan permits it.
- Embed assets for the extension experiment; do not use Rive CDN hosting.
- Start with `@rive-app/react-canvas-lite`.
- Package the matching WASM locally.

## Acceptance Gate

- Original identity and approved expressions are immediately recognizable at
  160-240 CSS pixels.
- No visible resampling damage to the intentional pixel edges.
- The layered raster artboard has measured file size and runtime results.
- Idle motion settles and does not compete with unlock controls.
- Reduced motion is static.
- All bytes load offline.
- The `.riv` is not promoted into the extension until Chrome and Firefox CSP,
  memory cleanup, and packaged build size are verified.
