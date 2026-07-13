# Warm Midnight Surface Handoff

> Status: active screen-by-screen brand review
> Last updated: 2026-07-11
> Scope: WalletChan browser-extension presentation and interaction only

This is the practical handoff document for continuing the Warm Midnight UI
review in fresh sessions. It records the decisions approved during the live
screen-by-screen redesign, distinguishes finished work from pending work, and
prevents older UI plans from overriding the current product direction.

This document does not replace the permanent design system in
[`DESIGN.md`](../DESIGN.md). `DESIGN.md` defines why WalletChan looks and feels
the way it does. This document defines what has been decided on each product
surface and what should happen next.

## 1. Reading order and authority

Every fresh UI session must read, in this order:

1. [`AGENTS.md`](../AGENTS.md), when present, for repository and verification
   rules.
2. [`DESIGN.md`](../DESIGN.md) for the permanent Warm Midnight brand system.
3. This document for approved surface decisions and current status.
4. [`STYLING.md`](./STYLING.md) before editing any UI component.
5. [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) before changing extension logic,
   state, message passing, dapp behavior, authentication, or storage.
6. [`MASCOT.md`](./MASCOT.md) when the surface uses the WalletChan character.
7. [`SECURITY.md`](./SECURITY.md) before committing extension changes.

[`IMPROVE_UI.md`](./IMPROVE_UI.md) remains useful historical context for the
mobile-navigation migration and shadcn learnings, but its older screen targets
are not the source of truth for the current homepage. Production code plus the
approved decisions below take precedence.

## 2. Product direction

WalletChan should feel like a modern mobile wallet that is trustworthy for
financial decisions without becoming another anonymous corporate blue wallet.

The committed qualities are:

- **Trustworthy:** stable hierarchy, clear outcomes, restrained financial
  controls, and no decorative noise around risky decisions.
- **Precise:** aligned financial values, middle-truncated addresses, real chain
  and token identity, and explicit interaction states.
- **Approachable:** plain-language labels, one obvious next action, and mobile
  navigation instead of desktop modal stacks.
- **Spirited:** the WalletChan mascot, condensed wordmark, warm amber, and small
  playful reactions make the wallet recognizable.
- **Bold:** the product should have conviction and contrast, not the timid
  default-neutral appearance of a component-library demo.

The aesthetic is **Warm Midnight**: a near-black financial interface with
off-white typography, quiet graphite surfaces, WalletChan amber, full-color
identity assets, and blue reserved for transactional/focus roles.

## 3. Brand contract

### 3.1 Wordmark

- Explicit WalletChan logo/name lockups use the shared `BrandWordmark`.
- The wordmark uses self-hosted Anton and renders `WALLETCHAN` in uppercase.
- Use it in the extension header, unlock header, onboarding identity, and About
  identity.
- Do not use Anton for screen titles, settings labels, balances, buttons,
  technical content, or ordinary mentions of WalletChan.

### 3.2 Mascot

- The mascot is a primary brand asset, not generic decoration.
- It may lead unlock, onboarding, empty states, and success/reassurance moments.
- On the homepage, the mascot in the header is sufficient. Do not add another
  mascot beside the account or balance.
- Trust-critical confirmation screens remain information-first. Do not place a
  large mascot beside transaction outcomes, asset changes, fees, or approval
  limits.
- Follow the semantic states and animation pipeline in `MASCOT.md` rather than
  creating one-off character behavior inside screens.

### 3.3 Color responsibilities

- Neutral graphite surfaces carry most of the interface.
- Amber is WalletChan's brand signature. Use it for the brand Unlock action,
  selected Warm Midnight accents, the emphasized homepage Send shortcut, the
  final single-transaction `Confirm` action, the EIP-7702 `Set delegate`
  commitment action, and small identity/attention moments.
- Blue remains the default transactional, selection, link, and focus family
  unless a surface has received an explicit Warm Midnight exception. The final
  single-transaction `Confirm` button is one such exception and must use the
  amber `brand` variant, not `primary`.
- Green and red are semantic gain/receive and loss/send/error colors.
- Chain, token, protocol, account, and dapp artwork keeps its real colors.
- Amber must not fill every action. Its scarcity is what makes WalletChan
  recognizable.

### 3.4 Surface language

- Standard Midnight borders are 1px.
- Prefer alignment, spacing, lightness, and separators to another card.
- One outer surface may own a list; its child rows should not each become cards.
- Resting cards do not need shadows. Shadows belong to actual floating layers.
- Avoid transparency on popover content. `surface.overlay` is a scrim token, not
  a floating-content background.
- Controls generally use an 8px radius; top-level surfaces and sheets use 12px.
- Full/pill radius is for avatars, token/chain icons, statuses, and real pills.

### 3.5 Type and icons

- Midnight product typography stays restrained and readable; the wordmark is
  the deliberate display-font exception.
- Financial values use tabular numerals.
- Addresses, hashes, and raw identifiers use the mono face and middle
  truncation.
- Icon-only actions need accessible names and visible hover/focus states.
- Chain icons in lists and floating menus are circular. Transparent or dark
  glyph logos receive a neutral/light chip in Midnight so they remain visible.
- Dapp favicons receive a physical light background where transparent artwork
  would disappear against Midnight.

## 4. Mobile interaction contract

- Treat the popup, detached popup, and sidepanel as a mobile app viewport.
- Keep native touch, wheel, trackpad, and keyboard scrolling, but hide visual
  scrollbar chrome across application surfaces.
- Substantial destinations push as full screens with Back.
- Searchable or long selections use full-screen pickers.
- Two to six contextual actions use a bottom action sheet.
- A small hover/context choice may use a popover.
- Dialogs are reserved for blocking decisions, destructive confirmation, QR,
  or media inspection.
- Do not reintroduce large desktop dropdowns, nested modals, or sheets for
  hierarchical navigation.
- A bottom sheet must respect the same centered maximum content width as the
  homepage in wide popup-window and sidepanel layouts.
- Hover-triggered content must remain open while the pointer moves from the
  trigger into the content. Keyboard and focus behavior must remain usable.

### 4.1 Interaction sound contract

- Sound is a small reinforcement for meaningful outcomes, never a continuous
  soundtrack or a substitute for visible feedback.
- Prefer brief cues for confirmation, incoming requests, action-sheet
  transitions, and a few high-confidence state changes. Do not add audio to
  routine navigation, typing, scrolling, transaction amounts, or every button
  press. The approved hover exception is limited to portfolio token rows plus
  Send, Swap, Shield, and More; those cues are fine-pointer-only and
  rate-limited by the manager.
- Product surfaces request semantic cues from `sounds/soundManager.ts`; they do
  not import Cuelume or choose recipe names directly.
- Settings → Sounds owns one global `soundsEnabled` preference. It defaults on,
  is stored locally on the browser, and immediately applies across open
  extension views. Every future cue must respect it.
- Sound playback is enhancement-only. Authentication, confirmation, errors,
  and accessibility must remain fully understandable when audio is blocked or
  disabled.
- High-frequency value feedback uses the WalletChan-owned value pulse: 520Hz
  sine, 1500Hz low-pass, 5ms attack, and 45ms decay. The chart cue is limited
  to one pulse per 26ms and tracks actual visible NumberFlow changes rather
  than raw pointer events.
- Sliders play a short custom tick for actual non-snap value changes, capped at
  one per 26ms. Normalize into the 0/25/50/75/100 snap stops before playback,
  discard repeats inside one snap band, and play Cuelume `release` once when
  entering a different stop.
- Portfolio token hover uses a shorter sibling of that voice: the same sine
  and filter with a 2ms attack and 12ms decay. Keep its fine-pointer-only
  behavior and 140ms cooldown so quickly crossing the list stays restrained.

## 5. Approved surface decisions

### 5.1 Unlock

The unlock screen is the first completed Warm Midnight brand surface.

- Keep the compact WalletChan wordmark header and hamburger/menu entry.
- The animated mascot is the central identity moment.
- The instruction below the mascot is centered and reads
  `Enter password to unlock`.
- The input placeholder is `Password`.
- Remove generic `Welcome back` and `Unlock your wallet to continue` copy.
- Remove the local-decryption/trust-information box from this screen.
- The primary Unlock action uses the amber brand treatment.
- Keep biometric unlock as the secondary large action when configured.
- `Forgot password?` appears only after an incorrect password.
- An incorrect-password label occupies a reserved position at the input's top
  right so the rest of the layout does not move.
- Invalid submission shakes the input; reduced motion receives a safe fallback.

Mascot lifecycle:

- Empty password, including input focus: sleeping.
- First typed character: attentive.
- Correct password or successful biometric ceremony: brief success state with
  sparkles and one quiet sparkle cue, followed by the screen fade.
- Incorrect password: invalid/concerned state with Manpu.
- Automatic biometric prompt: attentive while the OS prompt is active.
- Cancelled biometric prompt: return to the password-mode flow.
- Manual biometric retry follows the same attentive/success/cancel behavior.
- A visible success state is held for 500ms before fading so the reaction can
  be perceived; reduced motion uses the shorter documented timing.
- Password unlock must not trigger a passkey prompt after the homepage appears.
- Successful biometric unlock must not trigger a second passkey prompt.

Relevant files:

- `components/UnlockScreen.tsx`
- `components/UnlockMascot.tsx`
- `components/UnlockMascot.css`
- `components/unlockMascotState.ts`
- `sounds/soundManager.ts`

### 5.2 App header

- Keep one mascot/logo at the left and the Anton WalletChan wordmark.
- Keep Lock, Settings, and the compact menu affordance.
- Do not restore the `$WCHAN`, WalletChan OS, or other permanent promotional
  banner.
- Do not add a second mascot elsewhere on the homepage.

### 5.3 Homepage account identity

- Use one compact account surface.
- The whole account surface opens the account picker.
- Show account avatar and display/ENS name on the first line.
- Show the middle-truncated address below it with tightly grouped QR, copy, and
  explorer actions where applicable.
- Copy and explorer actions prevent the parent account-picker behavior.
- Preserve a stable right-side chevron and sufficient separation between it
  and the address actions at every supported width.
- Address text may grow when the popup grows, but must yield before action
  buttons and the chevron.
- Do not show `Private key`, `Seed phrase`, `Bankr`, or another wallet-type tag
  in the homepage account card.
- Wallet-type details remain available inside account management.

There is no global homepage network selector. Without a connected dapp, a
global chain has no useful meaning.

Account explorer behavior:

- Clicking the explorer icon directly opens the active address on Ethereum
  Etherscan.
- Hovering the icon opens an opaque popover below it.
- The pointer can move into the popover without closing it.
- The popover lists enabled networks that have explorers; selecting one opens
  the active address on that network's explorer.
- Rows use round chain icons and Midnight visibility chips for transparent
  artwork.
- Explorer hover uses WalletChan amber, matching token-address explorer actions.

Relevant files:

- `components/AccountSwitcher.tsx`
- `components/AccountExplorerMenu.tsx`
- `components/AccountNetworkControls.tsx`
- `components/MiddleTruncatedAddress.tsx`

### 5.4 Per-tab account and chain model

Do not undo these functional behaviors while styling account or dapp surfaces:

- Each browser tab maintains its own selected account and injected-dapp chain.
- A tab initially inherits the most recently active account.
- After selection, changing another tab does not overwrite it.
- Dapps receive the account selected for their tab.
- An account switch emits `accountsChanged` only to a permitted dapp in that
  tab.
- A new tab inherits the account that was most recently active in the wallet.
- Transaction and signature requests remain pinned to the initiating tab's
  account.

See the Account Selection and Address Synchronization sections of
`IMPLEMENTATION.md` before changing this flow.

### 5.5 Portfolio balance and quick actions

- Portfolio balance is the primary homepage value.
- Keep one stable four-column row: Receive, Send, Swap, More.
- Every action owns an equal column and a consistent compact target; expansion
  to popup-window or sidepanel width must not produce large uneven gaps.
- The Send shortcut is the amber Warm Midnight emphasis.
- Other actions remain quiet neutral/brand-supporting controls.
- WalletConnect activity is represented by a small notification dot on More,
  not a promotional card above the account.
- The WalletConnect submenu entry carries the corresponding highlighted state.

Relevant file: `components/HomeQuickActions.tsx`.

### 5.6 Injected dapp connection and homepage dock

WalletChan now requires explicit account-visibility permission before an
injected dapp receives accounts.

- A first connection request opens a full-screen confirmation.
- Permission is stored per exact trusted origin, not per account.
- Returning approved sites do not prompt unnecessarily.
- Whichever account the user selects for that tab is available to the approved
  site.
- Account access is not restricted to a manually selected subset of addresses.
- Connected dapps remain manageable even when their tab is no longer open.

Homepage dock rules:

- The dock exists only on the homepage.
- Send and Swap/Bridge use their own token/network context and do not show it.
- If the current tab has no connected dapp, render no dock row at all.
- The dock must update when navigation changes the URL within the same tab; it
  must not require switching away and back.
- When connected, the left region shows the dapp favicon, hostname, and
  `Connected` status.
- Hovering the connected status changes it to a padded red `Disconnect?`
  action without disturbing the rest of the dock.
- Disconnect is not duplicated inside the chain sheet.
- Only the right chain region opens the network sheet.
- The right-region highlight hugs the chain icon/name content with padding; it
  must not paint an arbitrary half of the dock.

Dapp network sheet:

- Mobile bottom sheet, approximately 75% viewport height.
- Respect the homepage maximum width in wider windows/sidepanels.
- Include search at the top.
- Sort networks with the largest portfolio balances first.
- Show a small wallet/money icon beside a non-zero USD balance.
- When a network balance is zero, leave the balance line empty.
- Use round chain icons and visibility chips for transparent/dark logos.
- Keep the dapp favicon on a physical light background where necessary.

Connected-dapp management:

- `More` contains a `Connected dapps` submenu entry rather than rendering the
  entire list inline.
- The submenu lists every persisted permission, not only currently open tabs.
- The left/main portion of a dapp row opens the site in a new tab.
- The entire trailing remove region is clickable and visually separated; it
  revokes the permission so a future connection request prompts again.

Relevant files:

- `components/DappConnectionConfirmation.tsx`
- `components/HomeDappDock.tsx`
- `components/DappSiteIcon.tsx`
- `components/ConnectedDappsView.tsx`
- `components/MoreActionsView.tsx`
- `chrome/dappConnectionHandlers.ts`
- `chrome/dappPermissionStorage.ts`

### 5.7 Portfolio tabs and chart

- Root destinations are Assets, Positions, and Activity.
- Selected Midnight tab uses the restrained amber underline, not a permanent
  blue outlined tab.
- The chart remains secondary to the total balance.
- Positive chart color is semantic green.
- Use a curved path rather than sharp linear corners.
- Chart and token-list edges align cleanly.
- Avoid the bottom-right double-radius artifact between chart and holdings.
- Keep vertical spacing compact between tabs, performance label, chart, filter,
  and list.

### 5.8 Assets controls

- The network filter, search action, and vertical three-dot menu sit below the
  chart and immediately above the token list.
- Search is an icon at rest. Clicking it replaces the control row with a full
  search input.
- The input filters holdings by token name or symbol.
- Search and clear icons are vertically centered and the clear hover target
  does not become an oversized floating block.
- The portfolio menu opens a mobile action sheet containing:
  - Refresh portfolio
  - Add custom token
  - Hidden tokens
- Do not restore separate `+` and reload buttons beside the network filter.

### 5.9 Asset rows and token action sheet

- Token logos and token typography are deliberately compact.
- The complete row is one click target.
- Remove inline copy and three-dot actions from the row.
- Clicking a token opens its action sheet.
- The sheet respects the same maximum width as the homepage/network sheet.
- Header format is a single line: token logo + token name + `on` + chain logo +
  chain name.
- Actions include icons and use this order:
  1. Send
  2. Swap
  3. Address, when the asset has a real contract address
  4. Edit token, for locally editable tokens
  5. Hide token, isolated at the bottom
- Address uses middle truncation and keeps copy/explorer beside the `Address`
  label.
- Native assets must not show a fake `0x0000...` address entry.
- Hide token is red on the neutral resting surface. In Bauhaus, its red filled
  hover uses a contrasting visible foreground.

### 5.10 Aggregate assets

When `All networks` is selected, WalletChan aggregates canonical copies of
specific assets across supported built-in mainnets:

- ETH, only on built-in mainnets where ETH is the native currency.
- Canonical USDC, using the verified address map in `canonicalTokens.ts`.
- Canonical USDT, using the verified address map in `canonicalTokens.ts`.
- Do not aggregate arbitrary same-symbol tokens, bridged lookalikes, testnets,
  or custom networks without verified canonical identity.

Aggregate row behavior:

- Show combined token amount and USD value.
- Show `N networks` beside the symbol.
- Place the disclosure arrow immediately beside the network count so the row
  remains aligned with ordinary holdings.
- Expanded chain rows use the token logo with a smaller chain badge overlay,
  consistent with normal asset identity.
- The expanded region uses a slightly lighter surface and square joins; do not
  create a rounded nested card.

### 5.11 Low-value assets

- The low-value group is a noise-control mechanism, not a strict price rule.
- Always keep up to the four largest holdings outside the group.
- Only create the low-value group when the account has at least five holdings.
- If an account has only one to four low-value assets, show them normally.
- The collapsed summary shows `Low-value assets`, combined value, and the asset
  count. Remove the redundant `Assets worth less than $0.10 each` line.
- Keep the asset count on one line at compact widths.
- Expanding the group scrolls the page just enough to bring its holdings into
  view.

### 5.12 Network filter

- `All networks` is the default portfolio scope.
- The filter picker must not clip selected-row corner/focus treatment.
- Long custom-network and testnet names remain readable.
- Chain logos are round and receive a visibility chip where needed.

### 5.13 Add account

- The root Add account screen is a concise 2-by-2 account-type launcher.
- Private key, seed phrase, Bankr API, and view-only setup each open as a
  focused child screen with their own title, fields, validation, and action.
- Back from a type-specific screen returns to the account-type launcher; Back
  from the launcher returns to the account list.
- Keep Bankr visibly unavailable when a Bankr account already exists, without
  hiding the account type.
- Keep the launcher surfaces neutral, with restrained semantic color confined
  to the account-type icons. Bankr uses its real product mark rather than a
  generic bot glyph.
- Seed phrase setup continues to expose saved seed groups for deriving another
  address before offering a new phrase flow. When no saved group exists,
  selecting Seed phrase opens the import-or-create choice directly instead of
  showing an empty interstitial.
- Final account-creation actions use the amber brand treatment. Validation,
  encryption, and background account handlers remain unchanged.

### 5.14 Transaction review

- The screen follows one decision path: expected outcome, estimated balance
  changes, request details, then advanced tooling.
- The outcome uses one quiet raised surface with the requesting dapp identity.
  A small amber marker supplies WalletChan warmth without competing with the
  blue Confirm action.
- Request details read as a compact ledger with sentence-case labels, neutral
  network identity, row separators, and no nested address card.
- Asset direction remains explicit in text and signed amounts. Do not use a
  decorative colored rail beside every asset row.
- Gas, calldata, digest, and Tenderly controls remain behind Advanced details.
  Technical surfaces use defined edges without resting shadows. Midnight's
  active calldata tab uses a thin amber rule rather than a second filled action
  color.
- The final single-transaction `Confirm` button uses `variant="brand"` so the
  commit action is WalletChan amber. Do not replace it with the blue `primary`
  variant during confirmation refactors. Reject remains the neutral secondary
  action.
- Preserve every simulation warning, copy/explorer affordance, pending-request
  control, force-inclusion option, and Bankr/private-key/seed-phrase execution
  path while changing this composition.

## 6. Logic and safety guardrails

Warm Midnight work is presentation-first. Do not casually change:

- Transaction, signature, clear-signing, simulation, batching, or swap logic.
- Password, passkey, vault, session, or agent-password behavior.
- Dapp permission trust derivation or storage shape.
- Per-tab account or chain routing.
- Portfolio token identity, canonical-address maps, or price calculations merely
  to make a row easier to render.
- The three wallet-type execution paths: Bankr/impersonator, private key, and
  seed phrase.

If a surface change requires any of the above, read `IMPLEMENTATION.md`,
`STORAGE.md`, `PUBLISHING.md`, and `SECURITY.md` as required by `AGENTS.md`, then
separate the functional change from the visual review where possible.

Every displayed `0x` address still follows the repository standard:

- Middle truncation where space is constrained.
- Inline copy feedback using Copy -> Check, never a toast.
- Correct-chain explorer link when chain context exists.
- The homepage account's no-global-chain exception defaults to Etherscan and
  offers other explorers through the hover popover.

## 7. Surface status and next work

| Surface | Status | Notes |
| --- | --- | --- |
| Warm Midnight foundation | Approved | Tokens, wordmark, mobile grammar, thin surfaces |
| Unlock | Approved | Mascot lifecycle and amber brand action integrated |
| App header | Approved | Mascot/wordmark only; promotional banner remains removed |
| Homepage account card | Approved | Compact account/address utility; no wallet-type label |
| Account explorer popover | Implemented; final visual review pending | Opaque surface, Etherscan default, round/chipped network icons |
| Per-tab accounts and chains | Implemented | Functional behavior; preserve during UI work |
| Dapp connection permission | Implemented and reviewed | Persistent origin permission plus confirmation screen |
| Homepage dapp dock | Implemented and reviewed | Connected current-tab sites only |
| Homepage balance/actions | Approved | Stable four-action row; amber Send shortcut |
| Assets tab | Substantially approved | Chart, controls, rows, sheets, aggregation, low-value behavior |
| Positions tab | **Next surface** | Needs populated-state Warm Midnight visual review |
| Activity tab | Pending | Review rows, status hierarchy, and detail transition |
| Homepage loading/empty/error states | Pending | Review after Positions and Activity |
| Homepage responsive/focus final pass | Pending | Do only after visual composition is locked |
| Send | Mobile baseline exists; Warm Midnight review pending | Handle as its own fresh session |
| Swap/Bridge | Mobile baseline exists; Warm Midnight review pending | Handle as its own fresh session |
| Confirmations and signing | Transaction review implemented; signing review pending | Transaction uses the Warm Midnight decision path; preserve information-first trust hierarchy |
| Settings/account management | Mobile baseline exists; Warm Midnight review pending | Review by leaf surface, not as one large rewrite |

Recommended immediate order:

1. Positions populated list.
2. Positions empty/loading/error states.
3. Activity list.
4. Activity-to-detail transition and detail screen.
5. Homepage loading/empty/RPC/stale states.
6. Homepage compact and wide responsive polish.
7. Only then run the broader homepage QA gate.

## 8. One-surface session protocol

Each fresh chat should own one surface, not an entire phase.

1. Read the authority stack in section 1.
2. Inspect the production component and its real call site before proposing
   changes.
3. Treat the actual extension UI as truth. If a preview differs, fix preview
   fidelity before using it to judge the production design.
4. State the one visual task being attempted.
5. Make one small reviewable change.
6. Run only `pnpm build:extension` during the visual iteration unless the user
   explicitly requests broader checks.
7. Do not run Playwright, lint, typecheck, or repository-wide automation after
   every small adjustment.
8. Do not open preview URLs automatically.
9. Let the user inspect the extension and respond before starting the next
   visual task.
10. Once the complete surface is approved, run the proportionate quality and
    accessibility checks together.

The worktree may contain intentional WIP from other surfaces. Preserve unrelated
changes and never reset or clean them.

## 9. Fresh-session prompt template

Copy this into a new chat and replace the bracketed values:

```text
We are continuing WalletChan's Warm Midnight extension redesign, one surface at
a time.

Read AGENTS.md, DESIGN.md, _docs/WARM_MIDNIGHT.md, _docs/STYLING.md, and the
relevant parts of _docs/IMPLEMENTATION.md before editing. If this surface uses
the mascot, also read _docs/MASCOT.md.

Surface for this session: [POSITIONS / ACTIVITY / SEND / SWAP / ETC.]
Current task: [ONE SMALL VISUAL OR INTERACTION CHANGE]

Preserve all wallet logic and both themes. The production extension is the
source of truth. Work one change at a time and wait for my visual review after
each change. During iteration, only run pnpm build:extension; do not run the
broader QA scripts or automatically open preview pages.
```

## 10. Surface file map

| Surface | Primary files |
| --- | --- |
| Brand/header | `BrandWordmark.tsx`, header composition in `App.tsx` |
| Unlock | `UnlockScreen.tsx`, `UnlockMascot.tsx`, `unlockMascotState.ts` |
| Account identity | `AccountSwitcher.tsx`, `AccountExplorerMenu.tsx`, `AccountNetworkControls.tsx` |
| Quick actions | `HomeQuickActions.tsx` |
| Dapp connection | `DappConnectionConfirmation.tsx`, `HomeDappDock.tsx`, `DappSiteIcon.tsx` |
| Connected dapps | `ConnectedDappsView.tsx`, `MoreActionsView.tsx` |
| Portfolio composition | `PortfolioTabs.tsx`, `PortfolioChart.tsx` |
| Asset rows/sheets | `PortfolioHoldingRows.tsx`, `TokenHoldings.tsx`, `tokenHoldingsUtils.ts` |
| Positions | `TokenHoldings.tsx` and its DeFi position row helpers |
| Activity/detail | transaction list components, `TxDetailScreen.tsx`, `TxDetailModal.tsx` |
| Shared mobile primitives | `components/ui/` |
| Midnight tokens | `theme/themes/midnight.ts`, `theme/recipes/`, `theme/tokens.ts` |

Use `rg` to confirm the current owners before editing; file boundaries may
continue to improve as oversized components are split.

## 11. Known documentation drift

- `IMPROVE_UI.md` describes the completed professional/mobile migration but not
  every later Warm Midnight brand decision.
- Its older Home target mentions a combined account/network summary; the current
  homepage intentionally has no global network selector.
- `IMPLEMENTATION.md` contains authoritative behavior, but its broad Homepage
  Layout inventory may lag the current visual composition.
- `THEMING_PRD.md` is rollout history, not the current screen-review backlog.
- Preview documentation describes the harness, not approval status. A preview
  route is not automatically evidence that it matches the current production
  screen.

When a surface is approved, update this document's decision and status sections
in the same workstream so the next chat does not depend on conversation history.

## 12. Changelog

- 2026-07-11: created the Warm Midnight surface handoff from the approved
  unlock, homepage identity, dapp, portfolio, asset-row, aggregation, and
  connected-dapp decisions; recorded Positions as the next review surface.
