# WalletChan Mascot System

## Purpose

WalletChan's mascot should become a durable product and brand asset rather than
a collection of unrelated PNGs, GIFs, and campaign illustrations. The goal is a
recognizable character that can:

- make a security-sensitive wallet feel approachable without weakening trust;
- react to product state in a useful, restrained way;
- appear consistently in the extension, website, social content, stickers, and
  future campaigns;
- gain new expressions, props, poses, and scenes without repeatedly rebuilding
  the character; and
- be controlled by product code and, later, constrained LLM-generated intents.

This document records the recommended direction and evaluation plan. It is a
design and architecture proposal, not an implemented runtime.

## Current Experiment

The first isolated prototype lives in [`apps/mascot`](../apps/mascot). Run it
with `pnpm dev:mascot` and open `http://localhost:4327`.

The prototype uses an immutable transparent neutral face plus approved,
full-canvas raster layers for open and closed eyes, idle/concerned/sleep/success
mouths, and the anger Manpu effect. Named React layers and CSS motion validate
expression swaps before Rive authoring. The raster-to-vector conversion remains
available only as a comparison because it produces horizontal seam and moiré
artifacts when scaled. This preserves the existing silhouette and pixel texture
while validating the semantic state contract, reduced-motion behavior, and
extension-sized composition. The exact editor hierarchy, timelines, View
Model, state-machine contract, and Agent prompt live under
`apps/mascot/art/rive/`.
Rive still requires importing and exporting the production `.riv` through its
editor; the repository does not fabricate a binary runtime file.

The approved layered raster pilot is also packaged locally on the production
unlock screen. It currently validates sleeping, attentive, invalid-password,
and success presentation against the real password/passkey lifecycle while
remaining independent from authentication behavior. This is still the CSS
pilot, not the final Rive runtime.

## Recommendation

Use **Rive as the leading candidate for the interactive product runtime**,
subject to a focused extension pilot.

Rive should be the renderer and state-machine layer, not the source of brand
truth and not a file that an LLM edits directly. The source of truth should be:

1. a WalletChan character bible;
2. an owned, transparent, layered character master;
3. a versioned semantic behavior contract; and
4. a human-reviewed Rive rig exported for the application.

Use a static PNG as the fallback and reduced-motion presentation. Keep
dotLottie as the strongest alternative if the desired system turns out to be a
finite library of authored reactions rather than a continuously steerable
character.

## Brand Role

WalletChan's current product direction is trustworthy, precise, approachable,
and spirited. The mascot is the primary vehicle for the spirited quality. It
should complement the product hierarchy rather than compete with financial and
security information.

The intended character personality is:

- **spirited**: energetic enough to be memorable;
- **clever**: observant and capable, not childish or confused by default;
- **reassuring**: calm when the user needs confidence;
- **slightly mischievous**: fun in harmless moments, never around material
  risk; and
- **security-aware**: serious and direct for warnings, suspicious requests,
  rejected actions, and failures.

This extends the existing `Mascot Spotlight` direction in `DESIGN.md`: use the
character at product-entry, onboarding, empty, reassurance, and outcome
moments. Do not use it as general decoration on every screen.

Successful mascot brands are systems, not isolated illustrations. Duolingo
describes Duo as the central visual element of its brand and builds other
characters from the same visual language. Phantom describes its ghost as a
trusted companion and coordinates the symbol, wordmark, color, typography, and
product experience around that idea.

References:

- [Duolingo: Building character](https://blog.duolingo.com/building-character/)
- [Duolingo: Reshaping Duo](https://blog.duolingo.com/reshaping-duo/)
- [Phantom: Introducing the new brand identity](https://phantom.com/learn/blog/introducing-phantom-s-new-brand-identity)
- [GitHub's character-centered Octocat universe](https://github.blog/engineering/user-experience/exploring-developer-happiness-inclusion-and-productivity-at-githubs-design-conference/)

## Character Bible Before Animation

Do not begin by importing the current GIF into an animation tool. First create
a compact character bible that defines:

- front, three-quarter, profile, and rear turnarounds;
- the canonical silhouette and proportions;
- immutable hair, bow, eye, face, and palette rules;
- allowed deformation and exaggeration;
- neutral, happy, excited, attentive, thinking, concerned, warning, error, and
  sleeping expressions;
- hand and arm poses;
- the lock, wallet, token, network, and transaction props;
- permitted seasonal accessories and campaign costumes;
- good and bad examples of mascot use; and
- behavior rules for security-critical contexts.

The silhouette deserves special attention. It should remain recognizable at
small extension sizes, in monochrome, and without facial detail.

### Behavioral Rules

The mascot must never:

- celebrate while a transaction is pending;
- smile through a failed, rejected, or suspicious request;
- pressure the user toward Confirm, Send, Sign, or Approve;
- obscure amounts, recipients, simulation results, warnings, or actions;
- use high-energy looping motion while the user is reading a confirmation; or
- turn a serious security warning into a joke.

The mascot may be more expressive during onboarding, unlock, empty states,
successful outcomes, chat, and marketing.

## Artwork Production

### Do Not Use the Existing GIF as the Master

The existing AI-generated GIF can remain a motion reference or temporary
marketing artifact, but it is unsuitable as the production master because it:

- has a white background and will likely retain edge halos after automatic
  removal;
- is a flattened sequence with no independently controllable parts;
- may contain frame-to-frame AI drift in details and proportions;
- cannot transition cleanly into new behaviors; and
- has no semantic runtime controls.

Removing the white background would only fix presentation. It would not make
the GIF modular or steerable.

### Required Layered Master

Create or commission a transparent layered source containing at least:

- head and separated hair sections;
- eyes, pupils, eyelids, and brows;
- multiple mouth shapes;
- bow and hair accessories;
- torso, shoulders, arms, and hands;
- lock, wallet, token, and chain props;
- sparkles and brand effects; and
- alternate hand and face poses.

Keep the editable layered artwork outside Rive and under WalletChan's control.
Rive exports are binary and are not a good substitute for an editable art
master.

### Pixel-Art Direction

Rive can import raster artwork and deform it with meshes and bones, but it is
not fundamentally a sprite-animation tool. Subpixel movement, rotation, and
mesh deformation can soften intentional pixels.

Evaluate two treatments during the pilot:

1. **Literal pixel character**: layered raster pieces, integer-aligned rigid
   transforms, pose swaps, and minimal mesh deformation.
2. **Pixel-inspired vector character**: a vector redraw that preserves the
   silhouette, palette, chunky geometry, and sparkle language while allowing
   smoother motion.

The second treatment is likely more expandable. The first may preserve the
current identity more precisely. Both must be judged at the actual CSS size and
device-pixel ratio used by the extension.

Rive references:

- [Manipulating shapes, bones, and meshes](https://rive.app/docs/editor/manipulating-shapes/manipulating-shapes)
- [Raster meshes](https://rive.app/blog/intro-to-meshes)

## Why Rive Is the Leading Candidate

Rive provides:

- skeletal animation, meshes, constraints, nested artboards, and animation
  mixing;
- visual state machines for authored transitions;
- reusable components and swappable artboards;
- runtime control from React;
- Data Binding view models that separate product data from animation internals;
  and
- MP4, WebM, GIF, PNG sequence, and static exports for marketing derivatives.

Rive recommends Data Binding for new interactive projects. View model
properties support numbers, booleans, triggers, strings, enums, colors, images,
lists, nested models, and artboards. This makes a clean designer/developer
contract possible without application code addressing animation frames or
bones.

References:

- [Rive Data Binding overview](https://rive.app/docs/editor/data-binding/overview)
- [Rive Web Data Binding API](https://rive.app/docs/runtimes/web/data-binding)
- [Rive state machines](https://rive.app/docs/editor/state-machine/state-machine)
- [Rive video and static exports](https://rive.app/docs/editor/exporting/exporting-for-video-and-static-design)

### Pricing and Ownership Notes

Rive is free for learning and creation, but production `.riv` export currently
requires a paid Cadet plan. Libraries for versioned reuse across Rive files are
currently a Voyager/Enterprise feature. Check current pricing before adopting
because plan names and prices may change.

- [Rive pricing](https://www.rive.app/pricing)
- [Rive Libraries](https://rive.app/blog/libraries-publish-once-reuse-everywhere-in-your-project)
- [Open-source Rive Web runtime](https://github.com/rive-app/rive-wasm)

## Semantic Mascot Contract

Product code and future agents should control semantic intent, not animation
implementation details.

An illustrative contract is:

```ts
type MascotMood =
  | "calm"
  | "curious"
  | "focused"
  | "happy"
  | "concerned"
  | "serious";

type MascotAction =
  | "idle"
  | "blink"
  | "look"
  | "nod"
  | "wave"
  | "think"
  | "recoil"
  | "point"
  | "cheer"
  | "sleep";

interface MascotState {
  mood: MascotMood;
  action: MascotAction;
  context: "unlock" | "home" | "chat" | "transaction" | "error";
  intensity: number; // Clamped to 0..1
  gazeX: number; // Clamped to -1..1
  gazeY: number; // Clamped to -1..1
  accessory: "none" | "lock" | "wallet" | "token" | "network";
  reducedMotion: boolean;
}
```

The exact implementation may change. The architectural rule should not: UI
code and LLMs must not refer to raw timeline names, frame numbers, bones, or
mesh parameters.

### Initial State Vocabulary

Persistent states:

- `locked_idle`
- `attentive`
- `thinking`
- `reviewing`
- `concerned`
- `success`
- `error`
- `sleeping`

Short reactions:

- blink;
- look toward an important control;
- nod;
- wave;
- point;
- recoil;
- present a token or lock; and
- restrained celebration.

Continuous properties:

- energy;
- urgency;
- gaze X/Y;
- progress;
- mood; and
- accessory or context.

## LLM and Code Steering

LLM integration should be added only after the semantic animation grammar is
stable.

The intended control flow is:

```text
Wallet/product state
        |
        v
Deterministic security policy
        |
        v
Optional LLM intent
        |
        v
Schema validation + allowlist + bounds
        |
        v
Versioned MascotState contract
        |
        v
Rive Data Binding
```

The deterministic policy always wins. An LLM may choose between a nod and a
small cheer after a confirmed success. It may not turn an error, risk warning,
or pending transaction into a happy state.

Do not make the pipeline depend on an LLM editing production `.riv` files.
Rive has an editor Agent, but external-agent and MCP-style editor connectivity
was still described as exploratory in April 2026. Treat editor AI as optional
authoring assistance rather than an architectural dependency.

- [Rive Agent update](https://rive.app/blog/free-rive-ai-agent)

## Product Usage

Good early product contexts:

| Context | Suggested behavior |
| --- | --- |
| Unlock | calm idle, blink, field attention, invalid-password reaction, success |
| Onboarding | wave, point, present a wallet or lock |
| Loading | quiet thinking with a settling state |
| Empty wallet | helpful gesture toward the funding action |
| Successful action | small relief, nod, or brief celebration |
| Auto-lock | sleepy transition |
| Chat | listening, thinking, and answer-ready states |
| Network error | concerned and attentive, not comedic |

Trust-critical transaction confirmations remain information-first. The mascot
should usually be absent from the reading path and may appear only in an outcome
state after the transaction is resolved.

## Marketing Reuse

Use the same canonical rig and behavior grammar to create reusable performances:

- 1-2 second reactions for UI, stickers, and replies;
- 4-6 second feature gestures for product announcements;
- 10-15 second social scenes;
- chain, swap, wallet, security, and WalletConnect props; and
- seasonal accessories that do not alter the core silhouette.

Marketing may use richer scenes and higher-energy performances than the wallet.
It should still use the same face, proportions, palette, movement signature, and
personality rules. Export video and image derivatives from the approved master
instead of generating unrelated AI videos for every campaign.

AI image/video tools may assist with concepts, expression exploration, and
storyboards. Human review must bring any accepted idea back into the canonical
character system.

## Browser Extension Runtime Constraints

### What "Self-Host the WASM" Means

Rive's web runtime uses WebAssembly (`.wasm`). Rive's default web setup can
fetch that runtime from `unpkg`. That is inappropriate for a wallet extension.

For WalletChan, **self-hosting does not mean operating a server**. It means:

1. pinning the Rive package version in the workspace;
2. copying or bundling the matching `.wasm` file into the extension build;
3. loading it through a `chrome-extension://...` or equivalent local packaged
   URL; and
4. packaging the `.riv` mascot and image assets locally as well.

The extension must work offline and must not download executable runtime code
from a CDN.

Rive documents setting `RuntimeLoader` to a locally bundled WASM resource:

- [Rive: Preloading and self-hosting WASM](https://rive.app/docs/runtimes/web/preloading-wasm)

### Manifest V3 CSP

Chrome's default Manifest V3 extension policy disables WebAssembly. Chrome's
documented minimum policy can allow locally packaged WASM with:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  }
}
```

This does not permit arbitrary remote scripts or ordinary `unsafe-eval`. It is
the narrow Chrome-supported allowance for WebAssembly.

WalletChan's current Chrome manifest does not define a custom
`content_security_policy`, so a Rive pilot would need to evaluate and add this
explicitly. Chrome and Firefox builds must be validated independently before a
production decision.

- [Chrome extension content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)

### Runtime Size

As documented in January 2026, the approximate compressed Rive WASM sizes are:

| Runtime | Compressed WASM |
| --- | ---: |
| `canvas-lite` | 222 KB |
| `canvas` | 567 KB |
| `webgl2` | 648 KB |

These figures exclude the JavaScript wrapper and WalletChan's `.riv` and image
assets. `canvas-lite` removes features including text, layout, audio, and
scripting, but may be sufficient for a focused character rig.

- [Rive runtime sizes](https://rive.app/docs/runtimes/runtime-sizes)
- [Rive Canvas versus WebGL2](https://rive.app/docs/runtimes/web/canvas-vs-webgl)

### Runtime Requirements

A pilot must:

- try `canvas-lite` first;
- pin and package all runtime and art assets locally;
- lazy-load the mascot where appropriate;
- pause rendering while the extension page is hidden;
- release Rive runtime resources on unmount;
- avoid permanent high-energy idle loops;
- provide a static PNG fallback;
- freeze or simplify the pose under `prefers-reduced-motion`;
- test popup, side panel, window, Chrome, and Firefox behavior; and
- measure startup latency, CPU, memory, and packaged build growth.

## Alternatives

### dotLottie

The strongest alternative. Modern dotLottie supports bundled animations,
themes, runtime slots, state machines, and typed inputs. It is a good choice for
a finite collection of authored reactions and has a relatively lightweight web
runtime. It is less naturally suited to a continuously poseable character rig.

- [dotLottie Web runtime](https://github.com/LottieFiles/dotlottie-web)
- [dotLottie interactivity](https://developers.lottiefiles.com/docs/dotlottie-player/dotlottie-web/interactivity/)

### Spine

The strongest escalation path for a deep, game-like character system with
outfits, skins, props, attachment swaps, animation tracks, and sophisticated
mixing. It introduces a specialist animation workflow, proprietary licensing,
and more runtime complexity than the first WalletChan experiment requires.

- [Spine skins](https://esotericsoftware.com/spine-skins)
- [Spine Pixi runtime](https://esotericsoftware.com/spine-pixi)

### Live2D Cubism

Best for a continuously expressive anime-style face or conversational avatar.
Its PSD preparation, mesh/deformer workflow, texture payload, and licensing are
unnecessarily specialized for the current small WalletChan mascot. Reconsider
only if WalletChan deliberately becomes an on-screen conversational companion.

- [Live2D Cubism Web SDK](https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-for-web/)

### Code-Native SVG or Canvas

Appropriate for a deliberately tiny first experiment containing only blink,
bob, success, error, and sleep. It provides maximum source control and LLM/code
steerability without a proprietary editor, but WalletChan would own the rig,
interpolation, state system, animator workflow, and rendering pipeline. Do not
allow a prototype to grow into an accidental in-house animation engine.

### GIF, APNG, WebM, and Sprite Sheets

Useful as playback and export formats, not as the canonical character system.
They work for fixed loops and fallbacks but cannot provide semantic state,
continuous parameters, modular props, or smooth transitions between arbitrary
behaviors.

## Phased Plan

### Phase 0: Character Foundation

- Write and approve the character bible.
- Produce the transparent layered master.
- Establish ownership and editable source formats.
- Define the first semantic states and reactions.
- Create 8-12 approved reference poses.

### Phase 1: Unlock-Screen Rive Pilot

Implement only:

- locked idle;
- natural blink;
- attention toward the password field;
- invalid-password reaction;
- unlocking state;
- successful unlock; and
- reduced-motion/static fallback.

Compare literal layered raster and pixel-inspired vector treatments.

### Phase 2: Canonical Product Rig

- Finalize and version the semantic mascot contract.
- Add home, loading, success, warning, error, and sleeping states.
- Add props as modular components.
- Add golden image/video captures for every approved state.
- Confirm an animator can add an expression without product-code changes.

### Phase 3: Selective Product Rollout

- Onboarding and unlock.
- Empty and loading states.
- Successful outcomes.
- Chat/assistant states.
- Occasional seasonal or campaign surfaces.
- Continue excluding the mascot from dense confirmation reading paths.

### Phase 4: Marketing Kit

- Create short-, medium-, and long-form performance templates.
- Add campaign props and approved accessories.
- Export transparent and social-ready derivatives from the same master.
- Establish naming, review, and versioning conventions.

### Phase 5: Constrained LLM Orchestration

- Define a JSON schema for semantic mascot commands.
- Add allowlists, numeric bounds, fallbacks, and deterministic risk policy.
- Permit storyboard and performance selection from approved vocabulary.
- Require human approval for new expressions, props, or source artwork.

## Pilot Acceptance Criteria

Adopt Rive only if the unlock-screen pilot confirms:

- the mascot remains crisp and recognizable at real extension sizes;
- first meaningful frame does not make unlock feel slower;
- idle CPU and battery impact are negligible;
- memory is released when the surface unmounts;
- all bytes work offline and comply with extension CSP;
- Chrome and Firefox builds remain supportable;
- packaged size growth is acceptable;
- reduced-motion and static fallbacks work correctly;
- animation does not distract from authentication; and
- an animator can add or refine a behavior without changing application logic.

If Rive fails pixel fidelity or extension-cost requirements, compare dotLottie
for finite reactions and a small code-native layered sprite system before
considering heavier character runtimes.

## Decision Summary

- **Leading candidate:** Rive with `canvas-lite`, packaged locally.
- **Source of truth:** character bible plus transparent layered art master.
- **Runtime boundary:** versioned semantic data contract using Rive Data
  Binding.
- **LLM boundary:** validated semantic intents only; no raw rig control.
- **Product rule:** mascot-led identity and reassurance, information-first
  confirmations.
- **Marketing rule:** derive campaigns from the same canonical character rather
  than generating unrelated one-off animations.
- **Fallback:** static PNG and reduced-motion pose for every product use.
- **Next action:** character foundation followed by a tightly scoped unlock
  pilot; do not begin with an app-wide runtime rollout.
