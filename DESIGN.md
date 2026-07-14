# DESIGN.md - WalletChan

> Screen-by-screen implementation decisions and current review status live in
> [`_docs/WARM_MIDNIGHT.md`](./_docs/WARM_MIDNIGHT.md).

## Context (from discovery)

- Artifact type: mobile-first browser wallet and financial application.
- Positioning: trustworthy consumer finance with expert transaction tooling.
- Audience: crypto newcomers and power users. Primary action: understand and safely approve the next wallet action.
- Adjectives: trustworthy, precise, approachable, spirited.
- Visual word translations:
  - Trustworthy: stable hierarchy, explicit outcomes, restrained financial blue.
  - Precise: aligned amounts, tabular numerals, hairline rules, consistent geometry.
  - Approachable: plain-language labels, one primary action per screen, progressive disclosure.
  - Spirited: mascot-led identity moments and warm amber used with restraint.
- Aesthetic essence: warm financial confidence.
- Single-minded proposition: WalletChan makes powerful wallet actions easy to understand before the user commits.
- Archetype: Sage with an Everyman interaction model.
- References: Rabby for wallet information hierarchy and full-screen mobile flows; WalletChan's Swiss Knife project for restrained Chakra composition; shadcn/ui for semantic recipes and complete state discipline. Transpose behavior and restraint, not default visuals.
- Avoid: violet-forward web3 styling, thick outlines around every region, card-in-card stacks, desktop dropdowns squeezed into the popup.
- Mode: both. Midnight is the default and receives the restrained product language; Bauhaus remains an intentionally expressive alternate theme.
- Density: balanced on root screens, dense but zoned on transaction details.
- Constraints: React 18, Chakra UI 2, browser popup/window/sidepanel, WCAG 2.2 AA, no wallet logic or storage changes during visual phases.

## Aesthetic

- Direction: Warm Midnight, a precise financial dark interface made unmistakably WalletChan through its pixel mascot, condensed wordmark, and selective amber warmth.
- Defining trait: structure comes from proximity, alignment, surface lightness, and hairline rules instead of repeated bordered cards.
- Signature move: the Mascot Spotlight. WalletChan appears at product-entry, onboarding, empty, and reassurance moments; amber marks brand commitment actions and the final single-transaction Confirm decision, while financial blue remains the focus, link, selection, and ordinary interaction color. Financial gain/loss keeps semantic green/red.

## Typography

- Brand wordmark: Anton Regular, rendered uppercase through the shared
  `BrandWordmark` component for explicit logo/name lockups in the app header,
  unlock screen, onboarding, and About identity block. It is self-hosted
  through `@fontsource/anton` and is not used for screen headings, body copy,
  controls, technical content, or ordinary product-name mentions.
- Display: Inter/system UI for Midnight; Outfit for the expressive Bauhaus theme.
- Body: Inter/system UI for Midnight; Outfit remains a Bauhaus-only brand face.
- Mono: JetBrains Mono, SIL Open Font License, for addresses, hashes, calldata, and aligned technical values.
- Scale: Major Second 1.125, compact for a 360px application viewport.

| Step | Size | Line height | Use |
| --- | ---: | ---: | --- |
| page | 24px | 1.2 | screen title |
| section | 20px | 1.25 | major section |
| title | 18px | 1.3 | card or row title |
| body | 16px | 1.5 | controls and primary copy |
| small | 14px | 1.45 | secondary copy |
| caption | 12px | 1.4 | metadata only |

- Weights: 400, 500, 600, 700. Avoid 900 in Midnight.
- Tracking: -0.01em on titles, normal body, 0.01em on captions. Midnight labels use sentence case.
- Numbers: `font-variant-numeric: tabular-nums` for balances, prices, fees, timestamps, and transaction values.

## Color

- Strategy: a neutral graphite elevation ramp with trustworthy financial blue and a sharp WalletChan amber. Blue replaces generic web3 violet for transactions and focus; amber is reserved for mascot-led identity, brand commitment actions, and small moments of warmth.
- Distribution: roughly 75 percent neutral surfaces, 20 percent text and structure, 5 percent blue/amber action and status accents.
- Midnight palette:
  - base: `oklch(0.145 0.004 286)` | `#09090B`
  - raised: `oklch(0.178 0.004 286)` | `#111113`
  - raised-hover: `oklch(0.218 0.004 286)` | `#18181B`
  - sunken: `oklch(0.159 0.004 286)` | `#0A0A0B`
  - fg: `oklch(0.970 0.002 286)` | `#F4F4F5`
  - secondary: `oklch(0.705 0.015 286)` | `#A1A1AA`
  - muted: `oklch(0.620 0.015 286)` | `#85858F`
  - border: `rgba(255,255,255,0.10)`
  - action: `oklch(0.546 0.215 263)` | `#2563EB`
  - action-soft: `oklch(0.714 0.143 255)` | `#60A5FA`
  - highlight: `oklch(0.769 0.165 70)` | `#F59E0B`
  - success: `oklch(0.792 0.184 151)` | `#4ADE80`
  - warning: `oklch(0.837 0.164 84)` | `#FBBF24`
  - error: `oklch(0.711 0.166 22)` | `#F87171`
- Approved foreground pairs: white on action blue is 5.17:1; near-black on action-soft blue is 7.83:1; primary text on raised is 17.16:1; muted text on raised is 5.16:1.
- Bauhaus palette remains defined in its theme implementation. Components consume intent tokens only.

## Spacing, radius, shadow

- Spacing base: 4px, with 4/8/12/16/24/32px as the main relationship scale.
- Radius: 8px for controls and small elements; 12px for cards and top-level surfaces. Pills are reserved for statuses, filters, and avatars. Modals may use 16px because they are true floating surfaces.
- Shadow approach: elevation by surface lightness. Resting cards and controls are shadowless. Only floating overlays receive a neutral soft shadow.

## Layout and composition

- Grid: single-column mobile stack with 16px gutters; two-column rows only where comparison benefits.
- Spacing rhythm: 4 to 8px within a text/value group, 12 to 16px within a section, 24px between sections.
- Signature layout move: each screen reads as a short decision path: context, outcome, details, action.
- Density: balanced. Use unboxed sections and one outer surface owner rather than nested cards.
- Scanning: F pattern with primary identity and outcome top-left and numeric values right-aligned.
- Responsive: mobile-first. Popup 360x600, window 480x720, sidepanel 420x760 are first-class viewports.

## Components and states

- Button hierarchy: one filled primary, neutral secondary, quiet tertiary. Destructive red is loud only inside a destructive confirmation.
- States: default, hover, pressed, focus-visible, disabled, loading, invalid/error, and selected where applicable. Weight never changes between states.
- Inputs: visible labels, 44px minimum touch height, 16px input text, inline corrective errors, retained values.
- Lists and financial data: light row separators, aligned columns, tabular numerals, no heavy cell grid.
- Overlays: popovers for small contextual choices; action sheets for 2 to 6 choices; full screens for search, selection, configuration, and transaction detail; dialogs only for blocking decisions.
- Empty/loading/error: actionable empty copy, geometry-matching skeletons, recoverable errors with a next step.
- Focus ring: blue 3px outer ring with sufficient contrast and no layout shift.
- Architecture: renderer implementations are organized by feature domain with
  local audit maps. Screen roots compose; feature hooks own one state/effect
  domain; presentational components receive callbacks; pure models contain no
  React, Chakra, Chrome, storage, or network effects. New implementation files
  stay below roughly 400 lines, while existing oversized roots use ratcheting
  budgets. See `_docs/EXTENSION_UI_ARCHITECTURE.md`.

## Motion

- Duration: instant 100ms, fast 150ms, normal 200ms, slow 300ms, sheet 420ms.
- Easing: enter `cubic-bezier(0.23, 1, 0.32, 1)`; movement `cubic-bezier(0.77, 0, 0.175, 1)`; sheet `cubic-bezier(0.32, 0.72, 0, 1)`.
- Animate only transform and opacity for spatial transitions. Color-state transitions explicitly list color properties.
- High-frequency wallet actions stay nearly instant. Full-screen push/back motion communicates hierarchy.
- Reduced motion: replace translation and scale with an opacity-only state change.

## Interaction sound

- Character: tiny, warm, and precise. Sound reinforces a small set of meaningful
  outcomes without making the wallet feel game-like or noisy.
- Default: enabled, with one global Settings → Sounds switch. Audio is always
  optional and never carries information that is missing visually.
- Trigger discipline: confirmation presses, incoming dapp requests, action
  sheet transitions, and a tiny set of deliberate hover targets only. No
  routine navigation, typing, scrolling, or blanket button sounds. Hover cues
  are fine-pointer-only and centrally rate-limited so sweeping a list does not
  become a sound cascade.
- Architecture: product code requests semantic cues from the shared sound
  manager; Cuelume recipe choices and preference enforcement stay centralized.
- Signature cue: successful unlock pairs the mascot sparkle pose with Cuelume's
  short `sparkle` recipe for one coherent reassurance moment.
- Current palette: `success` acknowledges a transaction Confirm press, `chime`
  announces an incoming dapp request, `bloom` accompanies action-sheet opening
  and closing, the custom value click marks portfolio token rows, and `press`
  marks the Send, Swap, Shield, and More action targets.
- Value pulse: a local Web Audio voice uses a 520Hz sine through a 1500Hz
  low-pass filter. The chart retains its 5ms attack / 45ms decay pulse and is
  capped at one pulse per 26ms.
- Slider movement: actual non-snap value changes play a quieter 3ms attack /
  18ms decay tick, also capped at one per 26ms so successive steps stay
  discrete. Entering a new 0/25/50/75/100 snap stop plays Cuelume `release`
  once; repeated raw values within the same snap band are discarded.
- Value click: portfolio token hover uses the same oscillator/filter character
  with a 2ms attack, 12ms decay, and slightly lower gain, producing a related
  click rather than the pulse's sustained tail.

## Iconography

- Set: existing Chakra/custom icons, normalized to a 20 or 24px grid with approximately 2px strokes and rounded joins.
- Icons inherit `currentColor`. Interactive icon targets remain at least 40px, preferably 44px.
- Network, token, and dapp marks retain their real identity inside quiet neutral containers.

## Imagery and illustration

- Mode: real token, network, dapp, and account imagery. The WalletChan character is brand identity, not general decoration.
- Rules: local deterministic assets in previews; circular crops only for identity; no ornamental image treatments inside trust-critical flows.
- Avoid: generic web3 gradients, glowing orbs, stock illustrations, and decorative glassmorphism.

## Dark mode

- Base is near-black rather than pure black. Elevation steps increase lightness from base to raised to floating.
- Foreground is off-white rather than pure white. Secondary and muted text remain WCAG AA.
- Action blue is controlled and status colors are desaturated enough for dark surfaces.
- Borders are lighter than adjacent surfaces. Shadows are neutral and limited to floating overlays.

## Accessibility

- Contrast: WCAG 2.2 AA in both themes; 4.5:1 normal text and 3:1 controls/focus boundaries.
- Focus: visible, managed, restored after overlays, and not hidden by sticky action bars.
- Keyboard: all controls operable with native semantics and conventional key behavior.
- Targets: 24px minimum, 44px preferred for mobile wallet actions.
- Color independence: statuses pair color with labels/icons; gains and losses include signs and text.
- Reduced motion: respected. Verify at 200 percent zoom and 320px reflow.

## Tokens (source of truth)

```css
:root[data-theme="midnight"] {
  --font-display: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --color-bg: #09090b;
  --color-surface: #111113;
  --color-surface-hover: #18181b;
  --color-fg: #f4f4f5;
  --color-muted: #85858f;
  --color-border: rgba(255, 255, 255, 0.1);
  --color-accent: #2563eb;
  --color-accent-fg: #ffffff;
  --radius-control: 8px;
  --radius-surface: 12px;
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
```

- Adapter: Chakra UI semantic intent tokens through `ThemeTokens` and `createChakraTheme`.
- Implementation references: `_docs/STYLING.md`, `apps/extension/src/theme/tokens.ts`, and `apps/extension/src/theme/themes/*.ts`.

## Cards and surfaces

- Cards use surface lightness plus an optional hairline border, never a border and resting shadow together.
- Lists own one outer edge and use separators between rows.
- Avoid panel-card nesting. Use spacing, headings, and dividers for inner groups.

## Slop audit

- Date: 2026-07-10.
- Result: Phase 1 foundation passes after fixing seven system-level tells: violet
  action styling, colored focus/modal glow, resting shadows, `transition: all`,
  competing filled button ranks, incomplete component states, and a looping
  bounce on an error-recovery action.
- Deliberate exceptions: Outfit remains the established Bauhaus brand face;
  Midnight uses Inter/system UI and JetBrains Mono supplies the technical contrast. The compact 1.125 type scale
  fits a 360px financial application. Financial blue is category-appropriate
  and contrast-tested, not the prior violet web3 default.
- The screen-level audit is complete: production destinations now use the
  mobile screen/list grammar, quiet Midnight surfaces, sentence-case copy, and
  explicit dialog/sheet/screen exceptions recorded in `_docs/IMPROVE_UI.md`.
- Packaged runtime QA subsequently caught and fixed a stale `inert` navigation
  layer, an undersized explorer target, and an empty financial-impact state.
  Manual WebAuthn, screen-reader, and successful onchain smoke remain release
  checks rather than design-system work.
- 2026-07-11 password-change step-up audit: passes the Settings grammar with
  one primary action per step, native form submission, managed focus, visible
  labels, retained inline errors, 40–44px icon/action targets, intent-token
  colors, and text-plus-icon factor-removal warnings. Manual WebAuthn and
  screen-reader verification remain release checks.
- 2026-07-14 unlock pending-request audit: passes the Warm Midnight hierarchy
  with a lifted shadowless graphite surface, a soft rounded frame, the homepage
  banner's bare-bell / centered-label / chevron geometry, a repeating
  reduced-motion-safe ring, and clean popup and compact reflow previews in both
  themes.
- 2026-07-14 saved-RPC selector audit: passes with the token-styled Chakra menu
  already established by the extension, named provider identities, sanitized
  provider favicons, single-source selected-endpoint status, independent per-row
  editing, confirmed removal of any endpoint when a fallback exists, and no
  duplicate details block below the selector. Selected and hovered endpoints use
  one continuous row surface; the nested edit target darkens independently.
  Its editor uses conventional left-hand back navigation, a stable label-row
  copy action with a compact 24px target, edge-aligned full-width footer actions,
  and the amber brand
  commitment style. The single-line URL field retains inline validation,
  keyboard Enter/Escape support, reduced-motion fallback, and one primary action.

## Changelog

- 2026-07-14: moved Chains directly after Appearance in the main Settings list
  so theme and network configuration stay together near the top-level entry.
- 2026-07-14: replaced the single RPC field in Edit Network with a bounded,
  keyboard-operable saved-endpoint dropdown. Named endpoints pair provider
  favicons with readable domains, expose the complete URL with copy/edit
  actions, and morph into a full-width editor. Built-in chains autosave validated
  endpoint changes without a redundant footer, while custom chains retain the
  staged Cancel and amber Save changes actions for their editable name, chain ID,
  endpoint, explorer, and native-currency fields.
- 2026-07-10: established the durable mobile-wallet direction and Midnight V2 foundation before production UI changes.
- 2026-07-10: implemented Midnight V2 recipes, quiet theme primitives, contrast tests, and the production component-state lab.
- 2026-07-10: added the mobile screen/list/picker/action-sheet grammar, horizontal navigation, and restoration-aware interaction preview.
- 2026-07-10: migrated primary, trust-critical, settings, account, token, and chat destinations; added the 235-state preview matrix and packaged all-wallet runtime QA.
- 2026-07-10: began the Warm Midnight brand pass with a self-hosted Anton wordmark, then consolidated every explicit extension logo/name lockup into the shared `BrandWordmark` component; product typography remains unchanged pending screen-by-screen review.
- 2026-07-10: simplified unlock to the essential credential actions; password rejection now uses a stable inline label, a reduced-motion-safe input shake, and reveals recovery without shifting surrounding controls.
- 2026-07-10: established Warm Midnight on the unlock screen with a mascot-led identity composition and a dedicated amber `brand` action. Superseded on 2026-07-13 for the final single-transaction Confirm action; ordinary transactional controls remain blue.
- 2026-07-10: replaced the unlock form's generic side label with a centered, larger “Enter password to unlock” instruction beneath the mascot while preserving the fixed-position error treatment.
- 2026-07-12: reserved a consistent 24px gap between the unlock instruction and password field so inline errors retain clear breathing room, and applied the same reduced-motion-safe field shake and concerned mascot state to empty submissions as incorrect passwords.
- 2026-07-12: clarified the destructive account-removal decision by removing the duplicate address label for unnamed accounts and showing a freshly loaded, tabular portfolio total alongside the account identity.
- 2026-07-12: tightened the removal dialog identity card with measured Pretext middle truncation and a single-line portfolio summary, preventing address and label wrapping at popup widths.
- 2026-07-12: added a distinct final-confirmation state before account deletion; the first step provides financial and backup context, while only the second step can execute removal and retains a clear cancel path.
- 2026-07-10: connected the approved layered WalletChan mascot pilot to the
  real unlock lifecycle: sleeping while empty, attentive on typing or passkey
  verification, concerned with Manpu on invalid credentials, and a transient
  success/sparkle reaction captured by the existing auth fade. Passkey
  cancellation returns to the password-mode presentation without changing
  authentication semantics. Visible surfaces hold success for 500ms before the
  fade (120ms with reduced motion); hidden sibling surfaces never wait on the
  presentation.
- 2026-07-11: added `_docs/WARM_MIDNIGHT.md` as the durable surface-level
  handoff for approved branding decisions, current implementation status, and
  one-surface fresh-session workflow.
- 2026-07-11: constrained portfolio-chart smoothing to each timestamp segment
  so abrupt value changes remain precise instead of forming oversized curves.
- 2026-07-11: changed password rotation into a two-step Settings flow that
  explicitly verifies the current master password before collecting the new
  one, explains why biometric unlock cannot substitute, and warns when the
  rotation will remove biometric or agent unlock factors.
- 2026-07-11: refined the About identity spacing and consolidated its links
  around the WalletChan website and official social account.
- 2026-07-11: simplified App options into concise action-first labels and
  reserved supporting copy for the WalletChan OS destination.
- 2026-07-11: increased action-sheet row height and vertical padding so
  single-line actions retain comfortable rhythm without supporting copy.
- 2026-07-11: added the restrained interaction-sound contract, a browser-local
  Sounds preference, and the first semantic cue: one sparkle after successful
  password or biometric unlock.
- 2026-07-12: extended the semantic sound palette to transaction confirmation,
  incoming dapp requests, and rate-limited fine-pointer hover cues for
  portfolio tokens and the four homepage actions.
- 2026-07-12: paired the shared action sheet's opening and closing transitions
  with the warm `bloom` cue at the component boundary.
- 2026-07-12: added the custom value-pulse voice for slider changes and
  portfolio-chart NumberFlow scrubbing, including 26ms rate limiting and
  continuous-drag suppression.
- 2026-07-12: derived a 14ms value-click variant for portfolio token hover so
  list traversal shares the value-pulse character without its longer tail.
- 2026-07-12: split chart and slider sound semantics, deduplicated sliders on
  normalized snap values, and assigned one `release` cue per newly-entered 25%
  stop to eliminate sustained snap-band playback.
- 2026-07-12: restored continuous slider movement feedback with a shorter,
  lower-gain pulse while preserving one-shot `release` cues at snap stops.
- 2026-07-12: reduced the Sounds settings screen to one concise preference row,
  removing repeated explanatory copy around the toggle.
- 2026-07-12: extended the portfolio token-hover cue to aggregate asset rows so
  grouped ETH, USDC, and USDT behave like regular token rows.
- 2026-07-12: seeded amount-slider sound state at its initial 0% position so
  first contact is silent and `release` remains reserved for real snap entry.
- 2026-07-12: projected Warm Midnight onto the experimental marketing homepage,
  centralized its landing/mockup palette, and rebuilt the hero wallet mock from
  the approved production header, account, portfolio, action, tab, and asset-row
  composition while retaining the site's product-story 3D depth.
- 2026-07-12: added handle-only account reordering to the full-screen account
  picker with pointer, touch, and keyboard support, a restrained lifted-row
  state, inline persistence failure recovery, and canonical ordering shared by
  dapp connection requests. Search results remain selection-only so filtered
  reordering cannot produce surprising placement.
- 2026-07-13: rebuilt transaction review around the Warm Midnight decision
  path: dapp-identified outcome, quieter estimated asset movement, a
  sentence-case request ledger, and shadowless advanced technical surfaces.
  Amber now appears as a small identity cue and on the final Confirm commitment;
  transactional blue remains reserved for focus, links, selection, and ordinary
  controls.
- 2026-07-13: made the final single-transaction Confirm action an explicit
  Warm Midnight amber `brand` exception in the component, button recipe,
  `DESIGN.md`, `_docs/STYLING.md`, and `_docs/WARM_MIDNIGHT.md` after the older
  blue-confirmation policy repeatedly caused regressions.
- 2026-07-13: established the extension renderer's feature-domain contract,
  compatibility-facade migration pattern, effect/model boundaries, audit maps,
  and ratcheting source-size tests without changing the approved visual system.
- 2026-07-14: replaced the unlock screen's warning-like pending-request banner
  with a lifted graphite notice below the header that mirrors the homepage
  banner's horizontal icon/label/chevron rhythm while keeping the mascot,
  credential prompt, and Unlock action dominant.
