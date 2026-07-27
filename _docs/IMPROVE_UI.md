# WalletChan UI Improvement Plan

> Status: All UI implementation phases complete; packaged automation green; manual release checks active
> Date: 2026-07-10
> Scope: Browser extension UI and navigation only

This document defines the next visual and interaction-design direction for the
WalletChan extension. The goal is to make WalletChan feel like a trustworthy,
polished mobile wallet while preserving its unusually capable feature set and
the existing Chakra UI architecture.

This is a design and presentation project. It must not change transaction,
signature, authentication, storage, message-passing, or crypto behavior.

Companion references:

- [`WARM_MIDNIGHT.md`](./WARM_MIDNIGHT.md): current screen-by-screen WalletChan
  branding decisions, approval status, and fresh-session handoff. This takes
  precedence over historical screen targets in this document.
- [`STYLING.md`](./STYLING.md): current theme token contract and historical
  Bauhaus specification.
- [`THEME.md`](./THEME.md): current Chakra theme engine and authoring rules.
- [`THEMING_PRD.md`](./THEMING_PRD.md): original Bauhaus/Midnight rollout and
  Midnight design brief.
- [`EXTENSION_PREVIEW.md`](./EXTENSION_PREVIEW.md): deterministic visual QA
  harness for popup, popup-window, and sidepanel sizes.
- [`IMPLEMENTATION.md`](./IMPLEMENTATION.md): extension architecture and
  message flows. Read before changing production screens.
- [`SECURITY.md`](./SECURITY.md): required checklist before committing any
  extension changes.

---

## 1. Executive decision

WalletChan does **not** need to migrate from Chakra UI to shadcn/ui.

The qualities people associate with shadcn can be expressed cleanly through
the existing Chakra theme factory and shared primitives:

- Low-chroma neutral surfaces
- Thin, low-contrast borders
- Compact, consistent control geometry
- Clear primary/secondary/tertiary action hierarchy
- Predictable focus, hover, loading, disabled, and error states
- Minimal shadows
- Progressive disclosure instead of nested containers
- Simple compositional primitives rather than page-specific styling

Replacing Chakra with Tailwind, Radix, and shadcn components would create a
large migration surface without fixing WalletChan's underlying problems. The
main problems are visual hierarchy, over-enclosure, inconsistent navigation,
and insufficient progressive disclosure.

The recommended direction is:

> **Quiet Capability**: calm financial tooling with a friendly identity.

WalletChan should feel powerful without looking busy, and approachable without
looking like a toy.

---

## 2. Product and brand commitment

- Artifact type: browser extension presented as a mobile-style financial app.
- Positioning: trustworthy consumer wallet with power-user depth.
- Audience: newcomers who need plain-language guidance and experienced users
  who need exact transaction data.
- Primary outcome: help the user understand and safely approve an action.
- Brand adjectives: trustworthy, calm, capable, approachable, exact.
- Aesthetic essence: **calm, guided, exact**.
- Single-minded proposition: **Understand what will happen before you approve.**
- Signature move: a consistent, human-readable **Outcome Card** on every
  transaction, signature, permission, swap, and batch flow.

The anime mascot is not the source of the current unprofessional feeling. Keep
it as a distinctive identity asset, but use it selectively:

- Avatar and account identity
- Empty states and onboarding moments
- Small brand moments and success states
- Never as the dominant visual on high-risk financial screens

High-risk screens should become more sober as the consequence of the action
increases.

---

## 3. What is currently going wrong

### 3.1 Too many strong edges

Many screens combine thick borders, raised surfaces, strong radii, shadows,
heavy type, and accent colors on the same component. This makes every region
feel equally important and creates visual fatigue.

The original Midnight brief already asks for 1px borders, sentence case,
generous whitespace, and restrained decoration. Inline component overrides
still reintroduce 2px, 3px, and 4px borders, uppercase labels, and heavy card
framing. The new work should enforce the brief structurally rather than rely on
screen-by-screen discipline.

### 3.2 Cards are used where spacing or a divider would work

Current screens frequently use:

- Cards inside cards
- Bordered rows inside bordered sections
- Bordered badges inside bordered rows
- A shadow and a strong border on the same element
- Separate containers for content that already belongs to the parent region

Use proximity, alignment, and subtle row separators before adding another
container.

### 3.3 Color is decorative instead of hierarchical

Midnight currently uses violet, blue, cyan, amber, green, and red prominently.
The number of saturated colors makes the interface feel more like a web3 theme
showcase than a dependable wallet.

The future palette should have one interactive hue, quiet neutral surfaces,
and semantic colors that appear only when they communicate meaning.

### 3.4 Desktop overlay patterns are squeezed into a mobile viewport

Large modals, fixed dropdowns, and scrollable popovers are currently used for
substantial tasks such as transaction details and token selection. The user is
forced to understand the relationship between the page, the overlay, the
overlay's internal navigation, and its dismissal behavior.

The extension viewport should be treated as the app window. Meaningful
destinations should become screens in a navigation stack.

### 3.5 Advanced capability is exposed too early

WalletChan often presents the protocol name, router, calls, calldata,
simulation tools, asset changes, and confirmation controls at the same visual
level. The information is valuable, but the sequence is wrong.

The default experience should answer:

1. What will happen?
2. What will leave or enter my wallet?
3. Who requested it, from which account, and on which network?
4. How much will it cost?

Only then should it expose individual calls and raw data.

---

## 4. What to transpose from `swiss-knife`

The ETH.sh faucet page is a useful Chakra reference because it feels composed
without relying on a different framework.

| ETH.sh pattern | WalletChan adaptation |
| --- | --- |
| 1px alpha borders | Default border for Midnight surfaces and controls |
| Neutral surface ramp | Reduce the current navy/violet cast and make elevation quieter |
| One enclosing surface | Group related wallet content without nested cards |
| Row separators | Use for assets, activity, calls, positions, settings, and pickers |
| Blue reserved for action | Use one WalletChan blue family for interactive emphasis |
| Green reserved for status | Use only for success, received assets, and safe states |
| Compact pills | Use for filters and status only, not every label |
| Progressive disclosure | Keep raw details and less-used controls behind expansion |
| Consistent focus rings | Centralize in the Chakra theme factory |

Do not copy the faucet page literally. WalletChan is a narrow, touch-like app,
not a desktop data table. In particular, do not copy its desktop page header,
table density, or typography unchanged.

---

## 5. Framework strategy: shadcn visual grammar on Chakra

Keep:

- React 18
- Chakra UI v2
- `ThemeTokens`
- `createChakraTheme()`
- `ThemeProvider`
- Existing intent token names
- Existing `ScreenStack`
- Existing business-logic props and handlers

Do not add:

- Tailwind solely for this redesign
- Radix as a second primitive system unless a specific Chakra accessibility
  limitation is demonstrated
- shadcn-generated component files
- A third theme ID for this work
- A new storage key

Implement shadcn-like consistency through Chakra:

1. Put base visual rules in `createTheme.ts`.
2. Keep theme-specific values in `themes/*.ts`.
3. Create a small WalletChan app-shell and list primitive layer.
4. Remove conflicting inline visual anatomy from consuming screens.
5. Prefer component variants and intent props over local style recipes.

This preserves the existing theme architecture and lets Bauhaus and Midnight
share behavior while keeping distinct visual personalities.

### 5.1 Official shadcn research findings

The useful shadcn ideas are broader than Tailwind classes or its default
neutral palette.

#### Open code and local ownership

The official project describes shadcn/ui as customizable, extensible, open
code intended to help teams build their own component library. The important
idea is ownership: applications are expected to adapt the components to their
product instead of treating a package's defaults as permanent.

WalletChan already has the right equivalent boundary. Its owned layer is the
Chakra theme factory plus WalletChan primitives. The redesign should improve
that layer instead of replacing it.

Source: [shadcn/ui repository](https://github.com/shadcn-ui/ui)

#### Semantic tokens before component styling

shadcn recommends semantic theme tokens and pairs every colored surface with a
known foreground, such as `primary` / `primary-foreground`, `card` /
`card-foreground`, and `popover` / `popover-foreground`. It also separates
`border`, `input`, and `ring` because those roles need different contrast.

WalletChan already has most of this model through `surface.*`, `fg.*`,
`accent.*`, `accentFg.*`, `status.*`, `border.*`, and `chart.*`. Preserve that
advantage and tighten the following rules:

- Never guess text color on an accent or status surface; use the paired
  foreground token.
- Treat input boundaries and focus rings as separate intents from resting
  card borders, even if their initial raw values match.
- Treat floating surfaces as a distinct visual role. First derive this in
  `createTheme.ts`; add a new theme-contract field only if cards and floating
  overlays cannot share a token without compromise.
- Do not introduce a parallel shadcn-style CSS-variable token system. The
  current `ThemeTokens` contract is WalletChan's semantic source of truth.

Source: [shadcn theming and token convention](https://ui.shadcn.com/docs/theming)

#### A controlled radius scale

shadcn derives component radii from one base radius instead of independently
tuning every component. WalletChan should apply the same discipline while
retaining theme-specific anatomy:

- One base control radius
- One derived top-level surface radius
- `full` only for genuine pills, avatars, and round identity marks

The implementation may continue exposing the current Chakra radius names, but
their values should derive from this smaller system rather than becoming six
unrelated design decisions.

Source: [shadcn radius scale](https://ui.shadcn.com/docs/theming#radius-scale)

#### Compose anatomy instead of adding prop-heavy monoliths

Current shadcn components such as `Item`, `Field`, `Dialog`, and `Empty` expose
small semantic slots. This gives product screens a stable anatomy without
forcing every use case into one rigid component.

Use the same approach in WalletChan:

```text
ListItem
├── ListItemMedia
├── ListItemContent
│   ├── ListItemTitle
│   └── ListItemDescription
├── ListItemMeta
└── ListItemActions
```

```text
FormField
├── FormFieldLabel
├── Input / Select / Switch / Slider
├── FormFieldDescription
└── FormFieldError
```

```text
EmptyState
├── EmptyStateHeader
│   ├── EmptyStateMedia
│   ├── EmptyStateTitle
│   └── EmptyStateDescription
└── EmptyStateActions
```

Prefer these composable responsibilities over a `WalletRow` or `WalletCard`
with dozens of optional styling and content props.

Sources: [shadcn Item](https://ui.shadcn.com/docs/components/base/item),
[shadcn Field](https://ui.shadcn.com/docs/components/base/field),
[shadcn Empty](https://ui.shadcn.com/docs/components/base/empty)

#### Separate content items from form fields

shadcn explicitly distinguishes an `Item`, which presents media, content, and
actions, from a `Field`, which presents an input with its label, description,
and validation.

Apply that distinction consistently:

- Assets, positions, activity, settings links, accounts, networks, tokens,
  calls, and connected dapps are list items.
- Passwords, amounts, slippage, RPC URLs, toggles, selectors, and editable
  permission limits are fields.
- Do not style a field like a settings navigation row.
- Do not wrap every list item in an input-like outlined container.

The default list-item variant should be transparent. Add an outline only for a
real selectable choice card or when the item must stand independently.

#### Variants encode hierarchy

shadcn's Button exposes a small, predictable variant and size matrix, including
default, outline, secondary, ghost, destructive, link, icon sizes, and loading
content. The lesson is not the exact names; it is that hierarchy and state live
in the component recipe rather than in each caller.

WalletChan should keep its intent-oriented Chakra variants but make them
equally strict:

- `primary`: one highest-emphasis action per screen
- `secondary`: lower-emphasis filled or tonal action
- `outline`: neutral action needing a visible boundary
- `ghost`: compact toolbar or row action
- `danger`: destructive action, normally quiet until a destructive
  confirmation surface
- `link`: navigation or external destination with link semantics
- Explicit icon-only sizes with consistent hit areas
- Standard spinner placement and loading labels

Do not turn an anchor into a button semantically. Explorer and external-site
destinations remain links even when visually styled as controls.

Source: [shadcn Button](https://ui.shadcn.com/docs/components/base/button)

#### Overlay components have narrow jobs

shadcn defines Dialog as a modal window that makes underlying content inert,
and Sheet as complementary content entering from an edge. These definitions
support the presentation taxonomy in Section 7:

- Dialog is for a focused, blocking decision.
- Sheet/Drawer is for contextual complementary content.
- Neither is the default navigation mechanism for substantial destinations.
- A full-screen WalletChan picker remains a screen even if a shadcn example
  would use `CommandDialog` on desktop.

Sources: [shadcn Dialog](https://ui.shadcn.com/docs/components/base/dialog),
[shadcn Sheet](https://ui.shadcn.com/docs/components/radix/sheet)

#### Command is a useful internal picker anatomy

The shadcn Command component composes an input, scrollable list, empty state,
groups, items, separators, and optional shortcuts. That is a strong internal
model for WalletChan's full-screen token, chain, account, recipient, and
settings search screens.

Transpose the anatomy, not the desktop dialog presentation:

```text
FullScreenPicker
├── AppHeader
├── PickerSearch
└── PickerList
    ├── PickerEmpty
    ├── PickerGroup
    │   └── PickerItem
    └── PickerSeparator
```

Source: [shadcn Command](https://ui.shadcn.com/docs/components/base/command)

#### Empty, loading, and error states are reusable components

shadcn now treats Empty, Spinner, Skeleton, FieldError, and CommandEmpty as
first-class component families. WalletChan should do the same. A polished
wallet cannot rely on ad hoc centered text for missing assets, unavailable
portfolio APIs, no search results, an empty activity history, or unsupported
simulation.

Each state should preserve the layout it belongs to and provide the next
useful action where one exists.

Source: [shadcn Empty](https://ui.shadcn.com/docs/components/base/empty)

### 5.2 shadcn-to-Chakra translation table

| shadcn concept | WalletChan Chakra implementation |
| --- | --- |
| Semantic CSS variables | Existing `ThemeTokens` contract and Chakra token projection |
| Foreground/background pairs | Existing `accentFg.*`, `status.*.fg`, and explicit component foreground rules |
| Base radius with derived scale | Theme-specific control radius plus derived surface radius |
| Button variants | Chakra Button recipes in `createTheme.ts` |
| `Item` / `ItemGroup` | `ListItem` slots, `ListSurface`, and subtle separators |
| `Field` / `FieldGroup` | Evolved `ThemedField` or new semantic field slots |
| `Dialog` | Chakra Modal reserved for blocking decisions |
| `Sheet` / `Drawer` | Chakra Drawer-based `ActionSheet` for short contextual tasks |
| `Command` | Internal anatomy of `FullScreenPicker`, not a desktop dialog |
| `Empty`, `Spinner`, `Skeleton` | Shared state primitives and layout-mirroring skeletons |
| Open component source | WalletChan-owned primitives rather than a new dependency layer |

### 5.3 What not to copy from shadcn

- Do not copy its default neutral theme verbatim; WalletChan still needs a
  recognizable identity.
- Do not import Tailwind, `cn`, or class-variance-authority merely to match its
  implementation syntax.
- Do not recreate every shadcn component. Build only the WalletChan primitives
  required by real screens.
- Do not use Card as the universal layout primitive just because it exists.
- Do not use CommandDialog for long pickers in the narrow extension viewport.
- Do not use Sheet for hierarchical navigation.
- Do not assume a primitive's default behavior is correct without testing
  Chakra focus management, keyboard behavior, and screen-reader output.
- Do not let the recognizable "default shadcn app" become WalletChan's new
  form of visual sameness.

---

## 6. Visual direction: Midnight V2

Midnight remains the default theme. This is a retune of the existing Midnight
theme, not a new theme.

### 6.1 Color strategy

Use an approximately 85/10/5 distribution:

- 85% neutral surfaces and text
- 10% WalletChan action blue
- 5% status, WCHAN amber, and exceptional emphasis

Provisional starting palette for visual exploration:

| Intent token | Starting value | Role |
| --- | --- | --- |
| `surface.base` | `#090B10` | App background |
| `surface.raised` | `#10141B` | Primary sections and floating surfaces |
| `surface.raisedHover` | `#171C25` | Hover and selected neutral state |
| `surface.sunken` | `#06080C` | Inputs, code, recessed regions |
| `surface.overlay` | `rgba(2, 4, 8, 0.82)` | True modal overlay only |
| `surface.accentTint` | `#151D2B` | Outcome Card and rare highlighted neutral surface |
| `fg.primary` | `#F1F5F9` | Primary content |
| `fg.secondary` | `#AAB3C1` | Labels and supporting content |
| `fg.muted` | `#778191` | Placeholders and tertiary metadata |
| `border.subtle` | `rgba(255,255,255,0.06)` | Row separators |
| `border.default` | `rgba(255,255,255,0.10)` | Controls and top-level surfaces |
| `border.strong` | `rgba(255,255,255,0.16)` | Selected and emphasized neutral boundaries |
| `border.focus` | `#60A5FA` | Focus indication |
| `accent.primary` | `#2F6FED` | Primary CTA; white label contrast is approximately 4.55:1 |
| `accent.secondary` | `#60A5FA` | Links, selection, secondary interactive emphasis |
| `accent.highlight` | `#F5B544` | WCHAN and rare attention moments |
| `chart.positive` | `#34D399` | Receive and positive change |
| `chart.negative` | `#F87171` | Send, failure, and destructive text |

These are starting values, not merge-ready values. Validate them in the
preview harness across real content, both normal and increased contrast, before
promoting them.

Color rules:

- Remove electric violet as the primary action color.
- Use one blue family for action, links, focus, and selection.
- Amber must not become a second general CTA color.
- Token and chain logos may keep their brand colors.
- Status colors must always include an icon or label; color is not the only
  signal.
- Charts may use multiple series colors, but surrounding UI must stay neutral.
- Do not use colored glows for cards or modals.

### 6.2 Borders, surfaces, and elevation

Midnight rules:

- Standard border: 1px.
- Row separator: 1px using `border.subtle`.
- Strong border: still 1px, using `border.strong`.
- Focus ring: a separate 2px or 3px box-shadow ring, not a thicker resting
  border.
- Top-level content may have one enclosing surface.
- Child rows normally use no enclosing border.
- Use either a defined edge or a floating shadow, not both.
- Use surface lightness for elevation before adding a shadow.
- Reserve large shadows for true floating layers.
- Preserve literal black/white physical surfaces only where required, such as
  a QR code tile.

Exceptions that may use a 2px boundary:

- High-contrast keyboard focus when the standard ring is insufficient
- QR or scanning surfaces
- Token/chain logo isolation where transparent art needs a visible ring
- Explicit danger confirmation where contrast testing requires it

No standard card, input, picker, settings row, asset row, or confirmation
section should use a 3px or 4px border in Midnight.

### 6.3 Radius

Use two main radius values:

- Controls and compact rows: 8px
- Top-level surfaces and sheets: 12px

Use `full` only for avatars, token icons, status dots, and true pills. Avoid a
different radius for every component class.

### 6.4 Shadows

- Resting cards: none.
- Interactive raised surfaces: optional small neutral shadow.
- Modal/sheet: one soft neutral shadow, no colored glow.
- Buttons: no permanent large shadow.
- Hover: border or surface change first; avoid lifting every control.

### 6.5 Typography

Do not make a font migration a prerequisite for the first redesign pass.

Keep Outfit initially, but change its usage:

- 900: wordmark only.
- 700: page title or primary financial amount only.
- 600: section title, button, selected item.
- 500: labels and important metadata.
- 400: normal descriptions and supporting text.
- Uppercase: token symbols, acronyms, and rare short technical labels only.
- Sentence case: navigation, headings, settings, actions, warnings, and
  confirmation copy.
- Mono: addresses, hashes, calldata, non-human-readable IDs, and aligned raw
  values only.
- Use tabular numerals for balances, fiat values, gas, and timestamps.

After the structural redesign, test a separate body face only if Outfit still
feels too playful. Do not mix a font experiment into the navigation migration.

### 6.6 Iconography

- Standardize on one 20px/24px grid and one stroke weight.
- Prefer Lucide for new shell and navigation icons.
- Keep chain, token, dapp, protocol, and mascot artwork as full-color identity
  assets.
- All icon-only controls need a visible tooltip where appropriate and an
  accessible name.
- The hit area must be at least 40px and should be 44px for primary mobile-like
  controls.

---

## 7. Mobile app navigation model

The popup or sidepanel viewport is the app window. Do not layer desktop-style
navigation inside it.

### 7.1 Presentation taxonomy

| User intent | Presentation | Examples |
| --- | --- | --- |
| Navigate to a feature or inspect substantial content | Full-screen push | Settings section, account management, transaction details, WalletConnect session |
| Search or select from a long list | Full-screen picker | Token, chain, account, recipient, dapp connection |
| Complete a high-consequence action | Dedicated full-screen flow | Transaction, signature, permission, batch confirmation |
| Select from 2-6 simple contextual options | Bottom action sheet | Sort, chart range, small filter, quick account action |
| Reveal optional detail in the current task | Inline disclosure | Fee breakdown, calls, raw calldata, simulation source |
| Confirm a destructive exceptional action | Dialog or alert | Reset extension, delete account, clear sensitive state |
| Acknowledge background feedback | Inline status or toast | Saved preference, refreshed portfolio, transient failure |

Rules:

- A scrollable content destination is not a dropdown.
- A screen used for navigation is not a modal.
- Do not open a modal from another modal.
- Do not use a bottom sheet for a multistep flow.
- Modals should normally contain one decision and no internal navigation.
- Full-screen pickers close by selection or Back, not by clicking an overlay.

### 7.2 Screen shell

Create a shared screen composition with these roles:

- `AppScreen`: full-height viewport and safe overflow rules.
- `AppHeader`: Back, title, and at most one contextual trailing action.
- `ScreenBody`: the only scrolling region.
- `StickyActionBar`: fixed/sticky bottom actions with surface separation.
- `ScreenSection`: spacing and optional label, not automatically a card.

Recommended narrow-screen geometry:

- Header: 52-56px.
- Horizontal gutter: 16px.
- Compact row height: 48-56px.
- Standard row height: 56-64px.
- Primary action: at least 44px high.
- Sticky action bar: 12-16px padding plus safe inset.

### 7.3 Motion

The current screen stack already preserves mounted screen snapshots and honors
reduced motion. Reuse it.

Update its visual grammar:

- Forward navigation: horizontal push from the right.
- Back navigation: current screen exits to the right, revealing its parent.
- Root/auth change: short fade.
- Sheet: vertical motion from the bottom.
- Duration: approximately 180-240ms.
- Animate transform and opacity only.
- Preserve scroll position when returning to a parent screen.
- Under reduced motion, use an immediate transition or short opacity change.

Vertical full-screen slides should be reserved for sheet-like presentation,
not normal hierarchy navigation.

### 7.4 Responsive modes

Validate at the existing preview sizes:

- Popup: 360x600
- Popup window: 480x720
- Sidepanel: 420x760

The primary interaction model stays single-column in all three. Larger
fullscreen/tab modes may center the app rail or use master-detail for activity
and settings, but must not introduce a different navigation vocabulary.

---

## 8. Progressive disclosure model

All transaction-like experiences should use the same information order.

### Layer 1: Outcome

One plain-language sentence describing the expected result.

Examples:

- `Swap 2 USDC for at least 0.00113 ETH`
- `Supply 1 USDC to Aave`
- `Allow 1inch to spend up to 2 USDC`
- `Sign in to app.example`
- `Delegate limited USDC spending until Friday`

### Layer 2: Financial impact

- Assets sent
- Assets received
- Approval or permission limit
- Estimated fee
- Net balance change

### Layer 3: Context and trust

- Requesting dapp and exact origin
- Account
- Network
- Recipient or spender
- Simulation state
- Risk state and reason

### Layer 4: Advanced detail

- Individual batch actions
- Router and contract names
- Raw addresses
- Gas parameters
- Calldata
- Typed data JSON
- Tenderly and explorer tooling

Technical data is never removed. It is placed behind a predictable
`Advanced details` disclosure or dedicated screen.

Copy translations to prefer:

| Current technical label | Default user-facing label |
| --- | --- |
| Calls | Actions |
| Calldata Digest | Technical details |
| Chain RPCs | Network connections |
| AggregationRouterV6 | 1inch router, with contract name secondary |
| Private Key | Imported account, with `Private key stored locally` secondary |
| Seed Phrase | Recovery phrase account |
| WalletConnect dapp connected | Connected apps |

Do not hide the precise technical term when it affects safety. Show it as
secondary text or inside advanced details.

---

## 9. Chakra component and primitive plan

### 9.1 Theme-level components

Centralize complete state matrices in `createTheme.ts` for:

- Button
- IconButton
- Input and Textarea
- Checkbox, Radio, Switch, and Slider
- Tabs
- Menu and Popover
- Modal and Drawer
- Badge and Alert
- Tooltip

Each interactive component must define:

- Default
- Hover
- Active/pressed
- Focus-visible
- Disabled
- Loading where applicable
- Invalid/error where applicable
- Selected where applicable

### 9.2 Shared app primitives

Introduce or evolve shared visual primitives instead of styling each screen:

- `AppScreen`
- `AppHeader`
- `ScreenBody`
- `StickyActionBar`
- `ScreenSection`
- `ListSurface`
- `ListRow`
- `StatusBadge`
- `OutcomeCard`
- `AssetDeltaRow`
- `InlineDisclosure`
- `FullScreenPicker`
- `ActionSheet`
- `EmptyState`
- `SkeletonRow`

These names describe responsibilities, not colors. They must consume intent
tokens and work in every registered theme.

Where a primitive has meaningful internal anatomy, expose composable slots as
described in Section 5.1. Avoid large prop matrices that mix content,
interaction, and visual overrides.

### 9.3 Surface rules

- `ListSurface` may have one outer 1px border.
- `ListRow` uses a bottom separator and normally has no individual border.
- `ScreenSection` is spacing-first and unboxed by default.
- `OutcomeCard` is the one deliberately emphasized information surface.
- Inputs have their own control boundary; do not wrap every input in another
  bordered card.
- Buttons are ranked by importance rather than colored by meaning.
- One primary filled button per screen or sticky action region.

### 9.4 Frozen Phase 2 primitive contract

The Phase 2 primitives are layout and interaction anatomy only. They accept
renderable content and callbacks, never wallet, chain, transaction, storage,
or message-handler state. Production controllers remain the owner of all
domain behavior.

#### Screen composition

```tsx
<AppScreen>
  <AppHeader title="..." onBack={...} trailing={...} />
  <ScreenBody>
    <ScreenSection title="..." description="...">...</ScreenSection>
  </ScreenBody>
  <StickyActionBar
    secondaryAction={...}
    primaryAction={...}
  />
</AppScreen>
```

- `AppScreen` is a full-height, overflow-hidden flex column.
- `ScreenBody` is the only vertical scroll owner and carries
  `data-screen-scroll-owner` for navigation restoration.
- `ScreenSection` is an unboxed semantic `section`; title and description IDs
  are generated and connected through `aria-labelledby` / `aria-describedby`.
- `AppHeader` is 56px tall. Its Back control is a native 44px button. Its
  `h1` carries `data-screen-heading`, `tabIndex={-1}`, and an optional ref so
  navigation can move focus without placing the heading in normal tab order.
- `AppHeader.trailing` contains at most one contextual action.
- `StickyActionBar` is a non-scrolling sibling of `ScreenBody`, includes the
  bottom safe-area inset, and accepts one primary action plus at most one
  secondary action. The actions themselves retain native button semantics.

#### List anatomy

```tsx
<ListSurface>
  <ListItem as="button" ...>
    <ListItemMedia />
    <ListItemContent>
      <ListItemTitle />
      <ListItemDescription />
    </ListItemContent>
    <ListItemMeta />
    <ListItemActions />
  </ListItem>
</ListSurface>
```

- The surface owns the single outer edge; items own separators only.
- A non-interactive item is a row. An interactive item must render as a native
  `button` or `a`; adding click behavior to a plain `div` is not supported.
- Compact and standard density change spacing, never information hierarchy.
- Selected state uses background/border/icon cues without changing font
  weight. Disabled state remains readable and non-interactive.

#### Empty and loading anatomy

- `EmptyState` exposes media, title, description, and action slots. Media is
  optional; an ornamental icon is never injected by default.
- `SkeletonRow` mirrors list-row media, text, and metadata geometry and uses
  Chakra's reduced-motion-aware skeleton behavior.

#### Overlay and picker anatomy

- `ActionSheet` is a bottom Drawer for two to six single-step choices. Each
  choice is a native button with optional media, description, selection, and
  destructive emphasis. Escape/backdrop dismissal and `finalFocusRef` are
  explicit. It cannot own a multistep flow.
- `FullScreenPicker` is screen composition, not a Modal. Search, optional
  horizontal scopes, labelled groups, rows, loading, and empty content are
  composable slots. Domain adapters own filtering and selection data; the
  primitive owns only layout, focus, and semantics.

#### Navigation behavior

- Forward hierarchy uses an x-axis push from the right. Back exits the current
  screen to the right. Auth/root replacement uses a fade.
- The covered layer is inert and `aria-hidden` during movement.
- Forward completion focuses the new `data-screen-heading`. Back restores the
  prior screen's scroll owner and previous focus path, falling back to its
  heading.
- Reduced motion replaces travel with a short opacity transition.
- Shared exports come only from `components/ui/index.ts`; consumers must not
  import recipe internals or add screen-specific branches to primitives.

---

## 10. Screen-by-screen target state

### 10.1 Unlock

- Compact brand mark, not a large framed mascot composition.
- Visible password label.
- Biometric is primary when available.
- Password remains available as the secondary method.
- Add a quiet local-encryption trust statement.
- Remove creator/social promotion from the authentication surface.
- Use one primary form surface with thin or no outer border.

### 10.2 Home

- Compact account header with account, address, and network.
- Balance becomes the primary top-level value.
- Stable quick-action row: Receive, Send, Swap, More.
- Connected dapps become a quiet contextual status row.
- Remove or demote the permanent `$WCHAN / WalletChan OS` marketing banner.
- Separate Assets, Positions, and Activity at the root level.
- Use simple asset and position rows with separators.
- Keep charts secondary to the balance and holdings.

### 10.3 Settings

- Replace large category cards with grouped list rows.
- Suggested groups: Wallet, Security, Networks & dapps, Data & privacy, About.
- Move version, author, and external social links into About.
- Search may reveal on demand or remain a quiet field under the header.
- Every detail destination is a pushed screen with Back.

### 10.4 Transaction and activity details

- Convert the scrollable modal into a full-screen detail destination.
- Header: Back, `Transaction`, Explorer action.
- Lead with human-readable intent and status.
- Show asset deltas as simple rows.
- Show protocol, recipient, network, timestamp, and fee next.
- Put raw transaction fields and calldata under Advanced details.
- Remove duplicate Close and X actions.

### 10.5 Swap and bridge

- Keep Swap/Bridge as a dedicated full-screen flow.
- Replace the token dropdown/fixed overlay with a full-screen picker.
- Picker order: search, network scope, recent/popular, user assets, low-value
  assets.
- Use rows rather than a card for each token.
- Token selection returns to the previous screen immediately.
- Network selection uses the same picker grammar.
- Route, slippage, price impact, and provider are secondary disclosures unless
  they require attention.

### 10.6 Transaction confirmation

- Outcome Card first.
- Asset changes and approval limits second.
- Origin, account, network, and fee third.
- Simulation/risk status sits immediately above the sticky action bar when it
  affects the decision.
- Calldata and advanced gas details are collapsed by default.
- Reject is secondary; Confirm is the single primary action.

### 10.7 Batch confirmation

- Present the batch as one user intent when it can be decoded.
- Say `2 actions`, not `2 calls`, by default.
- Show aggregate asset changes before the action list.
- Individual actions use collapsible rows.
- Contract addresses and raw calls are advanced details.
- Tenderly is a secondary technical tool, not a competing CTA.
- Keep the sticky Reject/Confirm action region stable while content scrolls.

### 10.8 Signature and delegated permissions

- Explain what the signature enables before showing its schema.
- Clearly distinguish sign-in, typed-data authorization, token approval, and
  delegated permission.
- Show scope, amount, duration, dapp, delegate, and revocation path plainly.
- Keep raw typed data available under Advanced details.

### 10.9 Account and network pickers

- Use full-screen searchable lists when the set can grow.
- Use checkmarks for selected state rather than another strong colored card.
- Show wallet type in plain language with exact technical detail secondary.
- Preserve copy and explorer actions for every displayed address.

---

## 11. Implementation sequence

Each phase should be independently reviewable and should not combine a logic
refactor with visual work.

### Phase 0: Baseline and UX inventory

1. Capture every existing preview route in all three frame sizes and both
   themes.
2. Inventory every Modal, Drawer, Menu, Popover, and fixed overlay.
3. Classify each against the presentation taxonomy in Section 7.
4. Inventory inline `border`, `borderWidth`, `boxShadow`, `borderRadius`,
   `textTransform`, and raw color overrides in extension UI files.
5. Record current empty, loading, error, disabled, and long-content states.

Deliverable: screenshot baseline and overlay migration matrix.

### Phase 1: Midnight V2 foundation

1. Retune Midnight colors, borders, radii, shadows, and focus treatments.
2. Update Chakra base styles and component variants.
3. Remove colored modal/focus glow where it adds visual noise.
4. Make resting cards shadowless by default.
5. Add temporary preview controls for inspecting component states.

Deliverable: token and component-state visual review with no screen restructuring.

### Phase 2: App shell and navigation primitives

1. Add shared screen/header/body/action-bar/list primitives.
2. Change hierarchical navigation to horizontal push motion.
3. Define bottom action sheet behavior for small contextual choices.
4. Add preview examples for full-screen picker, detail screen, and action sheet.

Deliverable: reusable mobile-style navigation vocabulary.

### Phase 3: Pilot vertical slice

Use three screens to prove the system before touching the entire extension:

1. Transaction details: modal to full-screen detail.
2. Swap token selector: fixed overlay to full-screen picker.
3. Settings root: large cards to grouped list.

These cover read-only detail, searchable selection, and hierarchy navigation.

Deliverable: approved interaction grammar and resolved token adjustments.

### Phase 4: Trust-critical confirmations

1. Single transaction
2. Batch transaction
3. Cross-dapp batch
4. Signature request
5. ERC-7715 permission
6. Add-chain and watch-asset confirmations

Introduce the shared Outcome Card and progressive-disclosure hierarchy.

Deliverable: consistent high-risk decision experience.

### Phase 5: Home and primary actions

1. App header
2. Account and network summary
3. Balance and action row
4. Assets, Positions, and Activity hierarchy
5. Send
6. Swap/Bridge shell
7. WalletConnect and connected-app status

Deliverable: polished daily-use experience.

### Phase 6: Unlock, accounts, and settings details

1. Unlock and biometric states
2. Account switcher and account management
3. Security settings
4. Network connections
5. Data/privacy settings
6. About screen

Deliverable: coherent setup and management experience.

### Phase 7: Remaining screens and polish

1. Chat
2. Token hiding and custom-token flows
3. Empty/loading/error states
4. Toast and feedback audit
5. Keyboard and reduced-motion audit
6. Long text, large values, unknown token, and missing metadata stress tests

Deliverable: complete visual QA and documentation sync.

### 11.1 Atomic task contract

The phase list above is the macro roadmap. The tables below are the execution
backlog. One task ID should normally equal one reviewable commit. Update each
task status in this document as work proceeds: `todo`, `active`, `done`, or
`blocked`.

Every implementation task uses this checklist:

- [ ] Dependency APIs are already merged and frozen.
- [ ] The diff contains one concern and only the allowed files.
- [ ] A deterministic preview route/scenario exists for the changed surface.
- [ ] Both themes and all three preview frames were reviewed.
- [ ] Keyboard, focus, reduced-motion, long-copy, and relevant error states
  were checked.
- [ ] `pnpm lint` passes at the repository's accepted baseline.
- [ ] `pnpm typecheck:extension` and `pnpm typecheck:extension:qa` pass.
- [ ] `pnpm --filter @walletchan/extension build:preview` passes.
- [ ] `pnpm build:extension` passes before the task is committed.
- [ ] Real extension and wallet-type checks were run when the task touches an
  auth, transaction, signature, permission, swap, or batch flow.
- [ ] `_docs/SECURITY.md` was read before committing extension code.
- [ ] Relevant UI/theme/preview docs and this task status were updated.

Verification shorthand used below:

- `L`: extension lint.
- `T`: extension typecheck after P0-10.
- `P`: preview build.
- `E`: full extension build.
- `V`: both themes at 360x600, 480x720, and 420x760.
- `A`: keyboard/accessibility manual check plus automated scan after P0-09.
- `W`: required real-wallet/runtime matrix.
- `R`: targeted `rg` visual-override audit.

### 11.2 Multi-agent execution rules

Parallelism begins only after the shared dependency for a wave is merged.

- One integration owner exclusively owns shared hotspots:
  `createTheme.ts`, theme token files, `ScreenTransition.tsx`, top-level
  `App.tsx` routing, preview registry/types/config, lockfile, shared barrel
  exports, docs, and phase-gate commits.
- Each worker receives exactly one task ID and an explicit file allowlist.
- No two workers edit the same file, even when their JSX changes look trivial.
- Workers create screen-local components and fixtures. The integration owner
  wires shared routes, barrels, and preview registration.
- Workers report touched files, commands run, preview scenario IDs, and known
  gaps. They do not use `git add -A`, reset, clean, checkout, or rewrite other
  agents' work.
- Shared filesystem edits are already visible. Never cherry-pick another
  worker's commit into the same workspace.
- Do not run simultaneous builds or screenshot updates that write to the same
  output directory. The integration owner queues them.
- Pause parallel work whenever a shared primitive API changes. Resume only
  after the new API is merged and announced.
- For trust-critical files over roughly 400 lines, first land a
  behavior-preserving controller/presentation seam, then land the visual
  restructure as a separate task. Do not mix extraction and redesign in one
  unreviewable diff.
- If a UI task discovers a needed storage, message, signing, or crypto change,
  the worker stops and reports it. It does not widen scope.

Recommended concurrency with four agent slots:

1. Integration owner: shared APIs, routing, review, combined builds.
2. Worker A: one bounded screen or recipe.
3. Worker B: a disjoint screen or recipe.
4. Worker C: a disjoint screen, fixtures, or read-only audit.

### 11.3 Dependency graph

```text
Phase 0 baseline
  -> Phase 1 tokens and Chakra recipes
    -> Phase 2 shell/navigation/list/picker primitives
      -> Phase 3 three-track pilot
        -> interaction grammar approval
          -> Phase 4 confirmations
          -> Phase 5 home/actions
          -> Phase 6 unlock/accounts/settings
            -> Phase 7 remaining screens and release QA
```

Phases 4, 5, and 6 may overlap after the Phase 3 gate, but tasks within them
must still respect shared component and `App.tsx` ownership.

### 11.4 Phase 0 task backlog: baseline and tooling

| ID | Status | Task | Depends on | Main scope | Done/verify | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| P0-01 | done | Preview harness health check | None | `preview/*`, preview config | Registry-derived routes render through the automated theme/frame/wallet matrix; limitations recorded. `P,V` | Wave 0 |
| P0-02 | done | Complete screen/view registry | None | Read-only `App.tsx`, nested settings/account views; this doc | Every destination has owner, entry, depth, scroll owner, consequence, wallet coverage. | Wave 0 |
| P0-03 | done | Overlay migration matrix | None | Read-only Modal/Menu/Popover/fixed-overlay inventory; this doc | Every overlay classified as dialog, action sheet, disclosure, picker, or screen. `R` | Wave 0 |
| P0-04 | done | Visual override inventory | None | Read-only extension UI scan; this doc | Reproducible counts for thick borders, shadows, radius, uppercase, weight 900, raw colors, inline overlay anatomy. `R` | Wave 0 |
| P0-05 | done | State and accessibility matrix | None | Read-only screens/fixtures; this doc | Empty/loading/error/disabled/selected/long-copy/missing-data/keyboard/wallet states mapped. | Wave 0 |
| P0-06 | done | Make preview state URL-addressable | P0-01, P0-05 | Preview state/types/router | `theme`, `frame`, `scenario`, and `wallet` reproduce on reload; no real RPC/API/signing. `L,P,V` | Serial shared file |
| P0-07 | done | Close baseline route gaps | P0-02, P0-06 | Preview screens/fixtures | Production-backed routes cover transaction detail, settings, swap/pickers, daily use, onboarding, account and token management. `L,P,V` | Fixture files parallel; registry serial |
| P0-08 | done | Component-state laboratory | P0-04, P0-06 | New preview composition | Production recipes show default/focus/disabled/loading/error/selected states. `L,P,V,A` | Parallel with P0-07 |
| P0-09 | done | Visual/a11y automation decision and setup | P0-06 | Test config, scripts, lockfile | Registry-derived Playwright + axe audit produces deterministic PNG/JSON/HTML output; 235/235 smoke states pass. | Serial |
| P0-10 | done | Independent extension typecheck | None | Extension scripts/tsconfig | Scoped UI, full extension source, and QA-script strict checks pass without blanket suppressions. `T` | Serial shared config |
| P0-11 | done | Capture/index baseline | P0-07 through P0-10 | Screenshot artifacts and index | Automated smoke creates 75 named screenshots and an indexed report using route/scenario/wallet/theme/frame IDs. | Serial capture |
| P0-GATE | done | Freeze Phase 1 acceptance criteria | P0-02 through P0-11 | This doc | Target metrics and exclusions are recorded; the extension source and UI QA scripts have independent strict gates. | Gate |

Phase 0 is an ideal parallel research wave: assign P0-02, P0-03, and
P0-04/P0-05 to three read-only agents, then let the integration owner merge
their findings.

### 11.5 Phase 1 task backlog: Midnight V2 foundation

| ID | Status | Task | Depends on | Main scope | Done/verify | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| P1-01 | done | Split Chakra recipes without visual change | P0-GATE | `createTheme.ts`, new `theme/recipes/*` | Factory becomes orchestration-focused and under about 400 lines; baseline unchanged. `L,T,P,V` | Serial enabler |
| P1-02 | done | Retune Midnight color hierarchy | P0-GATE | `themes/midnight.ts`, contrast tests | Neutral ramp and action blue adopted; violet removed from general action UI; paired contrast recorded. `L,T,P,V` | Parallel with P1-01 |
| P1-03 | done | Retune Midnight geometry/elevation/motion | P1-02 | `themes/midnight.ts` | 8px controls, 12px top surfaces, neutral modal shadow, shadowless resting cards, explicit transition properties. `L,T,P,V` | Same owner as P1-02 |
| P1-04 | done | Action recipes | P1-01, P1-03 | `recipes/actions.ts` | Button/IconButton hierarchy and all states complete; target sizes consistent. `L,T,P,V,A` | Recipe wave A |
| P1-05 | done | Form recipes | P1-01, P1-03 | `recipes/forms.ts`, field primitive if needed | Input/Textarea/Select/Checkbox/Radio/Switch/Slider geometry, focus, invalid, disabled states complete. `L,T,P,V,A` | Recipe wave A |
| P1-06 | done | Selection/navigation recipes | P1-01, P1-03 | `recipes/selection.ts` | Tabs/Menu/Popover/Tooltip states and restrained floating-surface anatomy complete. `L,T,P,V,A` | Recipe wave A |
| P1-07 | done | Feedback/overlay recipes | P1-01, P1-03 | `recipes/feedback.ts`, `recipes/overlays.ts` | Badge/Alert/Modal/Drawer/Spinner use paired colors, neutral elevation, accessible focus. `L,T,P,V,A` | Recipe wave B |
| P1-08 | done | Align existing theme primitives | P1-03 | `ThemedCard`, `ThemedPanel`, `IconBox` | No panel-card nesting recommendation; Midnight default surface is quiet; Bauhaus remains deliberate. `L,T,P,V,R` | Parallel with recipes |
| P1-09 | done | Refresh component laboratory | P1-04 through P1-08 | Component-state preview | All recipes, long labels, loading labels, focus, errors, selection represented. `L,T,P,V,A` | Integration |
| P1-GATE | done | Foundation regression and docs | P1-09 | Theme/style docs | Full default screenshot matrix approved; theme switching has no flash; no new ID/storage key. `L,T,P,E,V,R` | Gate |

After P1-01, three workers can own P1-04, P1-05, and P1-06 while the
integration owner completes P1-02/P1-03. No worker edits `createTheme.ts` or
`midnight.ts` during that wave.

### 11.6 Phase 2 task backlog: app primitives and navigation

App-level primitives belong in `apps/extension/src/components/ui/`; theme
primitives remain the token/recipe layer.

| ID | Status | Task | Depends on | Main scope | Done/verify | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| P2-00 | done | Freeze primitive API/semantics | P1-GATE | This doc | Slots, refs, DOM roles, spacing/scroll ownership, focus, safe inset, exports approved. | Serial enabler |
| P2-01 | done | `AppScreen`, `ScreenBody`, `ScreenSection` | P2-00 | New `components/ui` files | One scroll owner, full-height flex, 16px gutter, unboxed sections, sticky-footer clearance. `L,T,P,V` | Wave A |
| P2-02 | done | `AppHeader` | P2-00 | New UI file | 52-56px; Back/title/one trailing action; 44px targets; focusable heading; long title safe. `L,T,P,V,A` | Wave A |
| P2-03 | done | `StickyActionBar` | P2-00 | New UI file | Safe inset, one/two-button layouts, no content/focus occlusion. `L,T,P,V,A` | Wave A |
| P2-04 | done | Composable list anatomy | P2-00 | `ListSurface`, `ListItem` slots | Outer edge owned once; row separators; media/content/meta/actions; selected/keyboard/density states. `L,T,P,V,A` | Wave A |
| P2-05 | done | Empty/loading primitives | P2-00 | `EmptyState`, `SkeletonRow` | Actionable empty state and geometry-matching skeleton with no layout shift. `L,T,P,V` | Wave B |
| P2-06 | done | Horizontal hierarchy transitions | P1-GATE | `ScreenTransition.tsx`, pure tests | Forward/back use x-axis; auth/root fade; reduced motion; interruption stable; handlers untouched. `L,T,P,E,V,A` | Wave A, integration-owned |
| P2-07 | done | Navigation focus/scroll restoration | P2-01, P2-02, P2-06 | Screen stack and shell | Covered layers inert; heading focus on push; trigger/scroll restore on Back. `L,T,P,E,V,A` | Serial after P2-06 |
| P2-08 | done | `ActionSheet` | P1-07, P2-00 | New UI file | Drawer-based 2-6 choice sheet; focus trap/return; Escape/backdrop policy; no multistep API. `L,T,P,V,A` | Wave A |
| P2-09 | done | `FullScreenPicker` | P2-01, P2-02, P2-04, P2-05 | New UI file | Search, groups, rows, separator, empty/loading, optional scopes; no domain logic or modal. `L,T,P,V,A` | Wave C |
| P2-10 | done | Primitive preview journeys | P2-03, P2-07 through P2-09 | Preview compositions | Pushed detail, long picker, sticky bar, and action sheet work in both themes/three frames. `L,T,P,V,A` | Integration |
| P2-GATE | done | Production-shell smoke and docs | P2-10 | Minimal shell integration, docs | Current screens can be hosted without handler/message/storage changes; APIs frozen for pilot. `L,T,P,E,V,R` | Gate |

Safe Phase 2 Wave A: P2-01, P2-02/P2-03, P2-04, P2-06, and P2-08 in
disjoint files. The integration owner alone handles exports, preview registry,
and `ScreenTransition.tsx`.

### 11.7 Phase 3 task backlog: three-track pilot

The pilot deliberately covers three different interaction classes. Do not
start broad screen migration until its phase gate is approved.

| ID | Status | Task | Depends on | Main scope | Done/verify | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| P3-01 | done | Transaction-detail preview fixtures | P2-GATE | Screen-local preview fixtures | Confirmed/pending/failed, long asset changes, missing metadata, top/bottom scenarios exist. `L,T,P,V` | Track A |
| P3-02 | done | Extract transaction-detail presentation seam | P3-01 | `TxStatusList`, `TxDetailModal`, new detail component | Existing fetch/derived data/copy/explorer behavior passes through stable props; no request logic changes. `L,T,P,E` | Track A |
| P3-03 | done | Screenify transaction details | P3-02 | New detail screen; integration owner wires navigation | Activity -> detail -> Back; one header; no duplicate X/Close; advanced details preserved. `L,T,P,E,V,A` | Track A |
| P3-04 | done | Extract swap-picker domain adapter | P2-GATE | `SwapView`, selector-local adapter | Search/filter/loading/selection data isolated without lifting swap state into top-level `App.tsx`. `L,T,P,E` | Track B |
| P3-05 | done | Replace fixed token selector with nested full-screen picker | P3-04 | Swap picker components | Select returns; Back preserves old value; long names, address paste, missing logo, low-value and empty states work. `L,T,P,E,V,A` | Track B |
| P3-06 | done | Convert Settings root to grouped list | P2-GATE | `Settings/index.tsx`, settings-local UI | Grouped rows push to existing details; search/no-results retained if useful; About destination defined. `L,T,P,E,V,A` | Track C |
| P3-07 | done | Pilot shared-pattern cleanup | P3-03, P3-05, P3-06 | Only shared APIs proven necessary by all tracks | Resolve API inconsistencies without screen-specific branches; update primitives once. `L,T,P,E,V,R` | Integration |
| P3-GATE | done | Approve interaction grammar | P3-07 | Screenshots, docs | All three journeys approved before fan-out; triggers, Back, focus, scroll, selection and overlay rules are frozen. | Gate |

Tracks A, B, and C can run concurrently after P2-GATE. The integration owner
alone changes `AppView`, `App.tsx`, preview registration, or shared exports.
Swap should prefer a nested flow because `SwapView` owns its form state;
transaction detail needs a controlled selection seam from Activity rather
than moving its data logic into `App.tsx`.

### 11.8 Phase 4 task backlog: trust-critical confirmations

| ID | Status | Task | Depends on | Main scope | Done/verify | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| P4-01 | done | Outcome/asset-delta primitives | P3-GATE | `OutcomeCard`, `AssetDeltaRow`, preview | Plain outcome, financial deltas, status/context slots, long-number states. `L,T,P,V,A` | Serial shared enabler |
| P4-02 | done | Confirmation screen shell | P4-01 | Confirmation-local shared shell | Header, scroll body, context, advanced disclosure, sticky Reject/Confirm; no handler ownership. `L,T,P,V,A` | Serial shared enabler |
| P4-03 | done | Extract single-transaction controller/view seam | P4-02 | `TransactionConfirmation`, new view/sections | Messages, gas, simulation, batching, force inclusion, callbacks and state timing remain visually/behaviorally equivalent. `L,T,P,E,W` | Wave A |
| P4-04 | done | Redesign single-transaction presentation | P4-03 | Transaction view/sections | Outcome -> financial -> context -> advanced hierarchy; fee/simulation/error preserved. `L,T,P,E,V,A,W` | Wave B |
| P4-05 | done | Signature confirmation | P4-02 | `SignatureRequestConfirmation`, SIWE/typed-data displays | Sign-in/authorization intent leads; raw schema/digest preserved; unsafe acknowledgement unchanged. `L,T,P,E,V,A,W` | Wave A |
| P4-06 | done | ERC-7715 permission confirmation | P4-02 | Permission shell/review/edit controls | Scope, amount, duration, delegate and revoke path lead; editing/signing unchanged. `L,T,P,E,V,A,W` | Wave A |
| P4-07 | done | Extract batch controller/view seam | P4-01 | `BatchTransactionConfirmation`, new view/sections | Editing/removal/split mode/7702 encoding/gas/custom handlers remain equivalent. `L,T,P,E,W` | Wave A |
| P4-08 | done | Redesign standard batch presentation | P4-07 | Batch view, action list | Aggregate outcome/deltas first; Actions disclosure; Tenderly secondary; sticky actions. `L,T,P,E,V,A,W` | Wave B |
| P4-09 | done | Cross-dapp batch presentation | P4-08 | Cross-batch components/integration | Per-origin grouping clear; custom handlers, persistence and reject-all unchanged. `L,T,P,E,V,A,W` | Wave C |
| P4-10 | done | Add-chain and watch-asset confirmations | P4-02 | Corresponding screens | Same shell/hierarchy; exact chain/token data, warnings, copy/explorer retained. `L,T,P,E,V,A,W` | Wave B |
| P4-11 | done | Pending-request inbox alignment | P4-04, P4-05, P4-06, P4-08, P4-09 | `PendingTxList` | New presentation states are recognizable; adjacency/navigation/reject-all behavior unchanged. `L,T,P,E,V,A,W` | Integration |
| P4-GATE | active | Trust-critical runtime gate | P4-03 through P4-11 | Full extension/dapps | Packaged transaction, personal/typed signature, batch, exactly-once, popup close/reopen and view-only reject-only paths pass for all supported signing account types; Ledger includes device QA and successful signing/broadcast on a production dapp remains manual. `L,T,P,E,V,A,W,R` | Gate |

Wave A gives three workers disjoint confirmation files. Do not parallelize
standard and cross-dapp batch until the standard batch pattern is merged.

### 11.9 Phase 5 task backlog: home and primary actions

| ID | Status | Task | Depends on | Main scope | Done/verify | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| P5-01 | done | Simplify app header and marketing chrome | P3-GATE | Header section, About destination | Account context remains; Lock/Settings clear; panel/expand demoted; promotional strip removed or contextualized. `L,T,P,E,V,A` | Wave A, integration-owned wiring |
| P5-02 | done | Account/network summary | P3-GATE | Account/network display components | Compact identity/address/network; all addresses retain copy/explorer; long labels work. `L,T,P,E,V,A,W` | Wave A |
| P5-03 | done | Balance and quick actions | P5-01, P5-02 | Home summary/actions | Balance is primary; Receive/Send/Swap/More stable; one action language. `L,T,P,E,V,A` | Wave B |
| P5-04 | done | Assets/Positions/Activity root hierarchy | P3-GATE | `PortfolioTabs` and view composition | Root destinations are clear; tab semantics/keyboard work; data ownership unchanged. `L,T,P,E,V,A` | Wave A |
| P5-05 | done | Asset and low-value rows | P2-04, P5-04 | `TokenHoldings` presentation | Separator-based rows; loading/error/stale/missing-logo/large-value states; existing actions preserved. `L,T,P,E,V,A,W` | Wave B |
| P5-06 | done | DeFi position rows | P5-04 | Position presentation | Protocol/position/value/rewards scan cleanly; links retained; no nested card stack. `L,T,P,E,V,A` | Wave B |
| P5-07 | done | Activity rows | P3-03, P5-04 | Transaction list presentation | Intent/status/value/time scan cleanly and open new detail screen. `L,T,P,E,V,A` | Wave B |
| P5-08 | done | Send and Swap/Bridge shell cleanup | P3-05, P4-03 | `TokenTransfer`, `SwapView` shell only | Mobile fields, disclosures and sticky actions; pricing/route/signing logic unchanged. `L,T,P,E,V,A,W` | Wave C; Send and Swap can parallelize |
| P5-09 | done | Connected-app status and entry | P5-01 | WalletConnect/home status | Quiet contextual status opens a full screen; connection logic unchanged. `L,T,P,E,V,A` | Wave B |
| P5-GATE | done | Daily-use regression | P5-01 through P5-09 | Home/action journeys | Packaged QA blocks external portfolio/RPC traffic while Lock, Settings, Receive, Send, Swap/Bridge and More remain usable; account and Base/Ethereum switching pass. `L,T,P,E,V,A,W,R` | Gate |

### 11.10 Phase 6 task backlog: unlock, accounts, and settings

| ID | Status | Task | Depends on | Main scope | Done/verify | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| P6-01 | done | Unlock/password screen | P3-GATE | `UnlockScreen` presentation | Visible label, retained error input, Enter/paste/password-manager support, local-encryption trust copy, no creator promo. `L,T,P,E,V,A,W` | Wave A |
| P6-02 | done | Biometric states | P6-01 | Unlock/passkey presentation | Configured/setup/failure/fallback states clear; existing passkey suite passes. `L,T,P,E,V,A,W` | Serial after P6-01 |
| P6-03 | done | Account switcher/picker | P2-09, P3-GATE | Account switcher and picker | Searchable screen when needed; plain wallet labels; selection/back semantics; view-only negative path. `L,T,P,E,V,A,W` | Wave A |
| P6-04 | done | Account management and secret screens | P6-03 | `AccountSettings` and reveal/remove views | Hierarchy/list grammar applied; agent password remains unable to reveal/change/remove protected secrets. `L,T,P,E,V,A,W` | Wave B |
| P6-05 | done | Security and data settings groups | P3-06 | Settings leaf screens | Form fields vs navigation items separated; destructive actions isolated; save model clear. `L,T,P,E,V,A,W` | Wave A across disjoint files |
| P6-06 | done | Network connections screens | P3-06, P2-09 | Chain/RPC settings and pickers | Plain-language hierarchy; add/edit validation and existing storage behavior unchanged. `L,T,P,E,V,A` | Wave A |
| P6-07 | done | About screen | P3-06 | New settings leaf | Version, author, ecosystem links, theme info live here; no new storage. `L,T,P,E,V,A` | Wave A |
| P6-GATE | active | Auth/account/settings runtime gate | P6-01 through P6-07 | Full extension | Packaged master/agent/manual-lock/reveal-restriction coverage passes for all four signing wallet types and passkey/session tests pass 8/8; genuine biometric ceremony, Ledger device approval, timed auto-lock and browser-restart smoke remain manual. `L,T,P,E,V,A,W,R` | Gate |

### 11.11 Phase 7 task backlog: remaining surfaces and release QA

| ID | Status | Task | Depends on | Main scope | Done/verify | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| P7-01 | done | Chat shell and history | P5-GATE | Chat components | Mobile shell/list/composer states; tool/loading/error behavior unchanged. `L,T,P,E,V,A` | Wave A |
| P7-02 | done | Token management surfaces | P5-05 | Add/edit/hide/custom token components | Screen/sheet taxonomy applied; copy/explorer retained; empty/error states complete. `L,T,P,E,V,A` | Wave A |
| P7-03 | done | Remaining overlay sweep | P6-07 | Overlay matrix remainder | Substantial destinations are screens; small choices are sheets; exact values expand inline; destructive/QR/media dialogs are retained intentionally. `L,T,P,E,V,A,R` | Multiple disjoint files |
| P7-04 | done | Empty/loading/error/feedback sweep | P7-01 through P7-03 | Shared states and consumers | Deterministic empty/loading/error/disabled scenarios, actionable feedback, inline copy confirmation, and quiet home alerts are in place. `L,T,P,E,V,A` | Wave B |
| P7-05 | done | Typography/icon/copy consistency | P7-03 | UI presentation only | Primary journeys use sentence case, restrained weights, tabular financial numerals, coherent icons, and plain/technical label pairing. `L,T,P,E,V,R` | Wave B |
| P7-06 | active | Accessibility and motion audit | P7-04, P7-05 | All production journeys | Axe, keyboard flows, 320px reflow, reduced motion, target sizing, and color-independent direction pass; manual VoiceOver/NVDA smoke remains. `A` | Read-only audit then fixes |
| P7-07 | done | Performance and long-content stress | P7-04 | Preview and real extension | The 235-state preview and packaged daily-use/confirmation suites have no runtime errors, broken images, overflow, sticky-action clipping, or blocked primary actions. `P,E,V,A` | Parallel audit |
| P7-08 | done | Documentation/security sync | P7-06, P7-07 | UI/theme/preview/implementation/security docs | Architecture, preview routes and QA commands are current; this UI-only project adds no storage key/message/secret path. | Serial |
| P7-GATE | active | Release candidate | All prior gates | Full repo/release workflow | Automated QA and Chrome/Firefox builds are green; successful production-dapp signing, native headed-popup, genuine biometric, and manual assistive-technology smoke remain the release-manager gate. `L,T,P,E,V,A,W,R` | Gate |

Release/version commands remain a release-manager decision. If a version is
bumped, generate fresh store artifacts with `pnpm zip:cws`; never reuse an old
zip.

---

## 12. Logic-preservation guardrails

The UI project must not change:

- Background message types or routing
- Transaction construction or normalization
- Signing behavior
- Bankr API behavior
- Local private-key signing behavior
- Seed-phrase derivation or signing behavior
- Agent-password authorization
- Session restoration
- Storage keys or stored shapes
- Encryption or vault behavior
- Pending-request persistence
- WalletConnect request semantics
- Simulation or gas-estimation calculations

Preferred implementation pattern:

1. Keep existing data loading, event handlers, and response callbacks.
2. Extract presentational components around existing props.
3. Replace overlay ownership and layout without changing the underlying
   request lifecycle.
4. Keep confirmation buttons wired to the same handlers.
5. Separate visual-only commits from logic or bug-fix commits.

If a visual change appears to require new background state, storage, or a new
message type, stop and reassess the design before expanding scope.

---

## 13. Required wallet-type test matrix

This historical phase used three software-signing fixtures. Any current
redesigned surface involving authentication, transactions, signatures, or
permissions must also follow the complete signing and Safe-owner matrix in
`AGENTS.md`, including Ledger device QA.

| Flow | Private key account | Seed phrase account | Bankr API account |
| --- | --- | --- | --- |
| Unlock with master password | Required | Required | Required |
| Unlock with agent password | Required | Required | Required |
| Biometric unlock where configured | Required | Required | Required |
| Send native asset | Required | Required | Required |
| Send ERC-20 | Required | Required | Required |
| Dapp transaction | Required | Required | Required |
| Personal signature | Required | Required | Required |
| Typed-data signature | Required | Required | Required |
| Batch confirmation | Required | Required | Required |
| Rejection and error states | Required | Required | Required |

Also verify that agent-password restrictions on private-key/seed reveal remain
unchanged.

The table records this phase's software-signing fixtures; it is not the current
complete account-model inventory.
Where the runtime also exposes a separate view-only/impersonated account path,
test it as a negative path: Confirm/signing must be absent or disabled, Reject
must work, and the UI must explain why the action is unavailable. Do not merge
that negative-path fixture with the Bankr API fixture merely because older
internal names overlap.

---

## 14. Visual and accessibility QA

### Preview harness

For each touched screen:

1. Run `pnpm dev:extension-preview`.
2. Review popup 360x600.
3. Review popup-window 480x720.
4. Review sidepanel 420x760.
5. Review both Bauhaus and Midnight.
6. Capture deterministic before/after screenshots.

Add preview coverage for any newly screenified surface before considering its
migration complete.

### Extension validation

After preview approval:

1. Run `pnpm build:extension`.
2. Reload the full unpacked extension.
3. Test the production flow in a real dapp.
4. Exercise keyboard navigation and Escape/Back behavior.
5. Verify pending requests survive popup close exactly as before.

### Accessibility gate

- Normal text contrast: at least 4.5:1.
- Large text and meaningful UI graphics: at least 3:1.
- Keyboard focus is always visible and never obscured by sticky action bars.
- Interactive targets are at least 24px and preferably 44px.
- Inputs have visible labels.
- Status is not communicated by color alone.
- Overlays trap and return focus correctly.
- Full-screen navigation moves focus to the screen heading or first relevant
  control.
- Reduced motion is honored.
- Layout remains usable at 200% zoom and with long localized copy.

---

## 15. Definition of done

The redesign is complete when:

- WalletChan uses a consistent mobile-style navigation vocabulary.
- Large searchable choices are full-screen pickers rather than dropdowns.
- Scrollable detail destinations are screens rather than modals.
- Midnight standard cards and inputs use no 3px or 4px borders.
- Most content grouping uses spacing and row separators instead of nested
  cards.
- One action hue dominates the non-semantic interface.
- Uppercase and weight 900 are limited to justified brand/technical cases.
- Every high-risk flow leads with a human-readable outcome.
- Technical detail remains available through predictable disclosure.
- One primary action exists per screen or sticky action region.
- All component states are specified and visually consistent.
- Both themes remain functional at every preview size.
- All transaction/signature/auth flows pass with all four signing wallet types.
- No storage, message, signing, or crypto behavior changes as part of the UI
  work.

---

## 16. Anti-slop audit

Before approving a migrated screen, confirm:

- No nested card stack where spacing or a divider would work.
- No thick colored side accent on a rounded card.
- No border plus large diffuse shadow on the same resting surface.
- No purple/indigo glow used as generic polish.
- No uniform heavy radius applied to every element.
- No placeholder used as the only form label.
- No icon tile added solely to decorate a heading.
- No more than one primary filled action.
- No raw contract detail competing with the human-readable outcome.
- No layout shift when controls become active or selected.
- No high-frequency action slowed by decorative animation.
- Empty, loading, error, disabled, and long-content states are designed.

---

## 17. Decision log

- 2026-07-09: Keep Chakra UI; emulate shadcn's restraint through the existing
  token factory and shared primitives.
- 2026-07-09: Retune Midnight instead of adding a new theme or storage key.
- 2026-07-09: Apply mobile-style screen navigation to all themes while keeping
  theme-specific visual personality.
- 2026-07-09: Use the ETH.sh faucet page as a restraint reference, not as a
  layout template.
- 2026-07-09: Transpose shadcn's semantic-token, composable-anatomy, variant,
  picker, and state-component patterns into Chakra without adopting its stack
  or default visual identity.
- 2026-07-09: Make the Outcome Card the signature WalletChan design element.
- 2026-07-10: Treat preview fidelity as a Phase 0 gate. Production controllers
  and components are the source of truth; fixture data may replace backends,
  but preview JSX must not duplicate product screens.
- 2026-07-10: Render preview frames as isolated iframe documents so viewport
  units, Chakra breakpoints, portals, body modes, focus, and scroll ownership
  use the real popup/window/sidepanel dimensions.

---

## 18. Phase 0 audit record

This section records the reproducible inventories behind tasks P0-02 through
P0-05. Counts describe the 2026-07-10 worktree and should be rerun at each
phase gate rather than treated as permanent targets.

### 18.1 Preview truth correction

The original preview had three critical fidelity failures:

- Home was a 340-line hand-built replica.
- Settings rendered Appearance rather than the Settings root.
- Portfolio rendered a fictional dashboard with no production equivalent.

The corrected harness now:

- Mounts the production `App` controller for Home.
- Mounts the production Settings root and `PortfolioTabs` component.
- Uses isolated iframe viewports rather than same-document framed boxes.
- Uses canonical `theme`, `frame`, `scenario`, and `wallet` URL state.
- Uses fixed timestamps, wallet-aware fixtures, and local semantic assets.
- Blocks live Bankr/API/RPC traffic and fails loudly on unknown runtime reads.
- Labels routes `production`, `composed`, or `synthetic`; synthetic routes are
  excluded from baseline approval.

The registry-derived production/composed routes have deterministic baseline
entries. The final automated smoke covers both themes, compact/popup/window/
sidepanel frames where applicable, URL-addressable scenarios, and all relevant
wallet variants; P0-01 is complete.

### 18.2 Screen and destination registry

Wallet coverage: `B` Bankr API, `PK` private key, `SP` seed phrase.

| App view | Owner / composition | Entry | Scroll owner | Consequence | Wallets |
| --- | --- | --- | --- | --- | --- |
| `main` | `App.tsx`, `AccountNetworkControls`, `PortfolioTabs` | Unlock and child-flow return | Home Container | Daily overview/actions | B, PK, SP |
| `unlock` | `UnlockScreen` | Startup, Lock, session expiry | Fixed composition | Critical authentication | B, PK, SP |
| `waitingForOnboarding` | `App.tsx` | Missing setup | Fixed composition | Setup blocking | New users |
| `settings` | `Settings` | Home Settings | App Container | Security/configuration | B, PK, SP |
| `settingsAddChain` | `Settings → Chains → AddChain` | Dapp/WC network request | Container + sticky actions | High network mutation | B, PK, SP |
| `accountSettings` | `AccountSettings` | Account utility | Component body | Critical secrets/account mutation | B, PK, SP |
| `chat` | `ChatView` | Home header/footer | `MessageList` | Bankr conversation/API | B |
| `addAccount` | `AddAccount` | Account switcher/WC | Component root | Critical key/API import | B, PK, SP, view-only |
| `transfer` | `TokenTransfer` | Send/token row | Component root + sticky actions | High transaction | B, PK, SP |
| `swap` | `SwapView` | Swap/Bridge/token action | No explicit root owner | High transaction/batch | B, PK, SP |
| `more` | `MoreActionsView` | Home More | Component root | Navigation/external actions | B, PK, SP |
| `hideTokens` | `HideTokensView` | More | Internal token list | Visibility mutation | B, PK, SP |
| `hiddenTokens` | `HiddenPortfolioTokensView` | Hide Tokens | Component root | Visibility mutation | B, PK, SP |
| `walletConnect` | `WalletConnectView` | Banner/More | Component root | High dapp session/routing | B, PK, SP |
| `pendingTxList` | `PendingTxList` | Pending banner/confirmation Back | No explicit root owner | Critical request inbox | B, PK, SP |
| `txConfirm` | Error boundary + `TransactionConfirmation` | Pending tx/inbox | Confirmation root | Critical transaction | B, PK, SP |
| `batchTxConfirm` | `BatchTransactionConfirmation` | ERC-5792/inbox | Confirmation root | Critical multi-call | B, PK, SP |
| `crossDappBatchConfirm` | `CrossDappBatchConfirmation` | Add-to-batch/inbox | Batch root | Critical multi-dapp batch | B, PK, SP |
| `signatureConfirm` | `SignatureRequestConfirmation` | Pending signature/inbox | Confirmation root | Critical authorization | B, PK, SP |
| `erc7715PermissionConfirm` | `Erc7715PermissionConfirmation` | ERC-7715/inbox | Dedicated body | Critical delegated authority | PK/SP grant; others reject-only |
| `watchAssetConfirm` | `WatchAssetConfirmation` | `wallet_watchAsset` | No explicit owner | Token-list mutation | B, PK, SP |
| `addChainConfirm` | `AddChain` dapp mode | Add/switch request | Parent + sticky actions | High network mutation | B, PK, SP |

Nested Settings state contains `main`, `security`, `data`, `appearance`,
`chains` list/add/edit, `changePassword`, `autoLock`, `agentPassword`,
`biometricUnlock`, `clearSigning`, `ensBrowsing`, and `clearTxHistory`. These
currently share one App view and therefore do not receive normal navigation
depth, focus restoration, or per-screen scroll restoration.

Nested Account Settings state contains `settings`, `changeApiKey`,
`revealPrivateKey`, and `revealSeedPhrase`. Secret reveal and API-key mutation
remain master-password-only and must preserve agent-password restrictions.

### 18.3 Overlay migration matrix

| Current surface | Target | Reason |
| --- | --- | --- |
| Account network Menu | Full-screen picker | Searchable growing chain list |
| Account switcher Menu | Full-screen picker | Identity, management, and add navigation |
| Remove account Modal | Keep dialog | Focused destructive decision |
| Add Token Modal | Pushed screen | Async validated form destination |
| Add Token chain Menu | Full-screen picker | Removes nested modal/menu |
| NFT media Modal | Keep dialog | Focused media inspection |
| Split batch Modal | Keep dialog | Exceptional consequential decision |
| Chat delete Menu | Action sheet | Small contextual destructive action |
| Permission revoke Modal | Keep dialog | Focused consequential decision |
| Edit Custom Token Modal | Pushed screen | Form destination |
| Edit Delegate Modal | Pushed screen | Complex high-consequence configuration |
| Custom delegate confirmation | Keep dialog | Security confirmation after screen migration |
| Hide Token Modal | Keep dialog | Focused reversible decision |
| Native calldata Modal | Pushed screen | Scrollable technical destination |
| Native amount Popover | Inline disclosure | Precision must work by touch/keyboard |
| Portfolio network Menu | Full-screen picker | Searchable growing chain list |
| QR Modal | Keep dialog | Focused receive/copy task |
| Clear chat history Modal | Keep dialog | Focused destructive decision |
| Delete chain AlertDialog | Keep dialog | Correct alert-dialog use |
| Bridge chain/token fixed overlay | Full-screen picker | Substantial searchable destination |
| Swap token fixed overlay | Full-screen picker | Desktop dropdown squeezed into popup |
| Slippage Popover | Action sheet | Small contextual setting |
| Swap chain Menu | Full-screen picker | Searchable growing list |
| Token row action Menu | Action sheet | Two-to-six contextual actions |
| Transfer chain Menu | Full-screen picker | Searchable custom-chain list |
| My Wallets recipient Menu | Full-screen picker | Growing account set |
| Contract deployment Popover | Action sheet | Small advanced contextual choice |
| Confirmation exact-value Popover | Inline disclosure | Touch/keyboard-accessible precision |
| UTC date/time Popover | Action sheet | Complex field picker in narrow viewport |
| Integer display fixed overlays | Action sheet | Shared small format choice |
| Theme switcher Menu | Action sheet | Small global choice set |
| Onboarding pointer | Keep fixed decoration | Non-interactive exception |
| Transaction details Modal | Pushed screen | Full scrollable destination with navigation |
| Reset extension Modal | Keep dialog | Critical destructive alert |

The sweep now uses Chakra Drawer roots only through the shared mobile action
sheet grammar (theme, slippage, date/time, numeric format, contract-deployment
mode, token actions, and other small contextual choices). Transaction details,
calldata inspection, Swap selection, account/network selection, Add Token, and
delegate editing are pushed screens. Focused destructive, QR, and media
decisions remain dialogs by design.

### 18.4 Visual override inventory

Production counts exclude `src/preview/**` and comment-only lines.

| Metric | Matching lines | Files | Highest-impact files |
| --- | ---: | ---: | --- |
| Border widths at least 2px | 329 | 67 | Onboarding 29, Tx details 20, Add Account 20, App 19 |
| `boxShadow` | 230 | 60 | App 19, Transfer 16, Pending list 15 |
| `borderRadius` | 521 | 106 | Add Account 21, Onboarding 20, Tx confirmation 20 |
| Explicit uppercase | 396 | 92 | Tx details 26, Tx confirmation 19, Onboarding 18 |
| Weight 900/black | 167 | 66 | Permission editing 18, Tx confirmation 11 |
| Raw hex/rgb lines | 18 | 7 | App 6, Digest 4, Tx confirmation 3 |
| Broad inline overlay anatomy | 18 | 13 | Mostly repeated overlays plus four body/footer rules |

Interpretation:

- Sixteen thick-border matches are explicit dark/light conditionals and ten
  are transparent CSS-shape edges; they remain counted but are not necessarily
  thick Midnight card borders.
- The App raw colors are the documented WalletChan OS banner exemption.
- QR black, chart color conversion, and sandboxed media backgrounds are
  physical/technical exceptions.
- Counts measure declarations, not computed Midnight output. Phase 1 should
  reduce call-site anatomy and centralize recipes rather than blindly delete
  every match.

Reproduce with:

```bash
rg -n -P --glob '*.tsx' --glob '!**/preview/**' \
  'border[A-Za-z]*[^\n]*(?<![0-9.])(?:[2-9](?:\.[0-9]+)?|[1-9][0-9]+(?:\.[0-9]+)?)px' \
  apps/extension/src

rg -n --glob '*.tsx' --glob '!**/preview/**' \
  '\bboxShadow\b|\bborderRadius\b|\btextTransform\b[^\n]*uppercase|\bfontWeight\b[^\n]*(900|black)|#[0-9A-Fa-f]{3,8}\b|rgba?\(' \
  apps/extension/src
```

### 18.5 State and accessibility baseline

Production mounting and the core lifecycle/failure/stress matrix are now
deterministic. The implemented minimum scenario contract is:

| Route | Required deterministic scenarios |
| --- | --- |
| Home | `default`, `portfolio-loading`, `portfolio-empty`, `portfolio-error`, `stress` |
| Unlock | `pending-requests`, `empty`, `invalid-password`, `submitting`, `biometric-configured` |
| Transaction | `default`, `loading`, `simulation-error`, `malformed-disabled`, `stress`, `impersonator-disabled` |
| Signature | `personal-sign`, `typed-data-long`, `siwe-blocked`, `submitting`, `impersonator-disabled` |
| Settings | `root`, `no-results`, all production leaf routes; agent restrictions are covered by account-management wallet fixtures and the passkey/auth suite |
| Portfolio | `populated`, `loading`, `empty`, `error`, `stress`, `activity-selected` |
| Transaction detail | `confirmed`, `pending`, `failed`, `stress`, `missing-metadata` |
| Swap / Bridge | `default`, `portfolio-loading`, `portfolio-error`, `quoted`, `bridge-quoted`, `disabled` |
| Swap picker | `sell`, `buy`, `search`, `loading`, `empty`, `missing-logo`, `stress` |
| Batch | `default`, `loading`, `simulation-error`, `malformed-disabled`, `stress`, `impersonator-disabled` |
| Cross-dapp batch | `default`, `loading`, `error`, `stress`, `impersonator-disabled` |
| Permission | `default`, `metadata-loading`, `metadata-unverified`, `draft-invalid`, `submitting`, `advanced-stress` |

Each scenario must be reload-stable, mount production UI, avoid live services,
show a visible reason for disabled decisions, and use fixed stress data.
Default wallet-sensitive routes must cover Bankr, private key, and seed phrase;
view-only accounts are separate negative signing paths.

Cross-cutting checks for every route include keyboard order, initial and
returned focus, visible focus in both themes, sticky-bar focus occlusion,
accessible names/roles, target sizes, error association, reduced motion, 200%
zoom/reflow, screen-reader decision order, and contrast without color alone.

Production routes cover Send, WalletConnect/Connected apps, Add Network,
Watch Asset, Chat, More, account management, token management, and secret-reveal
restrictions in addition to the original confirmation and daily-use screens.
First-run onboarding is production-backed in the preview too. Unlock's
invalid/submitting/biometric fixtures mount the production `UnlockView`
presentation seam because its controller intentionally has no initial-state
injection API. Standalone reset/destructive-dialog variants remain manual
dialog checks rather than fabricated controller state.

---

## 19. Phase 1 foundation record

The 2026-07-10 Midnight V2 foundation implements the durable direction in
`DESIGN.md` without changing wallet handlers, storage, signing, or message flow.

- `createTheme.ts` dropped from 627 to about 150 orchestration lines. Internal
  Chakra recipes now live in `theme/recipes/` by concern.
- Midnight moved from navy/violet web3 styling to a neutral zinc surface ramp
  with accessible action blue, light-blue links, and restrained amber status
  emphasis.
- Resting cards/buttons are shadowless; floating overlays use neutral elevation.
- Controls use 8px radius, cards 12px, dialogs 16px, and 44px preferred targets.
- Action, form, selection, feedback, and overlay recipes now define focus,
  disabled, loading, invalid, and selected states. Bauhaus retains its hard
  borders, offset shadows, and geometric identity.
- `ThemedCard`, `ThemedPanel`, and `IconBox` use quiet Midnight boundaries;
  their documentation no longer recommends default card-in-panel nesting.
- `/preview/components` renders the production recipes and primitives under
  both themes. It is composed preview infrastructure, not a production UI fork.
- `tests/ui/themeContrast.test.ts` verifies core text, action, and composited
  status pairs at WCAG AA. Current minimum ratios include 5.16:1 muted text,
  5.17:1 white-on-primary action, and 7.83:1 inverse-on-secondary action.

Rendered smoke coverage passed all 13 Phase 1 preview routes in Midnight and
Bauhaus at popup size, plus window/sidepanel sentinels and the wallet-sensitive
confirmation matrix. The user approved the foundation on 2026-07-10, closing
the Phase 1 gate without adding a theme ID or storage key.

---

## 20. Phase 2 mobile interaction record

The 2026-07-10 Phase 2 layer establishes one mobile application vocabulary
without moving any wallet or request state:

- `components/ui/` now exports screen, header, scroll body, section, sticky
  action, list, empty/loading, picker, and action-sheet primitives.
- Interactive list rows render valid `li > button/a` anatomy. The list owns one
  outer edge and rows own separators. Selection uses a quiet surface and 1px
  inset ring, not a colored side tab or weight shift.
- `ScreenStack` uses an x-axis push/Back model. Covered layers are inert and
  `aria-hidden`; reduced motion uses opacity; the shared shell exposes focus
  and scroll restoration hooks.
- `/preview/mobile-primitives` provides reload-stable `journey`, `picker`, and
  `sheet` scenarios. Midnight and Bauhaus popup captures passed; the route is
  also registered for window and sidepanel review.
- The primitive/API contract is frozen in Section 9.4. Domain controllers own
  search data, selection, callbacks, transaction state, and lifecycle timing.
- `tests/ui/screenTransitionModel.test.ts` protects hierarchy/fade decisions.
- Signing routes accept a separate `wallet=viewOnly` fixture. It maps to the
  product's impersonated account type and verifies that signing is absent,
  Reject remains available, and the reason is visible; it is not counted as
  one of the three mandatory signer types.

Phase 2 closed after the three production pilot screens hosted the shell,
their Back/focus/scroll journeys passed, and the production-backed preview
build confirmed that the primitives did not take ownership of wallet logic.

---

## 21. Phase 3 pilot record

The production pilot established that the mobile grammar works across three
different interaction classes:

- Activity opens transaction detail as a pushed full screen with Back; the old
  modal remains only as a compatibility fallback.
- Swap/Bridge token and chain selection use production-backed full-screen
  searchable pickers while the existing quote/filter/selection controllers
  retain ownership of data.
- Settings is a searchable grouped list whose leaves are real screens rather
  than nested modal navigation.
- Focus return, scroll ownership, Escape/Back, selection persistence, missing
  metadata, and long-content states were checked in the isolated preview
  viewport.

No storage, message, signing, pricing, or transaction behavior moved into the
new presentation primitives.

---

## 22. Phase 4 confirmation record

Transaction, signature, batch, cross-dapp batch, delegated permission,
watch-asset, and add-network requests now share one consequence-first order:
human-readable outcome, financial/permission impact, requester context,
advanced technical detail, then sticky decisions.

- Clear signing, raw calldata, typed data, SIWE validation, gas overrides,
  Tenderly links, ERC-7702/7821 details, split batching, simulation failures,
  and exact callback/message paths remain available.
- View-only fixtures visibly explain why signing is unavailable and retain a
  safe Reject path; Bankr, private-key, and seed-phrase fixtures keep their
  distinct production controller paths.
- Disclosure headers are native keyboard controls with `aria-expanded` and
  reduced-motion behavior; copy/explorer actions meet the minimum target size.
- The pending-request inbox uses the same list/screen vocabulary without
  changing ordering, persistence, or reject-all behavior.

---

## 23. Phase 5 daily-use record

The home and primary-action hierarchy now behaves like a compact mobile wallet:

- A restrained 56px header keeps Lock and Settings immediate; Chat, panel,
  fullscreen, token, and ecosystem shortcuts remain available contextually.
- Account and network identity share one quiet surface with full-screen
  searchable pickers, inline copy, and explorer access.
- Portfolio balance leads, followed by Receive/Send/Swap/More and
  Assets/Positions/Activity. Token/DeFi/activity rows use separators rather
  than nested card stacks.
- Send and Swap/Bridge use full-height forms, visible labels, screen pickers,
  progressive disclosures, and sticky review actions. Sponsorship messaging is
  contextual and no longer competes with the transfer decision.
- WalletConnect and connected-app state are quiet destinations rather than
  promotional banners.

Portfolio, quote, routing, sponsorship, transfer, and WalletConnect data paths
are unchanged.

---

## 24. Phase 6 auth, account, and settings record

Unlock, biometric setup, onboarding, account management, secret reveal,
security/data/appearance/about settings, and network RPC forms now use the same
mobile screen grammar.

- First-run onboarding supports the original Bankr, private-key, and
  seed-phrase branches with fixed actions, visible form help, and 320px reflow.
- Password-manager/Enter behavior, passkey ceremonies, master-vs-agent
  restrictions, view-only limitations, seed derivation, and account removal
  callbacks are preserved.
- Complex network and delegate configuration are full-screen destinations;
  destructive removal and the typed custom-delegate warning remain focused
  blocking dialogs.
- Account and token management have production-backed preview routes, including
  reveal restrictions and hide/remove journeys.

The passkey/auth/session suite passes across Bankr, private-key, and seed-phrase
caches. No storage key or encryption format changed during this UI project.

---

## 25. Phase 7 polish and QA record

The final pass closes the screen-level issues that made Midnight feel like dark
Bauhaus:

- Midnight uses Inter/system UI, restrained weights, sentence-case prose,
  tabular financial numerals, 1px surfaces, and blue only for action/focus.
- The popup reflows at `320x568`; the preview toolbar includes that mandatory
  compact gate alongside `360x600`, window, and sidepanel frames.
- Context menus with multi-action mobile intent use action sheets; searchable
  or configured choices use full screens; remaining dialogs are limited to
  focused/blocking decisions documented in the overlay matrix.
- Theme choice, slippage, UTC date/time, integer display units, and contract
  deployment mode now use bottom sheets. Exact native values expand inline,
  and native calldata inspection is a pushed technical-details screen.
- Loading, success, bell, disclosure, and screen motion respect reduced-motion
  preferences. Copy feedback remains inline and never uses a toast.
- Preview runtime responses fail closed and now explicitly cover portfolio,
  prices, swap tokens, account/token management, and delegate probing. Fixture
  images are local; unknown reads remain visible errors.
- Production-backed preview routes include Home, onboarding, unlock, all
  confirmation families, portfolio/activity/detail, Send, Receive, Swap,
  Settings, Chat, Connected apps, More, account management, and token
  management.

Automated preview verification is registry-derived rather than a hand-written
route list. The final smoke run passed **235/235** route/scenario/theme/frame/
wallet states and produced 75 indexed screenshots. It found no runtime/page
errors, unexpected requests, broken images, horizontal overflow, clipped
sticky actions, or serious/critical axe violations. The audit includes reduced
motion, the `320x568` compact viewport, both themes, three signer types, and
view-only negative paths.

The strict scoped UI, full-extension source, and QA-script typechecks pass. The
legacy runtime/model diagnostics were resolved with precise narrowing and
fail-closed guards rather than blanket suppression; signing authorization,
storage shapes, message types, and valid-request behavior remain unchanged.

Packaged Chrome QA loads the complete production manifest into fresh profiles.
It passes transaction rejection for all four signing wallet types; six personal/
typed-data signature scenarios; view-only transaction/signature rejection;
three ERC-5792 batch rejection scenarios; daily-use navigation with external
portfolio/RPC traffic blocked; and 30 master/agent/account-protection assertions
across Bankr, private-key, and seed-phrase accounts. Pending requests survive
UI close/reopen, keyboard rejection settles exactly once, and no suite clicks
Sign/Confirm or broadcasts. This runtime gate caught and fixed an 18px explorer
target, a stale `inert` screen layer that blocked Home after Back, and an empty
successful-simulation financial-impact section.

Release verification is recorded in the phase table and final handoff: lint,
deterministic UI/auth tests, production preview build, full Chrome extension
build, Firefox extension build, compact/popup browser smoke, and the mandatory
wallet-type matrix. This project adds no storage key, message type, secret
exposure, authentication rule, or signing path.
