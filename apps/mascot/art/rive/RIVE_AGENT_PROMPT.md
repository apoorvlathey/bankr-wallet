# Rive Agent Prompt

Use this after importing
`apps/mascot/art/source/walletchan-original-vectorized.svg` into a new Rive
file. Attach `RIVE_BUILD_BRIEF.md` as additional context if the editor supports
attachments.

```text
Build a fidelity-first interactive mascot prototype from the imported
WalletChan artwork.

Do not redraw, recolor, simplify, or reinterpret the imported character. Keep
the current silhouette, face, hair, blue bow, pixel edges, internal scanline
texture, and sparkles unchanged. Treat the imported art as one immutable
OriginalArt group inside a CharacterRoot group.

Create an artboard named WalletChanMascot at 1024 x 1024 with a transparent
background and centered origin.

Create this hierarchy:
- EffectsBehind
  - SuccessBurst
  - ThoughtBubbles
  - SleepZs
- CharacterRoot
  - OriginalArt
- Props
  - Lock
  - Wallet
- EffectsFront
  - AmbientSparkles
  - ErrorBadge

Create an exported View Model named MascotState with:
- state enum: idle, attentive, thinking, success, error, sleeping
- intensity number, 0 to 1
- gazeX number, -1 to 1
- gazeY number, -1 to 1
- accessory enum: none, lock, wallet
- reducedMotion boolean
- replay trigger

Create timelines and a state machine named MascotMachine:

Idle: 3.8 second loop. Move CharacterRoot Y 0 to -4 to 0 and scale 1 to
1.006 to 1. Keep it calm.

Attentive: 0.7 second one-shot that holds. Move Y 0 to -10 to -4, scale 1 to
1.025 to 1.012, rotation 0 to -1.5 to 0 degrees.

Thinking: 2.6 second restrained loop with no more than 5px translation or 1
degree rotation. Show three stepped thought bubbles above the bow.

Success: 0.82 second one-shot. Jump up by intensity times 24px, scale to a
maximum of 1.045, then make a two-stage settle. Add a brief restrained sparkle
burst. Never loop the celebration.

Error: 0.5 second one-shot and hold. Move X 0, -9, 7, -3, 0. Show a red error
badge and hide celebratory effects. Do not add comedy or happy effects.

Sleeping: 4.6 second slow loop with rotation between -1.5 and 0.7 degrees.
Show blue Zs moving upward and fading.

Use 120-200ms blends between stable states. Success and error should enter
immediately. When reducedMotion is true, bypass looping motion and use static
poses. The replay trigger restarts the active one-shot without changing state.

Create Lock and Wallet as separate components. Use the accessory enum so only
one prop is visible. Props enter using opacity plus a small 0.88 to 1 scale.

Do not expose raw timeline names, bones, or frame numbers as the public API.
Do not add text, audio, scripting, blur, glow, or blend modes. Keep the file
compatible with the canvas-lite runtime.
```

After the Agent finishes, inspect every state manually. It may create a useful
first pass, but security behavior, transition timing, and pixel fidelity still
require human approval.
