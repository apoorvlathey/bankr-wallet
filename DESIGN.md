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
- References: established EVM information hierarchy and full-screen mobile
  flows; WalletChan's Swiss Knife project for restrained Chakra composition;
  shadcn/ui for semantic recipes and complete state discipline. Transpose
  behavior and restraint, not default visuals.
- Avoid: violet-forward web3 styling, thick outlines around every region, card-in-card stacks, desktop dropdowns squeezed into the popup.
- Mode: both. Midnight is the default and receives the restrained product language; Bauhaus remains an intentionally expressive alternate theme.
- Density: balanced on root screens, dense but zoned on transaction details.
- Constraints: React 18, Chakra UI 2, browser popup/window/sidepanel, WCAG 2.2 AA, no wallet logic or storage changes during visual phases.

## Aesthetic

- Direction: Warm Midnight, a precise financial dark interface made unmistakably WalletChan through its pixel mascot, condensed wordmark, and selective amber warmth.
- Defining trait: structure comes from proximity, alignment, surface lightness, and hairline rules instead of repeated bordered cards.
- Signature move: the Mascot Spotlight. WalletChan appears at product-entry, onboarding, empty, and reassurance moments; amber marks brand commitment actions and final transaction or batch Confirm decisions, while financial blue remains the focus, link, selection, and ordinary interaction color. Financial gain/loss keeps semantic green/red.

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
- Responsive: mobile-first. Popup 360x600, window 480x720, sidepanel 420x760,
  and short browser-window side panels are first-class viewports. Surface
  identity is independent of height; the shell fills the available viewport
  and one inner region owns vertical scrolling.
- Full-page onboarding uses a persistent 280px progress rail at desktop widths
  with three stages: Choose account, Add details, and Secure wallet. It starts
  directly at account choice; compact widths collapse the rail into the shared
  horizontal progress treatment while preserving the same step model.

## Components and states

- Button hierarchy: one filled primary, neutral secondary, quiet tertiary. Saved-state commitments (`Save`, `Save changes`, and equivalent labels) and final commitment actions use the amber `brand` treatment rather than blue `primary`. Destructive red is loud only inside a destructive confirmation.
- Seed phrase setup uses amber for Continue actions that advance recovery
  material into account creation, including imported phrases.
- Seed address selection is a commitment exception to ordinary blue selection:
  selected import/derive checkmarks and their final action use semantic amber.
- States: default, hover, pressed, focus-visible, disabled, loading, invalid/error, and selected where applicable. Weight never changes between states.
- Inputs: visible labels, 44px minimum touch height, 16px input text, inline corrective errors, retained values.
- Secret-backup acknowledgments sit at the trailing edge of their warning
  action region, centered directly above the final button, and use amber only for the
  checked commitment state. The checkbox is the acknowledgment and does not
  require a separate reveal or copy action. Generated recovery phrases begin
  concealed so revealing the secret remains deliberate. Backup action regions
  use a compact 32px acknowledgment row and an 8px relationship gap.
- Checkboxes that enable a durable capability or developer-only RPC behavior
  use the shared `commitment` variant: WalletChan amber for the checked state,
  never the ordinary blue interaction color. Their complete explanatory row
  is the native checkbox label and hit target; do not make users aim only at
  the checkbox glyph.
- Generated recovery-phrase setup follows the trust sequence: show and save the
  secret first, then collect optional group and first-account labels. Helper
  copy beneath generated and imported account labels explains their
  relationship to derivation #0.
- Lists and financial data: light row separators, aligned columns, tabular numerals, no heavy cell grid.
- Overlays: popovers for small contextual choices; action sheets for 2 to 6 choices; full screens for search, selection, configuration, and transaction detail; dialogs only for blocking decisions.
- Progressive disclosures that reveal content below the current viewport use
  `InlineDisclosure autoScrollOnOpen`. On expansion, the disclosure scrolls to
  the top of its scroll owner after layout settles, uses smooth movement by
  default, respects reduced-motion preferences, and never scrolls on collapse.
  Nested disclosures follow the same rule independently.
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
- Network marks may opt into registry-owned light and dark contrast surfaces when their source colors lose legibility; registered testnets inherit the parent mark's complete treatment. Midnight-specific surfaces preserve mark contrast instead of reusing bright light-theme chips.

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

- 2026-07-22 Home-v2 batch-preview audit: replaced the legacy blue-banner
  transaction mockup with the current Warm Midnight batch decision path:
  requester identity, estimated changes, request details, signer/fee context,
  and one amber final commitment. The marketing-only 3D treatment remains on
  meaningful section layers and call rows, while the represented wallet UI
  keeps restrained neutral surfaces and semantic asset colors. Timeout/retry
  feedback is intentionally excluded from the canonical product preview.
  Result: pass.

- 2026-07-22 Unshield recipient-account audit: added one established 44px
  header action to the full-screen address chooser, using the existing semantic
  icon-button and theme-token treatment. The action appears only in Unshield,
  reuses the existing Add account flow, preserves the withdrawal draft on Back,
  and returns with the newly added address selected and scrolled into view once.
  The reveal uses minimal smooth movement and becomes instant under reduced
  motion. Result: pass.

- 2026-07-21 Privacy Pools Explorer audit: the internal admin diagnostic uses
  the established Bauhaus website tokens and one four-stage verification path
  rather than generic metric cards. Transaction input and network selection
  remain one labeled control group, all status steps pair color with explicit
  icons and text, hashes use the shared mono face, times and amounts use
  tabular numerals, and refresh is a distinct secondary action. Loading,
  invalid, pending, declined, confirmed, and upstream-error states preserve
  the submitted input. Recognized Etherscan URLs infer their network and begin
  verification immediately, while raw hashes retain an explicit submit step.
  Confirmed results foreground the elapsed shield-to-root compliance duration
  instead of the root publication's age relative to the current clock.
  Event timestamps use the viewer's local timezone, pair the absolute time with
  a live relative age, and refresh that relative age once per second.
  Controls meet the 44px preferred target and expose
  visible focus treatment. The page introduces no gradients, glass effects,
  rounded card stacks, decorative motion, or new design tokens.

- 2026-07-20 Safe integration audit: Safe account setup, authority state,
  pending approvals, execution review, and terminal Activity reuse WalletChan's
  existing Warm Midnight hierarchy instead of introducing a parallel visual
  system. The request flow keeps nonce/order constraints, owner identity,
  simulation bypass, and execution state explicit at popup width. Detailed
  product and security decisions live in `_docs/SAFE_ACCOUNTS.md` and
  `_docs/SAFE_ACCOUNTS_PRD.md`.
- 2026-07-20 in-wallet staking audit: replaced More's external Stake link with
  a focused Warm Midnight decision path. The screen keeps staked sWCHAN and
  claimable WETH in one thin shared surface, places the Stake/Unstake selector
  before the reused amber amount slider, and makes the seven-day weighted
  timelock or current early-withdrawal fee visible before review. Approval
  batching is explained in concise, account-specific copy; the final review
  uses the existing amber commitment, gas, chain, smart-account, and Ledger
  patterns. View-only state is explicit and non-signing. All controls retain
  visible labels, tab semantics, 44px primary targets, token-driven colors,
  tabular/monospace amounts, and a single scroll owner. Result: pass.
- 2026-07-20 portfolio-options audit: moved the high-frequency refresh action
  beside the balance privacy control as a named, compact 32px icon target and
  reserved the action sheet for durable portfolio choices. Refresh performs one
  520ms amber rotation per press, returns to the normal secondary foreground on
  completion, and suppresses rotation for reduced-motion users.
  Added a checkmarked,
  instant-apply Follow dapp network preference directly beneath Unify Balances;
  it uses the existing row, separator, focus, selected-indicator, and theme-token
  grammar without adding a nested surface or color-only state.
- 2026-07-20 pending-replacement audit: placed Cancel and Speed Up as one
  centered pair of natural-width, 32px controls immediately below pending
  status. Cancel uses the quiet outlined danger recipe and Speed Up the shared
  amber brand commitment; both defer commitment to the existing confirmation
  screen. The review keeps
  its nonce/content locked, gas editable, and explains the replacement in one
  token-driven notice without introducing a nested card or bespoke dialog.
- 2026-07-20 transaction-nonce row audit: moved the editable address nonce
  directly below Add to batch, removed redundant explanatory copy, and reduced
  its numeric field to a dense technical control while retaining its visible
  label, tabular numerals, validation, keyboard focus, and 24px-plus target.
- 2026-07-20 Send recipient-discovery audit: opening or clicking the recipient
  input now reveals its wallet and contact suggestions immediately. An empty
  query shows the complete ordered set in a bounded scrollable combobox, while
  typing keeps the existing relevance-ranked search and concise placeholder.
- 2026-07-20 home RPC-alert audit: collapsed the warning into a compact
  two-row status surface. The title and quiet compact dismissal action share
  the header; the affected-chain control and intentional two-line recovery
  guidance form one grouped context row beneath it. Multi-chain warnings show
  one chain plus a compact count so narrow popup layouts remain stable without
  stranding the chain pill or breaking guidance mid-sentence.
- 2026-07-20 manual add-token audit: the final Add token/Add back action now
  uses WalletChan amber in both enabled and disabled states, matching the
  screen's saved-state commitment while leaving blue reserved for focus and
  ordinary selection.
- 2026-07-20 add-network request audit: replaced the verbose generic action
  banner with the shared dapp favicon/domain identity followed by one compact
  proposed-network surface. The chain mark, name, and ID now establish the
  decision at a glance; RPC risk detail remains in the existing progressive
  disclosure, which scrolls into view when opened, and the final Add network
  commitment uses WalletChan amber. The disclosure stops after the editable
  technical fields instead of repeating the raw provider payload and origin.
- 2026-07-20 manual add-network audit: the settings entry now starts keyboard
  focus in the RPC URL field, matching the endpoint-first task sequence, and
  uses the same amber final commitment treatment as the dapp-request flow.
- 2026-07-19 Ledger onboarding audit: added the official monochrome Ledger
  lettermark directly after View-only in the existing first-account decision
  list, then reused the established device, derivation, and address-selection
  flow inside the three-stage onboarding shell. Hardware discovery remains a
  full-tab user gesture; the final account write stays behind the master-password
  commitment rather than introducing a competing setup pattern.
- 2026-07-19 Ledger setup identity audit: replaced the invented hardware glyph
  with Ledger's official press-kit wordmark and lettermark. The connected
  device now owns one quiet surface with one name and one text-plus-dot status,
  eliminating repeated identity and nested icon chrome. Derivation choices
  separate human labels from monospace paths for faster scanning, retain native
  radio semantics and focus behavior, and consume existing theme tokens only.
- 2026-07-22 private-deposit actions and remaining-balance audit: Private home
  uses a balanced three-column action rhythm for Shield, Unshield, and Deposits
  without duplicating the global Settings entry. Shield and Unshield retain
  amber transaction emphasis; Deposits inherits the secondary foreground in
  Midnight. Public exit rows keep the spendable remainder as the primary,
  tabular value and add one muted provenance line only after a partial
  withdrawal (`Originally … · … unshielded`). Audit score: 10/10 for the
  scoped change; no new color, radius, surface, shadow, motion, type style,
  nested card, or icon-only control was introduced, and selected/disabled/focus
  behavior remains owned by the existing quick-action and checkbox recipes.
- 2026-07-21 Unshield quote-expiry audit: a selected relay quote now refreshes
  itself once when its countdown ends, replacing the unnecessary recovery
  decision with a brief explicit “Refreshing quote…” state. Manual retry
  remains reserved for a real transport or validation failure. Audit score:
  10/10; hierarchy, focus behavior, reduced-motion treatment, surfaces, and
  financial disclosure remain unchanged.
- 2026-07-21 Unshield address-density audit: the receipt now uses the shared
  resolved address control as its single destination disclosure. Removing the
  duplicate raw-address line tightens the transfer outcome while preserving
  copy, explorer, contact, and full-address access inside the existing control.
  Audit score: 10/10; no behavior, color, surface, motion, or focus state changed.
- 2026-07-21 Unshield receipt-hierarchy audit: the full-screen detail now makes
  the private-debit to public-recipient transfer its first substantive region.
  Signed Shielded ETH and ETH values, restrained red/green semantics, matching
  USD equivalents, token marks, and the resolved recipient control establish
  the outcome before relay and protocol metadata. The lower
  summary retains method and exact fee disclosure without repeating the
  transfer. Meaning remains available through labels, signs, and the directional
  arrow independently of color. Audit score: 10/10; no new overlay, action,
  animation, nested card, or theme-specific literal was introduced.
- 2026-07-21 private-activity transaction continuity audit: successful relayed
  Unshield submission now moves directly to Private Activity, and an Unshield
  row pushes the same full-screen transaction-detail shell used by ordinary
  wallet transactions. The former modal and terminal Done state are removed.
  The detail screen reuses the established identity/status header, sectioned
  balance and transaction summaries, explorer affordance, live operation
  refresh, and back navigation. Completed withdrawals use the standard
  `Confirmed` copy; Shield deposits show a signed positive green amount because
  they add to private balance. Meaning remains explicit through signs, labels,
  and status icons rather than color alone. Audit score: 10/10; no new overlay,
  surface style, animation, or competing action hierarchy was introduced. The
  App frame and countdown are extracted into focused route/presentation files,
  keeping both renderer composition roots within their existing size budgets.
- 2026-07-21 relay-expiry hierarchy audit: the quote countdown now sits
  directly beneath the quoted relay fee, keeping the price and its validity
  window in one decision cluster before network, route, and relayer metadata.
  Its `m:ss` digits use the same restrained 220ms Number Flow motion as Shield
  compliance timing, with a descending trend and no layout movement. A stable
  timer label remains available to assistive technology without live-announcing
  every second. Audit score: 10/10; the change adds no surface, color, action,
  or competing hierarchy.
- 2026-07-21 withdrawal-method icon audit: the three Unshield routes now use
  one 20px, two-stroke Lucide family on the action sheet's existing 24px media
  rail. Radio tower identifies relay infrastructure, fuel identifies the gas
  payer, and shield-off identifies public ragequit. Labels and consequences
  remain the accessible source of meaning; the decorative marks add scan speed
  without adding color, badges, nested surfaces, or new interaction states.
  Audit score: 10/10; alignment, focus, selection, and 44px-plus targets remain
  owned by the shared action sheet.
- 2026-07-21 Private Assets scope audit: the Private tab now presents only the
  wallet-wide Shielded ETH asset. Selected-account native ETH is removed because
  Private mode has no active public-account identity or address context. The
  change removes a misleading row and its fetch path without introducing an
  empty state, replacement surface, color, motion, or control. Audit score:
  10/10; the remaining asset row, action sheet, tab order, and focus behavior
  are unchanged.
- 2026-07-21 global private-balance label audit: Private Home now names its
  wallet-wide total with the compact, non-wrapping `Private Balance` label and
  pairs it with one quiet, focusable information affordance. Hover and keyboard
  focus disclose, over two lines, that the Privacy Pools total is not tied to
  any single account. The tooltip uses a clean arrowless panel so its anchor
  cannot render as a detached diamond. The change reuses the existing 24px
  tooltip target, muted icon hierarchy, theme tokens, and focus ring without
  adding a surface, color, motion, or competing action. Audit score: 10/10;
  contrast, target size, keyboard access, and reading order are preserved.
- 2026-07-21 Private portfolio continuity audit: Private Home now follows the
  public portfolio's stale-while-refresh presentation contract. Returning from
  Shield or Unshield paints the last verified balance and bounded chart series
  in the first render, while transaction broadcasts, explicit operation
  refreshes, and pending-operation timers replace data in place. Initialization
  remains an independent action-readiness signal and no longer blanks known
  financial data. The change adds no color, surface, motion, control, or layout
  variation; it removes avoidable loading motion, preserves the existing empty
  and error states, and clears the renderer snapshot on wallet lock. Audit
  score: 10/10 for this state-only change; keyboard order, focus, target sizes,
  contrast, and reduced-motion behavior are unchanged.
- 2026-07-21 privacy transaction identity audit: post-submission Shield,
  Shield Recovery, and Public Exit details now use the same privacy mark and
  concise action naming as the Private Activity timeline. Internal persistence
  origins no longer appear as user-facing transaction titles, while the
  existing 36px identity geometry, status line, network context, focus rules,
  and detail spacing remain unchanged. The change adds no new token, surface,
  motion, or decorative asset and keeps identity color-independent through the
  icon-plus-label pairing.
- 2026-07-21 Unshield two-step audit: amount/address entry and quote evaluation
  are now separate decisions. The first screen keeps one Shielded ETH amount
  card, one direction marker, and one boxed `Receive at` control whose concise
  chooser reads `Address`; it no longer flashes receive output, relay state, or
  recovery alternatives while the user is still composing intent. The fresh
  review owns exact from/to amounts, destination, fee and percentage, relay,
  expiry, privacy warning, and final amber commitment. It does not repeat those
  values in a Financial impact block: the two-line relay fee leads a compact
  Request details list. Over-cap quotes turn that row semantic error red and
  place the account-led public exit in the sticky decision bar above Back and the amber
  retry action. Defined edges, tabular values, 44px controls, keyboard focus, and
  the 320px content rhythm remain intact; no token, icon language, decorative
  card, or unsupported transaction path was added. Audit score: 9/10 within the
  existing Warm Midnight system; the inherited product typography remains
  unchanged, and this pass adds no color literals, shadows, motion, or
  theme-specific branching.
- 2026-07-21 Private action audit: Private mode now exposes only the two
  protocol-backed v1 actions, Shield and Unshield. Removing the duplicate Send
  destination reduces decision noise and avoids implying an in-pool transfer
  that Privacy Pools v1 does not support. The two 88px action targets remain
  centered on a bounded 224px rail, preserving the established 44px-plus
  interaction geometry and Warm Midnight hierarchy at popup through sidepanel
  widths. The Shielded ETH action sheet mirrors the same contract with Shield,
  Unshield, and Activity only. Unshield retains the shared recipient controls,
  relay quote, review, and public-exit fallback. No new token, surface, icon,
  motion, or transaction path was introduced; the focused signal-to-noise,
  focus, target, color-independence, and one-primary-action gates pass.
- 2026-07-21 public-exit audit: the fallback is now a compact account-led row,
  not a second transaction card. Saved account name, resolved avatar, and
  deterministic blockie fallback establish the destination; one restrained
  `Review exit` action replaces the oversized account-switch/withdraw button,
  and a single icon-plus-text line owns the public-link consequence. Review is
  a separate defined-edge screen grouped by original account. Each group owns
  one identity header and a divided checkbox list of exact ragequittable
  deposits with tabular amount and date. Selecting one group disables the
  others until cleared, preventing an impossible mixed-depositor transaction.
  Checked whole commitments from that account share one atomic public exit,
  plus one concise warning and one final amber commitment. Multiple deposits
  begin unselected so WalletChan never silently chooses the first. The
  resulting privacy-ledger row remains in Private Activity because the action
  belongs to the Privacy Pools journey. The same real transaction also appears
  in the submitting account's Public Activity, matching the onchain-public
  consequence stated in review and details. The layout
  remains stable at 320px, uses no external-link metaphor, nested action card,
  duplicate address explanation, or arbitrary amount input that ragequit could
  not honor. Opening review has no proof, recovery-intent persistence, claim,
  or transaction side effect; this preserves the visual hierarchy's behavioral
  promise.
- 2026-07-21 private-relay fee warning audit: an over-cap relay quote now uses
  one concise outcome and a tabular two-column comparison between the quoted
  fee and the network maximum. The relay identity stays tertiary, while the
  existing public-exit row owns the alternative action instead of repeating it
  inside an alert paragraph. When that alternative first appears, the screen
  brings it into view once without moving keyboard focus; the movement is
  smooth normally and immediate when reduced motion is requested. The compact
  error state keeps one defined edge,
  semantic red plus text labels, and a stable 320px layout without adding a
  badge, nested card, or second call to action.
- 2026-07-20 Shield amount/re-entry audit: Shield now matches Send's compact
  in-field denomination pattern: ETH entry shows the converted dollar value at
  the trailing edge, and that same 44px keyboard-operable control switches to
  explicit dollar entry while showing ETH as the inverse value. No new token,
  detached mode control, picker, or decorative surface was introduced. The
  canonical amount remains wei-bound. Recoverable form/operation errors keep
  the entered value and move to one untruncated, color-independent alert below
  the route metadata, preserving source balance legibility. The balance slider
  reflects syntactically valid sub-minimum amounts independently of policy
  validation, so corrective copy never resets the user's chosen position.
  Returning from the normal transaction review resumes the exact pending
  commitment instead of
  making the primary Shield action appear to fail, even when Back wins the race
  against the storage-change event. Forward transitions release focus before
  the outgoing layer becomes inert, eliminating hidden-focused-descendant ARIA
  conflicts without changing visual motion. The focused audit passes
  visible label, focus, 44px target, retained-input error, one-primary-action,
  defined-edge, compact financial hierarchy, and no-decorative-motion gates.
- 2026-07-20 Shield fee-on-top audit: the amount field now names the exact ETH
  that becomes Shielded ETH. Protocol math gross-ups that value in wei, so the
  minimum remains the memorable `0.01 ETH` mainnet output instead of exposing
  a fee-adjusted input threshold. The existing transaction review labels the
  chosen amount, the 0.5% fee added on top, and the total wallet debit. Max
  accounts for both gas and the fee; Max/100% also consumes the final one wei
  at protocol fee-rounding boundaries. No new picker, panel, token, or decorative
  treatment was introduced; the focused audit passes retained-input,
  plain-language, tabular-number, one-primary-action, and color-independent
  error gates.
- 2026-07-20 Privacy action consistency audit: Unshield keeps one route identity
  from page title through recipient selection, review, loading, failure, and
  final commitment. It begins with an empty recipient; `Receive at` replaces
  the awkward `Receive in`; outcome and
  public-withdrawal verbs no longer drift between surfaces. With no ready
  Shielded ETH, the amber action retains the current route's review label and
  stays disabled beside the existing text explanation instead of unexpectedly
  navigating to Shield. A pure route-copy model and explicit empty preview
  states enforce the contract without adding a new token, surface, or control.
  The focused audit passes the one-primary-action, plain-language, 44px target,
  color-independent state, defined-edge, and no-decorative-motion gates.
- 2026-07-20 public/private wallet-mode audit: one compact two-state control
  at the right edge of the balance heading separates the account-scoped public wallet from the
  wallet-wide Privacy Pools identity. Both selected modes use the existing
  amber intent token inside a tooltip-free 28px control on the normal Warm Midnight base
  canvas—no full-width gray rail, tinted page, gradient, glow, glass effect,
  oversized mode title, or decorative privacy claim. Private reuses the exact
  public quick-action anatomy for Shield and Unshield. The vertical down
  arrow makes Unshield distinct without adding a new icon family. Its headline and chart include
  only ASP-cleared Shielded ETH, while one small amber value exposes processing
  ETH still awaiting compliance. The account selector, Positions, public
  assets, and public Activity are absent rather than dimmed, and public contains
  no Shielded ETH pseudo-asset.
- 2026-07-20 Settings icon-state audit: Midnight list rows again derive their
  default hover glyph from each row's semantic accent tile, while an optional
  dark resting override remains independent. Explicit Privacy Pools amber
  hover and destructive red overrides are preserved, so every row has a
  visible, intentional hover state instead of inheriting a near-black
  foreground.
- 2026-07-20 Privacy Pools recovery icon audit: the Settings entry reuses the
  detective-style privacy mark from Home. Its main Settings row stays neutral
  at rest and turns amber on hover like its peers, while the two recovery-menu
  actions retain their semantic amber foreground at rest and on hover.
- 2026-07-20 Privacy Pools recovery menu audit: the submenu now uses the same
  16px/14px list-row hierarchy as the rest of Settings, removes its duplicate
  in-body heading, and names Privacy Pools directly with concise recovery copy.
- 2026-07-20 Shield recovery audit: Settings now starts with two plain choices
  instead of mixing backup and network maintenance. Backup uses one amber
  commitment action and conceals the phrase by default. Replacement separates
  balance-at-risk, two explicit acknowledgements, and phrase entry into a short
  irreversible-action sequence without introducing a modal or a second primary
  action.
- 2026-07-20 Shield status polish: Activity and transaction details now reuse
  the same amber privacy mark and durable four-stage lifecycle projection.
  Unshield remains a literal inverse of Shield in every state: Shielded ETH is
  always the source and Sepolia ETH the outcome. When only ragequit funds are
  available, the same cards show the fixed public-exit amount and original
  depositor, followed by one review action instead of an empty-state card plus
  a second warning card. That review resolves the exact whole deposit before it
  shows one unchecked public-link control and one sticky final action. While a
  private withdrawal remains primary, the fallback is an account-led row with
  the same review destination rather than an oversized alternate CTA. The
  320px/360px audit
  scores 10/10: one primary action, defined-edge surfaces without resting
  shadows, 44px-plus core targets, visible text/icon disclosure independent of
  color, and no nested cards, gradients, glow, glass, or decorative motion.
  Slider drag updates the visible source amount immediately while remaining
  renderer-local until release; the last verified balance and quote geometry
  stay visible through refreshes. The result preserves WalletChan's short
  decision path, tabular financial values,
  color-independent labels, and single-action hierarchy without new tokens.
- 2026-07-20 Shielded ETH integration audit: Shield uses the established
  Swap form grammar—fixed Sepolia ETH/Shielded ETH cards, one
  percentage slider, and one sticky commitment action—without copying the
  reference product's oversized typography or purple branding. The permanent
  Private Assets row carries the same icon, confirmed balance,
  available/pending hierarchy, and Sepolia test identity without entering any
  public account total or picker. Private home and the asset action sheet route
  directly to separate Shield and Unshield screens or Private Activity; no
  conversion screen repeats those modes as tabs. Unshield reuses WalletChan's
  recipient controls and concise confirmation regions with a normal button
  press; it adds no hold gesture, password surface, biometric prompt, parallel
  activity feed, selector, marketing card, or privacy overclaim.
- 2026-07-20 public-withdrawal cancellation audit: rejecting WalletChan's own
  confirmation prompt creates no failed Activity card. The encrypted recovery
  record remains an internal cleanup/dedupe concern; genuine proof,
  submission, revert, and recovery outcomes remain visible.
- 2026-07-20 Private Activity Shield audit: Shield deposits reuse the established
  transaction row and detail navigation instead of introducing a parallel card
  type. `Shield ETH`, the signed amount, plain-language lifecycle context, and
  `Step n of 4` form one compact hierarchy; blue, amber, green, and error tones
  remain semantic and always pair with text/spinner/icon states. The row stays
  fully clickable and keyboard focusable while its separate explorer action
  remains valid nested-interaction-free markup. Private tab state now survives
  Shield-screen and confirmation remounts, and successful deposit/recovery
  confirmations select Activity. Recovery and deposit rows share the same
  privacy mark, while the generic confirmation title contracts to `Shield Recovery`.
- 2026-07-20 Shield balance-value audit: the primary amount and ETH unit are
  one non-wrapping financial value, with its live USD equivalent directly
  beneath as subordinate context. ASP status remains a separate right-aligned
  amber value, preserving the confirmed-total versus pending-subset hierarchy
  without adding another card, badge, icon, or decorative treatment.
- 2026-07-20 Shield confirmed-balance audit: the dominant metric now means
  funds confirmed in the pinned pool rather than only ASP-approved funds. One
  right-aligned amber text value identifies the exact subset still awaiting the
  ASP check, with the explanation available on hover and keyboard focus. It
  adds no card, icon, guessed countdown, or second progress visualization;
  amount and status text keep meaning independent of color. Activity refreshes
  in place after receipt events and uses a restrained background cadence.
- 2026-07-19 fee-token confirmation audit: single and ERC-5792 confirmation
  reuse one compact `Pay gas with` decision row and the existing bottom action
  sheet for the native/catalog-token choice. Selection stays financial blue, final
  Confirm stays amber, quote/balance values use the existing compact numeric
  hierarchy, and the one-time smart-account upgrade uses the semantic warning
  tint. Relay mechanics remain subordinate footer copy; no promotional banner,
  gradient, card stack, or desktop dropdown was introduced.
- 2026-07-19 Shield dashboard audit: first use now reads like a wallet balance,
  not protocol onboarding. One private-balance surface leads directly to
  Shield and Unshield, followed only by activity. Healthy automatic recovery
  and explanatory protocol copy stay out of the interface. Initialization is
  silent when healthy and uses only the existing action-status line plus Retry
  when attention is required; the fixture badge and action feedback keep this
  build from looking live. Both themes pass the
  compact viewport and accessibility gates without extra setup pages.
- 2026-07-19 request-origin identity audit: WalletChan Browser's enabled state
  now gates ENS-friendly rewriting across every request surface. With browsing
  disabled, the literal gateway hostname remains the primary security identity
  and its exact-page Chrome favicon occupies the existing mark slot; no new
  visual treatment or competing label was introduced. Public `.eth.limo` and
  `.eth.link` connection prompts still retain the subordinate contenthash-age
  provenance pill because it describes the literal site's deployed content.
- 2026-07-19 ENS connection provenance audit: exact `.eth.limo`, `.eth.link`,
  and configured local/custom IPFS gateway connection requests gain one quiet
  status pill beneath the recovered ENS identity. The pill uses existing
  semantic surface, border, foreground, radius, and tabular-number tokens; it
  remains secondary to the hostname and preserves its position through quiet
  checking, resolved, and unavailable states.
- 2026-07-19 browse-page bookmark audit: a quiet upper-right reminder exposes
  the platform-native bookmark shortcut without presenting a nonfunctional
  bookmark button or requesting broad browser bookmark access. It is fixed to
  the viewport corner, while hover/focus reveals a quiet close action that
  persists a non-secret dismissal preference. Its single amber star stays
  subordinate to the resolver's primary action, and the compact keycap remains
  legible on the Warm Midnight surface at narrow widths.
- 2026-07-19 connected-dapp overflow audit: the browse page keeps a narrow,
  token-colored custom scrollbar visible whenever the three-row connected grid
  overflows, bypassing OS overlay-scrollbar fading while preserving native
  wheel, touch, trackpad, and keyboard scrolling.
- 2026-07-19 favorite-dapp ordering audit: the browse launcher now gives each
  favorite a restrained hover/focus drag grip instead of making the open card
  itself ambiguous. Mouse, delayed touch, and keyboard sorting share the same
  grid behavior, while previous/next controls provide a no-drag pointer path.
  Drag state uses opacity and transform only, reduced motion is honored,
  failures are announced in text, and the saved order synchronizes through the
  existing bookmark subscription.
- 2026-07-18 dapp3 browser audit: replaced the standalone launcher's legacy
  emerald palette with canonical Warm Midnight surfaces, restrained amber
  brand/action emphasis, blue keyboard focus, and relationship-based spacing.
  Favorite and recent dapp tiles now use the same defined-edge graphite
  elevation language as the extension, with 4/3/2-column responsive layouts;
  recent resolver tiles expose the same keyboard-accessible hover favorite
  action and move into the favorite-first grid immediately after saving;
  connected HTTP(S) dapps use that same grammar beneath the favorite-first
  discovery list, with a bounded three-row scroll region and quiet hover/focus
  management actions.
  The resolver retains one primary action, native controls, a visible field
  label, text-linked validation, 24px-minimum targets, and reduced-motion-safe
  feedback. No wallet behavior or resolver flow changed.
- 2026-07-18 dapp3 icon audit: image-backed dapp marks now share the extension
  Connected-dapps treatment: a neutral light canvas and subtle neutral edge
  preserve transparent and dark artwork. Amber remains reserved for the
  letter fallback when no safe raster is available.
- 2026-07-18 smart-account audit: delegation settings now lead with current
  state and one contract choice, keep revoke beside that state, and hide
  clipboard, explorer, and contact actions behind the shared address overflow.
  Delegation confirmation omits the empty asset-change section and summarizes
  the outcome, reversibility, and target contract without stacked technical
  explanations. Its resolved contract label shares the row heading, while the
  address uses the shared measured middle truncation and keeps actions pinned
  to the trailing edge.
- 2026-07-18 transaction loading-state audit: transaction review no longer
  prints a generic "Confirm unavailable" sentence while gas controls hydrate.
  The disabled action carries the temporary state; explicit transaction errors
  and multi-step gas progress remain visible where they are actionable.
- 2026-07-18 account-removal audit: removing the final account in a seed group
  now names both destructive outcomes in the dialog title, warning, final
  confirmation, action label, and success feedback. The warning pairs semantic
  red with explicit text, retains the native dialog focus model, and keeps the
  safer Cancel action available at both steps.
- 2026-07-18 view-only signing audit: transaction, batch, signature, and
  ERC-7715 prompts share one compact amber warning in the sticky decision bar,
  immediately above the reject-only action; the scrollable request content no
  longer repeats account capability state.
- 2026-07-19 Ledger signing-wait audit: hardware approval remains on the full
  request review instead of jumping early to Activity. The shared sticky amber
  notice now carries the official Ledger mark on its black brand tile, one
  direct instruction, and a dark circular progress cue. The commitment action
  uses the shared dark-to-muted three-dot loader with `Waiting`, the
  broadcast-only submitting banner stays hidden, and request-mutating controls
  retain their layout while becoming unavailable until the device resolves.
  Back remains active because it navigates without mutating or cancelling the
  hardware request.
- 2026-07-18 Swap/Bridge audit: rebuilt the wallet-sized form around one compact
  pay/receive intent module; combined token and network identity instead of
  exposing separate selectors; reused Send's 24px-target amber rounded-square
  balance slider; prioritized balance-heavy chains, popular assets, and wallet
  holdings in the picker; and reduced the resting quote to route status,
  slippage, and minimum received. Custom slippage, fee breakdowns, routing,
  price-impact warnings, and view-only restrictions remain available without
  competing with the primary decision. The sticky review commitment is amber.
- 2026-07-17 Send audit: removed the competing Swap detour so the screen reads
  as one decision path; promoted the amount without overpowering the asset and
  recipient context; reduced the slider's visible knob while preserving its
  24px interaction target; reserved amber for the active percentage and final
  Review send commitment; and separated optional calldata with one hairline
  rather than another card. Visible labels remain programmatically associated
  with both inputs, the amount field exposes a decimal keyboard, and manual
  entry/MAX remain non-drag alternatives to the slider.
- 2026-07-17 generated-seed flow audit: recovery comes before customization,
  recovery begins concealed, backup acknowledgment sits adjacent to Continue,
  optional names are grouped by proximity, and the first-account helper text
  removes ambiguity without adding another decision.
- 2026-07-17 generated-private-key acknowledgment audit: the native checkbox
  remains keyboard-operable and visibly focused, aligns to the action edge,
  and uses semantic amber tokens for its checked state without introducing a
  second prerequisite interaction.
- 2026-07-17 saved-state commitment audit: all extension actions labeled `Save`,
  `Save changes`, `Save contact`, or an equivalent saved-state action use the
  shared amber `brand` button variant. This includes Bankr credential changes,
  account and seed-group names, custom-token metadata, ENS gateway settings,
  custom-network overrides, contacts, and RPC endpoints; blue `primary` remains
  reserved for ordinary interaction and transactional controls.
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
- 2026-07-14 transaction-request audit: passes the focused mobile-finance
  hierarchy, defined-edge surface rule, color-independent signed asset deltas,
  44px decision targets, keyboard-visible fee disclosure, compact reflow, and
  both-theme popup/sidepanel review. The fee popover retains signer and decision
  visibility; automated preview accessibility passed for every wallet fixture.
- 2026-07-14 transaction-request hierarchy refinement: passes after removing
  duplicate request/action labels, centering the dapp identity, qualifying the
  simulation heading with an accessible estimate disclaimer and chain badge,
  and moving force inclusion into progressive disclosure. The requested
  centered dapp mark is a deliberate trust-context identity moment rather than
  a reusable icon-above-heading card pattern.
- 2026-07-14 advanced-details audit: passes with one defined-edge owner,
  separator-led technical rows, sentence-case labels, visible disabled reasons,
  native disclosure/switch/button semantics, and no nested resting shadows.
- 2026-07-14 fee-selector audit: passes after separating ordinary speed choice
  from expert gas editing. One-line, 42px native buttons retain visible focus,
  explicit selected state, text labels, and tabular fiat estimates; raw gas
  diagnostics appear only when Custom makes them actionable.
- 2026-07-17 transaction-details metadata audit: passes after replacing the
  receipt table with identity and gas-fee pills plus a quiet closing timestamp.
  The existing status-line explorer action remains the single transaction-hash
  affordance, while sequential-call context remains visible without key/value
  rows or a nested card. The gas pill leads with fiat, retains a bigint-exact
  three-significant-digit native subtitle and full-precision tooltip, and sits
  opposite the signer with comfortable inset padding; the centered closing
  timestamp is deliberately low-opacity.
- 2026-07-17 request-identity alignment audit: requesting hostnames remain
  geometrically centered at rest and on interaction; the external-link cue is
  overlaid beside the label so its hover/focus reveal causes no layout shift.
- 2026-07-17 transaction-impact proximity audit: confirmed ERC-20 symbols and
  their `to` / `from` counterparties now read as one compact identity group.
  Tightened line boxes remove the apparent blank row without shrinking the
  counterparty explorer action below its 24px accessible target.
- 2026-07-17 short-height surface audit: passes the mobile shell contract with
  height-independent side-panel identity, pre-paint dynamic viewport sizing,
  an explicit zero-min-height flex chain, and one bounded vertical scroll
  owner. No palette, typography, target, focus, or motion behavior changed.
- 2026-07-14 force-inclusion route audit: passes with a text-first destination
  and L1 path, paired chain identities, no new interactive target, and no
  reliance on icon color to communicate the execution route.
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
- 2026-07-14 custom-gas editor audit: passes with a modular full-width field
  grid, equal Priority/Base columns, right-aligned tabular values and units,
  associated visible labels, an informational linked-Auto tooltip, and a
  reduced-motion-safe animated Edit affordance inside the Max fee field. Popup,
  compact, both-theme, private-key, and seed-phrase previews have no editor
  overflow or editor-specific axe violations. The read-only Base fee input
  explains on hover or focus that its value is determined by the network.
- 2026-07-14 batch-request audit: passes after adopting the single-transaction
  decision path: shared centered dapp identity, top queue controls, one chain-
  qualified Estimated changes heading, one defined-edge simulation surface,
  progressive request/advanced details, and a sticky pinned-signer/gas summary.
  Request details now owns one ordered call list. Descriptor-backed clear
  signing stays fully visible as the primary decision surface. ERC-20 approvals
  keep their concise amount/token/spender summary until the user expands the
  editable approval view; raw addresses, decoded calldata, and digests remain
  secondary disclosures. A compact, unboxed “Batch overview” row sits beneath the
  section heading once every call has a meaningful label, connecting the muted
  context label to an action equation such as “Approve + Swap”; amber is
  reserved for the equation separators so the names remain the scanning focus;
  force inclusion stays last in advanced options, and all three wallet types
  retain their existing execution paths. Superseded origin/from/network,
  descriptor-only, and duplicate native-value summaries were removed rather
  than hidden behind the new composition. Midnight call numbers use one neutral
  graphite treatment instead of rotating blue accents. Destructive removal is
  available from a hover/focus overflow menu rather than occupying every call
  header, leaving calldata metadata aligned at the trailing edge. The neutral
  Midnight badge surface retains a small WalletChan signature through amber
  numerals rather than filling the entire marker with accent color. For matched
  clear signing, each call header promotes the resolved action name while the
  embedded body omits its duplicate intent and “via” attribution, leaving the
  human-readable fields as the primary detail content.
- 2026-07-15 ERC-7715 permission-request audit: passes with the shared request
  identity and queue controls, plain-language reusable-authority warning,
  chain-qualified limits, one delegate/reason surface, labeled address tools,
  scroll-aware technical disclosure, 44px decision targets, and a pinned signer
  plus amber Grant permission commitment. Permission variants retain editable
  allowance, recurrence, stream, expiry, and approval-cleanup semantics without
  duplicating origin, signer, chain, or raw caveat data in the primary path.
- 2026-07-16 shared contact-list audit: passes the Warm Midnight defined-edge
  list grammar without adding a competing surface or visual language. Identity
  selection, edit, delete, and handle sorting use separate native buttons with
  visible focus and named icon targets; selected state remains color-independent
  through the existing inset edge. Keyboard sorting and filtered-state disabled
  copy are preserved across More and Send.
- 2026-07-16 contact-editor commitment audit: `Save contact` now uses the
  established amber brand variant in both Add and Edit modes. Cancel remains
  secondary, field focus remains blue, and the shared button recipe preserves
  native submission, loading, disabled, hover, active, and focus states.
- 2026-07-16 address-pill audit: batch-call targets now use the shared
  labeled-address pill and its contact action. Add contact seeds its label from
  the pill's current wallet, public-name, or API identity without treating the
  suggestion as an existing contact; raw address fallbacks stay empty.
- 2026-07-16 Send contact-add audit: passes with one named 32px native icon
  action aligned to the Contacts heading, using the established picker-group
  hierarchy and shared modal. The group remains visible with a text empty state,
  so Add is not hidden behind the presence of existing data.
- 2026-07-16 Send contact-hover audit: selectable contact rows now use the
  established raised-surface hover token across the full static row container.
  Selection remains a native identity button and Edit/Delete/Reorder remain
  separate native controls, avoiding invalid nested interaction.
- 2026-07-16 Send recipient-copy audit: the input now summarizes accepted
  identity categories as “0x, contacts, .eth, .gwei”. The accessible name
  retains the fuller input purpose while the existing resolver support remains
  unchanged.
- 2026-07-16 Activity-ledger audit: passes the mobile financial-list grammar
  with one defined-edge owner, relationship-based date markers, shared Assets
  row spacing, left-aligned identity and intent, right-aligned tabular values,
  signed and color-independent outgoing amounts, icon-plus-text statuses, and
  native row-button semantics. Direct explorer controls own the first line's
  trailing edge while status and time own the second; bridge source and
  destination controls retain their chain marks without nesting interactions.
  Both themes and all supported signing wallet fixtures passed compact through
  sidepanel review without overflow; automated Activity accessibility reported
  no violations.
- 2026-07-16 Transaction-detail audit: passes as the post-submission half of
  the request-review system. The screen establishes requesting identity and a
  color-independent state first, then actual signed asset movement, readable
  clear-signed intent, one receipt ledger for signer, fee, time, hash, and copy,
  plus a chain-adjacent explorer action. Bridge source/destination legs retain
  their chain-marked links;
  failure remains adjacent to status; raw addresses, calldata, deploy data, and
  gas share one native advanced disclosure. Defined edges replace nested card
  shadows, current address identities flow through shared controls, and preview
  fixtures bind Bankr, private-key, and seed-phrase accounts to the real record.
  ERC-7730 fields remain inside the rounded summary owner instead of becoming a
  detached description card. The primary explorer action sits beside the
  status-line chain; force-inclusion explorer actions sit beside their terminal
  L1/L2 statuses, while the receipt retains the transaction hash and copy action.
- 2026-07-16 Transaction-detail refinement: kept the requesting hostname's
  resting color while making it a focusable website action with a gently
  revealed link signifier; removed duplicate chain context above actual
  changes; matched request-review token scale and contract disclosure; aligned
  counterparty metadata; preserved 1-99,999 wei and other tiny non-zero values;
  vertically centered custom clear-signing intent; and used the scarce amber
  accent for the batch-call count.
- 2026-07-16 Transaction-detail variant audit: same-chain swaps, EIP-7702
  delegation set/revoke, ERC-7715 revoke, atomic and sequential batches, force
  inclusion, bridge pending/refund, broadcast uncertainty, contract deployment,
  and undecoded legacy calls now resolve into explicit receipt states. Generic
  fallbacks remain truthful and disclose Advanced details by default; known
  intent stays compact. Deterministic preview scenarios cover the full matrix.

## Changelog

- 2026-07-20: brought WCHAN stake, unstake, WETH claim, penalty disclosure,
  amount slider, and atomic/sequential review into the Warm Midnight extension.
- 2026-07-20: made pending-detail and replacement Back/Reject navigation return
  to Activity, with latest-trigger precedence preventing a stale Assets reset.
- 2026-07-20: vertically centered context-free cancellation Activity titles
  with the WalletChan mark while retaining status metadata on the lower track.
- 2026-07-20: compacted pending-transaction Cancel and Speed Up into a centered
  utility pair and moved Speed Up from blue to the shared amber brand treatment.
- 2026-07-20: added pending local/Ledger Cancel and Speed Up review flows using
  the existing transaction confirmation, compact locked nonce, and editable
  replacement-fee controls.
- 2026-07-20: tightened the transaction-review nonce into one compact labeled
  row immediately below Add to batch.
- 2026-07-20: aligned the manual add-token screen's final save action with the
  shared amber commitment treatment.
- 2026-07-19: moved Ledger setup into a dedicated full extension tab, closes
  an originating side panel after launch, and replaced the generic hardware
  glyph with official local Ledger SVG assets plus a compact connected-device
  and derivation-path presentation.

- 2026-07-22: completed the Private home action row with direct Deposits
  navigation and no duplicate Settings shortcut. Its secondary-gray Midnight
  icon keeps navigation distinct from Shield and Unshield. Public exit rows
  now disclose remaining, original, and already-unshielded amounts for
  partially consumed deposits.
- 2026-07-21: made Unshield relay quotes refresh automatically at expiry, with
  one scheduled request per quote and a non-interactive refreshing transition
  instead of a manual Refresh quote button.
- 2026-07-21: removed the duplicate raw address beneath Unshield's recipient
  label; the shared address control remains the single copy, explorer, contact,
  and full-address disclosure surface.
- 2026-07-21: redesigned Unshield transaction details around a receipt-style
  private-balance to recipient transfer, including the receiver's resolved
  identity, signed ETH values, and USD equivalents. Relay or
  receiver-paid fee metadata now follows in the quieter transaction summary.
- 2026-07-21: routed successful Unshield submissions to Private Activity,
  replaced Unshield's detail modal with the shared full-screen transaction
  pattern, standardized its terminal status as Confirmed, and treated Shield
  deposits as positive private-balance activity.
- 2026-07-21: moved the Unshield quote-expiry countdown directly beneath the
  quoted relay fee and animated its `m:ss` digits with the established Number
  Flow timing used by Shield compliance details.
- 2026-07-21: added Lucide-derived radio-tower, fuel, and shield-off icons to
  the Private relay, Receiver pays gas, and Public withdraw method rows.
- 2026-07-21: promoted over-limit private-relay quotes from amber warnings to
  semantic red error rows. The exact contract maximum remains in text, so the
  blocked onchain path is clear independently of color.
- 2026-07-21: removed selected-account native ETH from Private Assets and
  removed the active-address prop/fetch path from Private Home. The tab now
  contains only wallet-wide Shielded ETH.
- 2026-07-21: simplified the private portfolio label to a non-wrapping `Private
  Balance`. Its two-line hover/focus help clarifies that the Privacy Pools total
  is not tied to any single account, and the arrowless tooltip avoids a detached
  diamond artifact.
- 2026-07-21: retained the last verified private balance and chart across
  Private Home, Shield, and Unshield navigation. Background lifecycle refreshes
  now update those values in place without returning the dashboard to skeletons;
  wallet lock still clears the renderer snapshot.
- 2026-07-21: tightened the Unshield method interaction after device testing.
  Removed the duplicate sticky `Skip the relay` card, vertically centered the
  method row, shortened receiver-paid commitment copy to `Review` / `Proof
  generating`, and exposed `Public withdraw` in the method sheet only when the
  recipient is the original depositor. Its subtext distinguishes partial
  withdrawal from whole-deposit ragequit. Entry and review now share concise,
  renderer-only USD equivalents from the private portfolio price.
- 2026-07-21: added a review-level Unshield method selector without adding
  another entry-screen control. Private relay remains the default; an eligible
  receiver-paid route shows full proceeds, gas ownership, zero relay fee, and a
  public-submission warning. High or unavailable relay fees surface the same
  choice in the method sheet, while whole-deposit public exit remains a
  separately disclosed ragequit action.
- 2026-07-21: tightened Review unshield into one amount hierarchy and one
  compact Request details list. `Receiver amount` replaces `You receive`; the
  relay row now carries percentage plus ETH/USD fee and absorbs the over-cap
  state. Public exit moved into the sticky decision bar, and relay retry actions
  now use WalletChan amber.
- 2026-07-21: preserved the Unshield review hierarchy during relay failures.
  Signed fees at or above 100% remain an explicit red fee-cap error state with a
  zero receiver floor and sticky public exit; genuine quote outages retain
  network/route context and the same recovery action instead of empty space.
- 2026-07-21: split Unshield into amount/destination entry and a fresh
  quote-backed review. Exact output, relay fee/identity, expiry, fee-cap
  warning, and public-exit fallback now live on review; backing out invalidates
  an in-flight quote response instead of letting it overwrite the entry form.
- 2026-07-21: removed Private Send from the home action rail, Shielded ETH
  action sheet, route types, previews, and intent copy. Privacy Pools v1 has no
  in-pool transfer; Unshield remains the sole relayed withdrawal screen and
  retains arbitrary recipient entry, review, proof, relay, and public-exit
  behavior.
- 2026-07-21: rebuilt public exit as an account-led two-step flow. The compact
  fallback shows the saved account identity and opens a read-only selector for
  every current ragequittable deposit. Deposits are grouped by original account;
  checked whole commitments from one group become one atomic EIP-7702/ERC-7821
  exit, while a single selection retains the normal transaction path.
- 2026-07-21 (superseded later the same day): replaced the verbose over-cap
  relayer warning with a compact Warm Midnight fee comparison and automatic
  public-exit scrolling. The current review integrates that state into Request
  details and its sticky action bar instead.
- 2026-07-20: made Shield input represent the exact Shielded ETH output, added
  the protocol fee on top with wei-exact gross-up arithmetic, made Max fee- and
  gas-aware, and clarified the amount/fee/total breakdown in transaction review.
- 2026-07-20: resumed exact pending Shield confirmations after review Back,
  made the queue re-announcement idempotent without redundant deployment RPC
  work, moved Shield errors below route metadata, and added Send-style in-field
  ETH/USD amount entry backed by the current private-portfolio ETH price. The
  slider now retains sub-minimum amounts while validation reports the minimum.
  Pending runtime events close the fast-Back storage race, durable retries skip
  redundant RPC work, and outgoing controls release focus before their screen
  becomes inert.
- 2026-07-20 (superseded 2026-07-21): made Unshield and Send keep intent-correct labels through empty,
  input, review, loading, error, and confirmation states; both require an
  explicit recipient, and an empty balance disables the current route action
  instead of presenting a cross-route `Shield ETH` button.
- 2026-07-20: kept Private Assets/Activity state above Shield confirmation
  remounts, and made successful Shield and public-recovery confirmations switch
  and persist Private mode with Activity selected across sidepanel, full-tab,
  and closing-popup paths. Rejection preserves the current mode and tab. Every
  WalletChan Shield-origin row uses the privacy mark, and public recovery uses
  the concise `Shield Recovery` activity title.
- 2026-07-20: added a compact amber pending-compliance explanation above
  Unshield's public-recovery consent control. It states that the deposit can
  already return to its original account without competing with the checkbox
  or sticky action.
- 2026-07-20: replaced Unshield's passive public-exit linkage line with a native
  amber commitment checkbox. Public recovery now starts unchecked and the
  sticky `Withdraw publicly` action remains disabled until the user explicitly
  acknowledges recovery to the original address as a public transaction.
- 2026-07-20: rebuilt Unshield as the persistent inverse of Shield. Ready funds
  retain the editable private-relay amount flow; ASP-pending or declined funds
  reuse the same source/outcome cards as a fixed ragequit route to the original
  depositor, with the privacy linkage stated once and the public exit promoted
  to the existing sticky commitment action.
- 2026-07-20 (superseded 2026-07-21): replaced Shield's nested Shield/Unshield tabs with three sibling
  Private-home actions: Shield, vertical-arrow Unshield, and Send. Shield now
  mounts only the deposit controller; Unshield and Send both start with an
  empty recipient over the same audited withdrawal engine and use one shared
  intent-copy contract through review and confirmation.
- 2026-07-20: moved the smaller tooltip-free wallet-mode control into the
  balance heading below the Public account selector. Tightened Shield into a
  compact deposit form with `Deposit from`, 48px amount fields, a smaller
  direction marker, no fee-reserve jargon, and no repeated private-balance strip.
- 2026-07-20: aligned the Public/Private control and Private home with Warm
  Midnight: compact amber selection, shared base canvas, public-home action
  icons/recipes, concise `Send`/`Shield` labels, and an explicit split between
  ASP-cleared Shielded ETH and amber processing ETH. The main private USD value
  and encrypted chart now follow only the cleared balance.
- 2026-07-20: split the wallet home into persistent Public and Private modes.
  Private owns the Privacy Pools balance/chart, Shielded ETH asset, and private
  Activity; public account portfolios and generic Send/Swap no longer receive
  the pseudo-asset. Shield chooses its funding signer internally and private
  send remains wallet-wide.
- 2026-07-20: split Shield recovery into backup and restore paths, concealed
  revealed phrases by default, removed the manual Sepolia scan action, and
  added balance-at-risk plus double confirmation before phrase replacement.
- 2026-07-20: hid user-rejected public-withdrawal prompts from Shield Activity
  after their background commitment claim is safely released.
- 2026-07-20: added one compact `Withdraw without waiting?` action for indexed
  deposits still under ASP review. It names the exact original destination,
  explains the public link once, reuses normal wallet confirmation, and adds no
  setup page, modal, or protocol primer.
- 2026-07-20: made Shield balance reflect confirmed onchain pool value before
  ASP approval, added a compact accessible amber waiting-ASP aggregate, and
  made receipt/indexing progress update while the screen remains open.
- 2026-07-19: replaced the Shield placeholder with one fixture-only Sepolia
  balance dashboard. Shield, Unshield, and activity now define the healthy
  entry state; background recovery and protocol explanation add no resting UI.
- 2026-07-19: connected Shield entry to status-only background recovery
  initialization. Healthy setup remains invisible; the only new UI is a compact
  retry message when encrypted identity creation cannot safely complete.
- 2026-07-19: added one inline Sepolia ETH amount quote beneath the existing
  Shield action. It keeps the balance-first screen, shows only available funds,
  protocol/network fees, expected Shield credit, total, and Max.
- 2026-07-19: added one `Continue` action that prepares the deposit review in
  the background and resolves to a quiet `Ready for review` state. It adds no
  new page or technical explanation and still exposes no confirmation,
  signature, persistence, or submission control.
- 2026-07-19: added a quiet, theme-token-driven contenthash provenance pill to
  ENS/IPFS connection requests. It appears only for exact hosted or configured
  local/custom gateway identities and keeps stable loading, resolved, and
  unavailable states, preserving the connection decision hierarchy.
- 2026-07-18: made the dapp3 launcher favorite-first and stateful: the resolver
  input filters connected sites, connected results scroll after three rows, and
  hover/focus actions favorite or disconnect without coupling saved sites to
  permission lifetime. Runtime, storage, focus, and visibility reconciliation
  keep the open page synchronized.
- 2026-07-18: aligned `browse.html` dapp logo wrappers with More → Connected
  dapps by using the same light contrast canvas for real image marks and
  retaining amber only for generated letter fallbacks.
- 2026-07-18: brought `browse.html` into Warm Midnight with canonical zinc,
  amber, blue-focus, typography, radius, spacing, and interaction tokens;
  tightened the desktop composition and added responsive dapp tile layouts
  plus accessible resolver labeling and validation semantics. The page now
  leads with ordinary HTTP(S) dapps from the same exact-origin permission list
  as More → Connected dapps, without broadening its wallet-UI authority.
- 2026-07-18: clarified final seed-group account removal with explicit copy
  that the encrypted seed phrase is also permanently deleted from WalletChan,
  cannot be recovered by WalletChan, and must be backed up before continuing.
- 2026-07-17: made extension surface detection independent of viewport height.
  Short Chrome side panels now receive the full dynamic viewport shell before
  React paints and retain a single scroll owner instead of falling back to the
  fixed 360x600 action-popup canvas.
- 2026-07-17: tightened confirmed ERC-20 identity typography so token symbols
  sit closer to their `to` / `from` counterparty line while the token mark stays
  vertically centered against the complete two-line identity stack and the
  full keyboard-accessible explorer target is retained.
- 2026-07-16: replaced Transaction details' filled error alert with a neutral
  defined-edge failure receipt. Semantic red is confined to the status marker,
  the message follows the screen's normal hierarchy, technical diagnostics use
  an accessible disclosure, and Rebroadcast is a neutral recovery action.
- 2026-07-16: moved force-inclusion L1/L2 explorer actions beside their
  confirmed or failed stage statuses, keeping each link attached to the exact
  chain outcome and removing the duplicate receipt-level explorer row.
- 2026-07-16: finished the remaining Transaction-details variants with shared
  swap and delegation ledgers, a two-stage force-inclusion receipt, sequential
  batch context, explicit processing/uncertain states, generic deployment and
  contract-call actions, refund explorer access, and focused preview fixtures.
- 2026-07-16: separated confirmed ERC-7715 revocations from their
  pre-confirmation warning treatment. Transaction details now presents revoke
  intent, permission type, requester, delegate, asset, limit, methods, and
  expiry as one quiet receipt ledger with shared address and token disclosure.
- 2026-07-16: consolidated the Transaction-details bridge route into one
  directional ledger. Source and destination now share a stable token/value
  grid, request-scale token marks with contextual chain badges, aligned signed
  amounts, restrained explorer actions, and one secondary route row instead of
  competing stacked cards.
- 2026-07-16: rebuilt Transaction details around the Warm Midnight receipt
  hierarchy shared with transaction and batch review. Replaced the badge/card
  stack with request identity, explicit status and network, actual Send/Receive
  changes, synchronous action summaries, a compact bridge route, one receipt
  ledger, and one shadowless advanced disclosure. Added production-fidelity
  approval, transfer, bridge, metadata, stress, and wallet-bound preview states.
- 2026-07-16: rebuilt Activity as one production ledger aligned with Assets and
  Positions: a single defined-edge owner, internal date markers, compact
  identity media, a stable two-line intent/context and value/status grid,
  sentence-case function labels, signed tiny-amount notation, and icon-plus-text
  status metadata. Kept explorer actions on the intent line's trailing edge,
  with chain-marked source and destination actions for bridges; kept the
  complete history visible, and added deterministic mixed-state preview
  fixtures. Compact, popup, window, and sidepanel layouts were reviewed in both
  themes; Bankr, private-key, and seed-phrase navigation passed with no
  overflow, runtime errors, or axe violations.
- 2026-07-16: tightened the Activity ledger to a 64px row rhythm with 8px
  vertical insets, a relationship-based 2px line gap only for denser bridge
  entries, and 24px-high explorer targets so trailing controls no longer
  inflate the first text line.
- 2026-07-16: made Activity token media semantic instead of uniformly stacked:
  different assets use a readable source-to-destination tandem, while
  same-asset bridges collapse duplicate marks into one larger token identity.
- 2026-07-16: aligned Activity website identities with the Positions protocol
  grammar by giving favicons full-bleed 28px rounded-square frames within the
  stable media slot while preserving circular token and chain marks.
- 2026-07-16: made Activity address context live: recipient and counterparty
  addresses now prefer current contact labels, then current wallet account
  names, and update in place after contact or account mutations without a
  popup/sidepanel remount.
- 2026-07-16: switched Activity context copy to character-level ellipsis so a
  compact row retains the visible beginning of its hostname rather than
  removing the URL at a word boundary.
- 2026-07-16: made tiny Activity values precision-aware: exact 18-decimal
  amounts through 99,999 base units read as wei, wider rows retain readable
  decimal notation, and compact rows use subscript-zero notation without
  leaking insignificant fractional dust into the summary.
- 2026-07-16: made portfolio tabs retain independent scroll offsets, kept
  Activity history warm while hidden, and registered the homepage with shared
  screen-stack restoration so transaction-details back navigation returns to
  the exact ledger position after async history hydration. Activity token media
  now treats inert or stale cache entries as missing and shows symbol initials.
- 2026-07-15: rebuilt ERC-7715 permission confirmation on the shared Warm
  Midnight transaction/signature architecture. Queue navigation and Reject all
  now lead the body; dapp identity, human-readable reusable authority, live
  limits, delegate/reason context, and advanced caveats each have one owner;
  the sticky footer pins the signer beside secondary Reject and amber Grant
  permission. The renderer moved behind an audited feature domain and retains
  background-owned master authorization, account pinning, edit validation,
  first-action claims, and non-expiring pending requests.
- 2026-07-15: removed the duplicate inline batch-confirmation disabled message.
  The disabled Confirm batch control now remains focusable and explains the
  blocking reason on hover or keyboard focus, with corrective copy for unsafe
  self-recursive calls while preserving the signing block itself. The
  user-assembled review screen now uses the stable “Cross-Dapp Batch” heading
  instead of a source-count-derived “Review app batch” label.
- 2026-07-15: kept incompatible Add to batch actions safely disabled while
  restoring their account/chain reason through a keyboard-accessible tooltip,
  without bringing back persistent helper copy. Cross-dapp Reject all now
  reaches the App-owned global queue rejection path instead of merely invoking
  the local post-rejection navigation callback.
- 2026-07-14: removed redundant explanatory subtext from the shared Tenderly
  and Add to batch rows, tightening both transaction and batch Advanced details
  to compact 44px actions while retaining disabled reasons in accessible labels.
- 2026-07-14: turned explicit simulation failure into a consistent second-step
  decision across single, ERC-5792 batch, and cross-dapp batch requests. The
  amber Confirm action gains a warning icon, and its first press opens a compact
  “likely to fail” dialog before the existing wallet-specific signing callback
  can run; simulation-unavailable notices remain informational rather than
  pretending the chain outcome is known.
- 2026-07-14: matched batch Advanced details to the single-transaction reveal
  behavior by scrolling the newly expanded option set into the nearest visible
  area, using instant movement when reduced motion is preferred.
- 2026-07-14: aligned ERC-20 approval spenders with the shared counterparty
  identity pattern: resolved labels remain visible in one neutral pill while
  hover or keyboard focus on its three-dot affordance reveals the address,
  copy action, and explorer link; unlabeled spenders stay explicit inline.
- 2026-07-14: tightened the ERC-20 approval amount editor to a 32×28px amber
  control when embedded in a batch call, while retaining the standard 40px
  standalone approval target.
- 2026-07-14: promoted resolved clear-signing action names into batch-call
  headers and removed the duplicate embedded action/protocol heading.
- 2026-07-14: added a restrained amber numeral to Midnight batch-call markers
  while retaining their neutral graphite surface and edge.
- 2026-07-14: neutralized numbered batch-call badges in Midnight and moved
  persistent delete controls into accessible hover/focus overflow menus, with
  coarse-pointer visibility retained and the call disclosure chevron yielding
  its trailing position while the menu is active.
- 2026-07-14: refined the batch action equation into an unboxed “Batch overview”
  row with a quiet connector, right-aligned action names, amber separators, and
  single-line overflow handling plus a hover/focus tooltip for the complete
  equation, so it reads as context rather than a third heading or another
  nested card.
- 2026-07-14: added registry-owned, theme-aware contrast-surface metadata for
  chain logos. HyperEVM keeps its supplied white treatment in Bauhaus and uses
  a quiet dark surface with a mint edge in Midnight; registered testnets inherit
  both schemes from their parent identity.
- 2026-07-14: aligned batch and single-transaction requests around shared
  request identity, estimated-change, queue, force-inclusion, and developer-tool
  primitives; moved batch gas and the pinned signer to the decision footer and
  kept batch-level tooling under one Advanced details disclosure.
- 2026-07-14: unified batch request details and calls into one ordered review
  surface. Descriptor clear signing remains fully visible for matched calls,
  while ERC-20 approvals retain the compact one-line amount/token/spender
  summary and reveal their editable approval card on demand. Raw calldata is a
  second disclosure inside the approval editor. Editing, split, removal, and
  technical fallback remain attached to their owning calls while Advanced
  details is batch-level only.
- 2026-07-14: added a batch action equation beneath Request details. It resolves
  each call through specialized approval/native semantics, descriptor intent,
  then decoded function fallback and only appears once the complete sequence is
  meaningful, avoiding temporary generic “Call” labels.
- 2026-07-14: placed a default-on, checkmarked Unify Balances row directly
  beneath Refresh in Portfolio options. Selecting it persists the inverse state,
  dismisses the sheet, and reveals either cross-network ETH/USDC/USDT summaries
  or individual chain entries without supporting-copy clutter. Its resting row
  remains neutral; only the selected checkmark carries brand amber.
- 2026-07-14: reduced Portfolio options to the same compact, single-line action
  rhythm as Quick Actions by removing redundant supporting copy.
- 2026-07-14: moved Chains directly after Appearance in the main Settings list
  so theme and network configuration stay together near the top-level entry.
- 2026-07-14: rebuilt the custom-gas form around one consistent field grid,
  removing the unused left label column while preserving the linked-Auto info
  tooltip and animated Max fee edit overlap; the read-only Base fee now explains
  its network ownership on hover and focus.
- 2026-07-14: replaced the single RPC field in Edit Network with a bounded,
  keyboard-operable saved-endpoint dropdown. Named endpoints pair provider
  favicons with readable domains, expose the complete URL with copy/edit
  actions, and morph into a full-width editor. Built-in chains autosave validated
  endpoint changes without a redundant footer, while custom chains retain the
  staged Cancel and amber Save changes actions for their editable name, chain ID,
  endpoint, explorer, and native-currency fields.
- 2026-07-14: simplified transaction requests to one action label, one chain
  context, on-demand interacting-address metadata, and advanced-only force
  inclusion while preserving all signing and fee paths.
- 2026-07-14: enclosed the estimated asset-change rows in one quiet, defined-edge
  surface so the simulation reads as a single financial result.
- 2026-07-14: removed the separate native-value summary from estimated changes;
  simulated Send/Receive rows remain the single source for asset movement.
- 2026-07-14: suppressed redundant native-value precision disclosure when the
  compact and exact strings match, and placed a positive chain-native USD
  estimate beneath the request value when pricing is available.
- 2026-07-14: restored explicit Send/Receive simulation groups with compact
  diagonal direction markers, tightened asset identity metadata, and enlarged
  token marks for faster scanning.
- 2026-07-14: gave simulated-asset fallback token marks a subtle semantic edge
  so symbol-only identities remain distinct from the surrounding dark surface.
- 2026-07-14: returned clear-signing cards to the neutral raised surface so
  human-readable request details do not imply protocol-specific blue emphasis.
- 2026-07-14: restored request-counterparty alignment with the field label on
  the left and contract identity plus address controls on a right-hand rail.
- 2026-07-14: kept contract identity in a filled pill, using neutral graphite in
  Midnight and theme blue in Bauhaus, then moved its low-frequency address,
  copy, and explorer controls into a three-dot popover whose trigger uses amber
  icon feedback without splitting the pill surface on hover. Unlabeled
  contracts skip the generic identity pill and expose the shortened address,
  copy, and explorer actions directly. The labeled-contract popover sizes to
  its single address/action row rather than reserving a menu-width minimum.
- 2026-07-14: made ERC-20 logo/symbol identities in clear-signing amount rows
  disclose their contract address, copy action, and explorer link through a
  compact hover/focus popover, without adding a persistent menu affordance.
- 2026-07-14: consolidated single-transaction advanced controls into one
  neutral, divided surface. Inclusion policy, calldata inspection, digest, and
  developer actions now share one row grammar instead of competing card styles.
- 2026-07-14: ordered advanced transaction details from inspection to action to
  policy: developer rows now lead with recognizable icons, while optional force
  inclusion closes the list as the final execution-policy choice.
- 2026-07-14: packaged the Tenderly service mark with the extension so advanced
  simulation actions render immediately without a favicon fetch or cache race.
- 2026-07-14: tightened the calldata digest representation switch to a compact
  28px technical toggle and promoted the batch-add glyph with the brand amber
  tile while retaining text labels and native button semantics.
- 2026-07-14: expanded the collapsed calldata-digest disclosure target across
  its full technical row while preserving the established left label/chevron
  composition and independent expanded-state controls.
- 2026-07-14: added a small horizontal inset to inline disclosure headers so
  their hover and focus surfaces retain visible breathing room at both edges.
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
- 2026-07-14: refined single-transaction review into a compact dapp/action
  masthead, one estimated-change section, clear-signed request ledger, and a
  pinned signer/fee decision region. Local fee tiers now open upward without
  displacing Reject or the amber Confirm commitment.
- 2026-07-14: made expanded transaction advanced details reveal their full
  option list by scrolling the content end into the nearest visible position,
  while preserving focus and honoring reduced-motion preferences.
- 2026-07-14: reduced the transaction fee popover to compact one-line speed
  choices with estimated fiat cost. Presets now close on selection and omit
  duplicated raw gas diagnostics; editable gas fields remain available only
  through Custom.
- 2026-07-14: restored the fee tier icons' semantic green, blue, amber, and
  neutral accents after simplifying the menu, retaining personality and rapid
  scanning without reintroducing the removed technical rows.
- 2026-07-14: added an always-visible execution route beneath the signer when
  force inclusion is enabled, pairing destination and L1 chain logos with the
  plain-language “Transacting on … via …” path above the fee decision.
- 2026-07-15: rebuilt signature review on the same Warm Midnight request
  architecture as transaction and batch review: shared queue navigation,
  centered request identity, readable-first personal/SIWE/EIP-712 content,
  transaction-style labeled-address tools, collapsed technical payloads, and a
  compact pinned-signer footer with secondary Reject and amber Sign. The
  combined queue's Reject all action now matches its displayed scope.
- 2026-07-15: added the local Address Book using the Warm Midnight full-screen
  list grammar, quiet identity rows, accessible handle-only reordering, focused
  add/edit dialogs, contact-first public address resolution, and a keyboard
  recipient combobox while retaining raw copy/explorer disclosure.
- 2026-07-15: extended Add contact to resolve ENS, Basenames, `.wei`, `.gwei`,
  and `.mega` inline, pairing the asynchronous state with explicit progress,
  resolved-address confirmation, and corrective errors while persisting only
  the resolved EVM address.
- 2026-07-15: tightened the address popover action into an icon-led Add/Edit
  contact row and removed redundant storage-precedence copy from the focused
  contact dialog.
- 2026-07-15: made local contact labels the canonical first text identity on
  every resolved-address and account/delegate display while preserving ENS and
  other resolved avatars as independent visual identity metadata.
- 2026-07-15: enriched Address Book rows through the shared six-hour identity
  cache and per-chain Multicall3 batches, replacing secondary raw addresses
  with public primary names and blockies with safely cached avatars when
  available; forward-resolved Add contact input now seeds the name so only its
  avatar remains to fetch.
- 2026-07-15: retained each contact's deterministic blockie as the explicit
  fallback while a safe onchain avatar loads or when no avatar exists.
- 2026-07-16: unified Address Book and Send contact rows behind one cached
  contact-identity projection and safe avatar renderer, so public primary
  names, onchain avatars, and deterministic blockie fallbacks remain visually
  and behaviorally synchronized.
- 2026-07-16: carried that shared identity stack into Send autocomplete rows,
  adding safe avatar/blockie media and cached public-name matching without
  changing the keyboard-operable combobox interaction.
- 2026-07-16: made exact local contact and wallet recipients resolve
  synchronously from known identity data, eliminating the redundant resolver
  flash while preserving independent contract-recipient safety checks.
- 2026-07-16: reused the Address Book's editable, deletable, handle-sortable
  contact rows inside Send → My contacts. Filtered search pauses ordering, and
  eligible-subset reordering preserves hidden contacts in their stored slots.
- 2026-07-16: promoted the shared Add/Edit contact form's `Save contact` action
  to the Warm Midnight amber commitment treatment while retaining a neutral
  Cancel action and blue form focus.
- 2026-07-16: exposed Add contact directly from the Send Contacts group through
  a right-aligned plus action, retaining the shared name-service-aware editor
  and an actionable empty state.
- 2026-07-16: restored the full-row Warm Midnight hover highlight for selectable
  contacts in Send without changing the quiet Address Book management rows.
- 2026-07-16: simplified Send's recipient placeholder; the current concise copy
  is “0x, contacts, .eth, .gwei”.
- 2026-07-16: refined Transaction details with a concise Advanced disclosure
  that scrolls its heading into view on expansion, quiet Midnight calldata
  tabs with amber decoded-function identity, decoder-fed fallback summaries
  for transactions without clear signing, exact optional native payment, and
  a directly clickable receipt hash.
- 2026-07-16: aligned decoded and clear-signed transaction actions with the
  receipt ledger as a right-aligned `Action` value, removing the ornamental
  action icon and keeping Advanced details closed once readable intent exists.
- 2026-07-16: unified bytes and rich-string calldata tabs behind one decoded-
  parameter control, giving every Midnight param view the same quiet labels,
  amber active rule, and focus treatment while preserving Bauhaus styling.
- 2026-07-16: unified request and receipt token-image fallbacks behind the safe
  shared token mark, so missing or still-rasterizing logos remain legible as an
  amber symbol identity instead of disappearing into the dark surface.
- 2026-07-16: restored token-contract disclosure to estimated and confirmed
  balance-change symbols. Hover and keyboard focus now share the help cursor,
  amber identity feedback, address, copy, and explorer tools; the request
  simulation retry also consumes the same catalog/verified logo fallback as
  Transaction details.
- 2026-07-17: compacted expanded batch gas rows to three meaningful native-fee
  digits while retaining bigint-exact tooltip and assistive text. The call
  label now owns the remaining row width, preventing Bankr fee precision from
  collapsing request context at popup widths. Call count sits on a dedicated
  metadata line beneath the batch label, while Bankr fee-management provenance
  aligns with the right-hand amount column.
- 2026-07-17: completed the Send Warm Midnight pass by removing its Swap
  shortcut, tightening the amount hierarchy and slider, using amber for the
  active percentage and Review send commitment, and visually separating
  optional calldata without changing transfer preparation or submission.
- 2026-07-17: made Send's token-selector trigger content-sized with a 144px cap
  so short symbols do not leave a blank leading region and long labels cannot
  consume the asset card's right inset. The token identity stays aligned to the
  trailing edge as the right-hand value opposite Network.
- 2026-07-18: kept Send's My contacts navigation beside the Recipient label on
  the left, reserving the header's right-hand slot for transient resolution and
  the resolved name/address control.
- 2026-07-18: moved Send's live fiat/token conversion into the amount field as
  a bounded, truncating suffix immediately before MAX, and enlarged the amber
  slider visual from a 14px circle to an 18px rounded square without shrinking
  its 24px interaction target. Advanced transaction actions now share the
  disclosure header's trailing edge, keeping mode and decode controls attached
  to their section instead of floating above the calldata field.
- 2026-07-18: refined Swap / Bridge for compact wallet widths by giving both
  amounts a full row, moving bounded fiat conversions inside their fields, and
  pairing token/network identity with balance or price impact below. Reduced
  network and popular-token shortcuts preserve fast selection without crowding
  the picker, while a neutral disabled direction control avoids muddy amber
  hover feedback.
- 2026-07-18: tightened Swap / Bridge minimum-received summaries into a
  content-sized label, flexible right-aligned value, and fixed disclosure icon.
  Large token amounts use a compact unit instead of visual truncation, with the
  exact amount retained as native hover text.
- 2026-07-18: centered the Swap / Bridge receive-quote loader within its full
  output field so pending state reads as field-level progress rather than a
  placeholder value anchored to the input edge.
- 2026-07-18: separated Swap / Bridge network and token choices into compact
  header pills above each full-width amount. Network selection now opens a
  searchable vertical Warm Midnight list with funded networks ordered by USD
  balance first; Ethereum leads the unfunded remainder, followed by every other
  unfunded network alphabetically. Token selection stays scoped to that network.
  Generic Swap entry adopts the cached portfolio's highest-value funded token,
  while asset-row entry preserves its explicit source token.
- 2026-07-18: promoted the searchable, funded-first network browser into a
  shared Warm Midnight selector used by Swap / Bridge, Send, and the homepage
  asset filter. Each surface supplies its own balance snapshot and selection
  effect, while search, row hierarchy, ordering, empty state, and keyboard
  dismissal remain visually and behaviorally identical.
- 2026-07-18: constrained the shared full-screen picker column to the wallet's
  480px content measure on wide extension tabs. Homepage network filtering,
  Send token selection, account selection, and every other consumer retain a
  full-height surface without stretching controls and list rows edge to edge.
- 2026-07-18: aligned selected popular-token shortcuts with the picker list's
  blue selection language. The blue focus edge, cool selected label, checkmark,
  and tinted surface now communicate one selection state; amber remains
  reserved for commitment actions and branded emphasis.
- 2026-07-18: moved Send and Swap currency-mode switching onto the conversion
  value inside each amount field, removing the detached USD control while
  retaining an accessible USD/token fallback before any amount is entered.
  Swap balance quantity and fiat value now share one quiet trailing line.
- 2026-07-18: removed Swap's fixed-width chain-label cap. Pay and receive
  headers now reserve the token pill's content width, then allow the chain pill
  to render at its natural width and shrink only when the combined controls
  genuinely exceed the wallet row.
- 2026-07-18: matched Send's in-field currency switch to Swap's content-bounded
  control. Its hover surface now hugs the USD or token conversion instead of
  expanding across all space before MAX.
- 2026-07-18: clarified Swap's chain relationship in plain language with “You
  pay on” and “You get on” labels immediately before their network pills.
- 2026-07-18: added a compact “on [chain]” context pill beside the Swap token
  search label. The chain mark and name remain visible above the query without
  consuming input width or duplicating the network-change interaction.
- 2026-07-18: inset Send's in-field currency and MAX controls from the amount
  field edge, matching Swap and preserving the complete blue focus boundary
  while either suffix action is hovered.
- 2026-07-18: kept Swap's direction control available when either asset is not
  selected. Flipping now exchanges both network contexts and moves any selected
  token to the opposite side while preserving an explicit Select state. The
  screen title now uses “Swap or Bridge” capitalization.
- 2026-07-18: removed the redundant visible “Popular on [chain]” label from
  Swap token discovery now that network context sits beside Search. Popular
  shortcuts follow the field directly, and the catalog section uses a tighter
  12px inter-section gap after wallet holdings.
- 2026-07-18: widened Swap's direction control to 46px while retaining its
  compact 40px height, producing a clearer horizontal bridge between the Pay
  and Receive cards without enlarging the icon.
- 2026-07-18: made Swap's direction hover rotate only the arrow icon by 180
  degrees over 200ms. The amber control remains stationary, and reduced-motion
  or disabled states suppress the rotation.
- 2026-07-18: gave the overlapping Swap direction control a dedicated 20px
  inner buffer on the facing card edges. Pay gains bottom breathing room and
  Receive gains matching top breathing room without loosening either card's
  outer gutters or the rest of the compact form.
- 2026-07-18: restored quoted Receive amounts to the primary foreground color.
  The output remains read-only, but its financial value now carries the same
  visual weight as the editable Pay amount instead of appearing disabled.
- 2026-07-18: aligned Swap confirmation with the Warm Midnight commitment
  language: its title, direction marker, submitting state, and final Confirm
  action use brand amber; the implementation-detail Atomic/Sequential badge is
  removed; and the estimated output label now reads “You get”.
- 2026-07-18: replaced Swap confirmation's bright bespoke network badge with
  the shared dark chain-context pill, omitting the redundant “on” prefix on
  this explicit Network/Route row. Its numbered transaction badges
  now match batch-request cards: graphite with amber numerals in Midnight,
  while Bauhaus retains the semantic call-accent rotation.
- 2026-07-18: matched Swap confirmation's back action to the shared app header:
  a 44px square target, 20px arrow, and the same 8px screen-edge inset.
- 2026-07-19: extracted Warm Midnight's restrained three-dot progress pulse
  into a provider-independent shared loader. Transaction simulation, gas
  estimation, and standalone dapp-directory search now use one motion pattern,
  including a static reduced-motion state.
- 2026-07-19: kept dapp-directory discovery and launcher context separate:
  result activation opens a validated HTTPS URL in a new tab, while a trailing
  hover/focus star saves the result without navigation. The star reuses the
  connected-card saved state and remains visible on keyboard selection and
  coarse pointers.
- 2026-07-19: unified standalone-browser identity marks on the connected-dapp
  white contrast canvas, including mascot and generated-letter fallbacks.
  Raster logos now occupy more of the unchanged icon footprint with rounded
  image corners. Populated search gains a bare, compact clear action directly
  before Open, returning focus to the empty field without adding another boxed
  control.
- 2026-07-19: replaced opaque local IPFS/IPNS CID hostnames with the original
  `.eth`, `.gwei`, or onchain `0x` identity across browser cards, request
  reviews, activity, and details. The friendly label reacts to the configured
  gateway host/port while raw security origins and navigation remain intact.
- 2026-07-19: extended that identity projection to favicons across connection,
  signing, activity, and detail surfaces. Local IPFS/onchain marks now reuse
  the browser launcher's safe raster/remap/Chrome-processed fallback order and
  existing light contrast canvas instead of collapsing to a CID letter tile.
- 2026-07-19: moved Ledger to the final Add Account position after View-only
  and replaced the remaining invented hardware glyph with Ledger's official
  monochrome lettermark.
- 2026-07-19: kept Ledger transaction and signature reviews mounted through
  hardware approval, added the shared branded signing prompt with black logo
  tile and dark trailing spinner, moved `Waiting` to a dark-to-muted three-dot
  loader, reserved the submitting banner for broadcast, locked request edits
  until the device resolves, and kept Back available as non-mutating navigation.
- 2026-07-19: made fee-asset selection visually scannable with native-token and
  USDC marks in both the compact pill and action sheet. USDC preparation now
  reuses the established transaction-fee progress pulse and concise
  “Estimating Fees” label, while the resolved maximum remains stable through
  confirmation rerenders instead of returning to a loading presentation.
- 2026-07-19: moved the independently fetched USDC balance into the fee-asset
  action sheet before quote preparation, removed its duplicate from the
  confirmation summary, and centered the shared estimating pulse across the
  pending fee row.
- 2026-07-19: replaced the ERC-20 paymaster's opaque post-operation code with
  an actionable fee-selection error when a transaction would leave too little
  USDC: reduce the amount or choose the native token. Retry remains available
  without exposing provider internals in the confirmation hierarchy.
- 2026-07-19: expanded the network-fee picker from native/USDC to WalletChan's
  reviewed Pimlico token catalog. Each choice now carries its own symbol,
  decimals, balance, logo fallback, bounded quote, and stablecoin-only fiat
  equivalence while preserving the same compact pill and action sheet.
- 2026-07-20: refined pending-transaction replacement receipts. Speed Up keeps
  the original request identity, simulation, clear-signing content, action,
  and Activity media beneath one concise nonce/fee notice. Cancel removes the
  redundant self-transfer explanation and renders as a WalletChan-authored
  “Cancel Transaction” row without duplicate context. Transaction details end
  Advanced details with the signed nonce, while displaced mempool entries use
  an amber `Dropped` state instead of the red execution-failure state.
- 2026-07-20: restyled Send's smart-contract warning as one quiet graphite
  decision surface. Amber is limited to the warning signal and acknowledged
  state; the title, explanatory copy, and full-row risk acknowledgment follow
  Warm Midnight's neutral hierarchy instead of stacking status-colored cards.
- 2026-07-20: grouped DeBank, Nansen, Octav, Zerion, and Blockscan into a
  compact, logo-only address-dashboard row above the active account's chain
  explorer list. Each 36px shortcut exposes its name on hover and keyboard
  focus while keeping the chain-specific destinations visually primary below.
- 2026-07-20: matched the staking amount field to the wallet's established
  token/USD conversion control while retaining exact-token MAX execution.
- 2026-07-20: added a compact 7-day APY strip above staking balances, using
  amber for the total and quiet secondary copy for the WCHAN/WETH breakdown.
- 2026-07-20: unified More and Stake on one APY presentation source so a
  resolved zero remains `0.0%`/`0.00%` instead of degrading to unavailable.
- 2026-07-21: named the recovery-status shortcut “Deposits” and used a
  secondary-gray Midnight icon for it. Amber remains reserved for the primary
  Shield and Unshield actions; global Settings is not duplicated in the rail.
- 2026-07-21: made Activity ownership consistent across wallet modes. Privacy
  journeys retain their rich Private rows, while Shield, single/batch public
  exits, and receiver-paid Unshield also retain the ordinary Public row for
  the account that signed the transaction. Relayed Unshield remains
  Private-only because no WalletChan account submitted its relay transaction.
- 2026-07-22: clarified receiver-paid Unshield failure hierarchy. A definite
  non-submission now reads `Transaction was not submitted` with error treatment
  and releases the claimed commitment for retry; ambiguous publication remains
  the only hashless Processing state. Background recovery now observes the
  confirmation-to-submission handoff grace rather than cancelling a transaction
  immediately after its prompt is consumed.
- 2026-07-22: unified receiver-paid Unshield receipt feedback. The canonical
  receipt that confirms the Public Activity row now advances the richer Private
  Unshield row in the same finalization pass; the independent privacy poller is
  retained only for restart recovery.
