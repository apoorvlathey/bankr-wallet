# Theme Engine

The WalletChan extension ships a token-driven theme engine. As of v3.2.0 it
ships with **two themes** — Bauhaus (light, geometric) and Midnight (dark,
soft) — and is built so that adding a third theme is one tokens file plus a
one-line registration. Component code is theme-agnostic: it consumes intent
tokens (`accent.primary`, `surface.raised`, `chart.numeric`, …) and never
references theme-specific colors directly.

This doc is the day-to-day engineering reference: file layout, public API,
authoring rules, common patterns, and how to add a new theme.

> **Companion docs**
> - `_docs/STYLING.md` — full token vocabulary tables (Surface, Foreground,
>   Border, Accent, Status, Chart, Decorators) and the historical Bauhaus
>   design brief.
> - `_docs/THEMING_PRD.md` — phased rollout history, architecture decision
>   record, and the design brief for Midnight. Read this when you want the
>   *why*; read THEME.md when you want the *what*.

---

## 1. Architecture at a glance

```
ThemeTokens (contract in tokens.ts)
        │
        ├──── themes/bauhaus.ts  ──┐
        ├──── themes/midnight.ts  ─┤
        │       (concrete themes)  │
        │                          ▼
        │                  createChakraTheme()       (factory in createTheme.ts)
        │                          │
        │                          ▼
        │                  Chakra extendTheme config
        │                          │
        └──► ThemeProvider ───►  ChakraProvider  ───►  React tree
                  ▲
                  │
        useThemeSelection() ◄── chrome.storage.local["selectedThemeId"]
                  ▲
                  │
        bootstrapThemeAttribute() ◄── localStorage mirror (synchronous)
                  │
                  ▼
        <html data-theme="bauhaus|midnight">  (paints body bg before React mounts)
```

The pieces:

| Layer | File | Purpose |
|---|---|---|
| Contract | `theme/tokens.ts` | `ThemeTokens` interface — every theme must satisfy it. The factory refuses to build if a field is missing. |
| Themes | `theme/themes/{bauhaus,midnight}.ts` | Concrete `ThemeTokens` objects. |
| Factory | `theme/createTheme.ts` | Translates a `ThemeTokens` into a Chakra `extendTheme` config (Button / Input / Modal / Menu / Popover / Slider / Tooltip / Badge / Alert baseStyles). |
| Provider | `theme/ThemeProvider.tsx` | React context + ChakraProvider wrapper. Memoizes the Chakra theme by `themeId` so switching is cheap. |
| Selection | `theme/useThemeSelection.ts` | Reads + writes the persisted `selectedThemeId` to `chrome.storage.local`. Listens to `chrome.storage.onChanged` so multiple popup instances stay in sync. |
| Bootstrap | `theme/bootstrap.ts` | Pre-React, pre-paint sync. Reads a `localStorage` mirror of the theme ID and sets `<html data-theme=…>` so the very first paint matches the user's choice. |
| Strip hook | `theme/useStripTokens.ts` | Shared color pair for inverted "dark CTA strip" bars (count badges, chat header, Add Token CTA). Replaces the `themeId === "midnight" ? … : …` ternary at every call site. |
| Primitives | `theme/primitives/*.tsx` | Theme-aware atoms — `ThemedCard`, `ThemedPanel`, `ThemedField`, `IconBox`, `Decorator`. |
| Public API | `theme/index.ts` | Barrel re-export. Component code imports from `@/theme`, never from inner files. |
| CSS pre-paint | `index.css`, `onboarding.css` | `html[data-theme="midnight"]` selectors set the body wash to the Midnight base color so the popup-window shell doesn't flash off-white. |
| Toast hook | `hooks/useThemedToast.tsx` | Theme-aware toast that maps each status to an accent intent. Replaces the legacy `useBauhausToast`. |

### Pre-paint flow (no flash)

`chrome.storage.local` is async-only, so we cannot read the user's selection
synchronously. Instead:

1. Every write to `chrome.storage.local["selectedThemeId"]` also writes a
   mirror to `window.localStorage` (synchronous).
2. `index.tsx` and `onboarding.tsx` call `bootstrapThemeAttribute()` **before**
   `ReactDOM.render`. It reads the localStorage mirror, sets
   `<html data-theme="bauhaus|midnight">`, and returns immediately.
3. CSS in `index.css` / `onboarding.css` uses `html[data-theme="midnight"]`
   selectors to paint the body background. The first paint matches the user's
   choice — no white flash on dark mode.
4. After mount, `useThemeSelection` reconciles against the canonical
   `chrome.storage.local` value and updates if the mirror was stale.

### Switching at runtime

`ThemeProvider` resolves `themeId → tokens → Chakra theme` and memoizes the
factory output. When the user picks a theme in Settings → Appearance,
`setThemeId` updates context state, persists to storage, sets the
`<html data-theme>` attribute, and the memoized Chakra theme rebuilds — the
entire React tree re-renders in the new theme instantly. No reload, no flash.

The `chrome.storage.onChanged` listener inside `useThemeSelection` keeps
multiple popup/sidepanel instances in sync if the user switches themes from a
different window.

---

## 2. Public API

Everything component code needs is exported from `@/theme`:

```ts
import {
  // Provider + hook
  ThemeProvider,
  useTheme,            // → { themeId, tokens, setThemeId }

  // Theme registry
  themes,              // Record<ThemeId, ThemeTokens>
  themeList,           // ThemeTokens[] — for picker UIs

  // Selection storage
  useThemeSelection,
  loadSelectedThemeId,
  saveSelectedThemeId,
  readBootstrapThemeId,
  SELECTED_THEME_STORAGE_KEY,
  DEFAULT_THEME_ID,

  // Shared hook for inverted CTA strips
  useStripTokens,      // → { bg, fg, border }

  // Shared hook for chain badge colors
  useChainBadgeStyle,  // → { bg, fg, border }

  // Primitives
  ThemedCard,
  ThemedPanel,
  ThemedField,
  IconBox,
  Decorator,
} from "@/theme";

// Types
import type {
  ThemeId,
  ThemeTokens,
  ThemeColors,
  StripTokens,
  // … see theme/index.ts for the full list
} from "@/theme";
```

The factory (`createChakraTheme`), individual theme files, and `bootstrap.ts`
are **not** part of the public surface. They are wired up once in `index.tsx` /
`onboarding.tsx` / `ThemeProvider.tsx` and component code shouldn't reach into
them.

### `useTheme()`

Returns `{ themeId, tokens, setThemeId }`. Use this only when you need:

- A raw value Chakra style props can't express (e.g., a hex passed to a chart
  library — see `PortfolioChart.tsx`).
- A theme-aware branch that doesn't fit `useStripTokens()` (e.g., wrapping
  Bauhaus-only ornaments in `{!isDarkTheme && (…)}`).
- The `setThemeId` setter (only `Settings/AppearanceSettings.tsx` should use
  this).

For everything else, prefer Chakra style props that resolve token paths:
`bg="surface.raised"`, `borderColor="border.default"`, `color="accent.primary"`,
etc.

### `useStripTokens(variant?)`

Returns `{ bg, fg, border }` for the inverted "dark CTA strip" pattern.
Two variants are supported:

**`useStripTokens()` (default — `"inverted"`)**

| | Bauhaus | Midnight |
|---|---|---|
| `bg` | `fg.primary` (literal black bar) | `surface.sunken` (recessed dark shelf) |
| `fg` | `fg.inverse` (white text) | `fg.primary` (light text) |
| `border` | `"transparent"` | `"transparent"` |

Used by transaction confirmation count badges, chat header / list bars,
WatchAsset's "Add Token" header, the App.tsx popup header, and
`TypedDataDisplay`'s tab strip.

**`useStripTokens("elevated")`**

| | Bauhaus | Midnight |
|---|---|---|
| `bg` | `fg.primary` (same inverted black bar) | `surface.raised` (elevated card) |
| `fg` | `fg.inverse` (white text) | `fg.primary` (light text) |
| `border` | `"transparent"` | `border.default` (visible frame) |

Used by the inline address pill on the home screen — `surface.sunken` in
Midnight sat too close to `surface.base` and blended into the page wash, so
this variant lifts the pill onto the raised surface with a visible border.

**Don't duplicate the `themeId === "midnight" ? … : …` ternary inline** —
call this hook instead, and add a new variant here if a future screen needs
a different strip treatment.

### `useChainBadgeStyle(brandBg, brandFg, isCustom?)`

Returns `{ bg, fg, border }` for chain-identity badges (the Network row in
confirmation screens, the chain MenuButton on the swap page, etc.).

Chain brand colors live in `constants/chainRegistry.ts` (exempt from the
"no hex literals in components" rule — brand colors are theme-independent).
The registry exposes a low-alpha `bg` tint that reads beautifully on
Bauhaus's light surfaces but collapses into near-invisibility on Midnight's
deep navy wash. This hook translates the registry values to the
theme-adjusted triple that consumers apply.

| | Bauhaus | Midnight |
|---|---|---|
| `bg` | brand rgba tint (as-is) | `surface.raisedHover` (clearly elevated) |
| `fg` | brand saturated color | brand saturated color |
| `border` | `border.default` | brand saturated color (hue becomes the frame) |

Custom chains (user-added from Settings) have no brand palette and fall
back to neutral surface/foreground tokens in both themes.

```tsx
const config = getChainConfig(tx.chainId);
const resolvedChain = getResolvedChainById(tx.chainId, networksInfo);
const chainBadgeStyle = useChainBadgeStyle(
  resolvedChain?.bg ?? config.bg,
  resolvedChain?.text ?? config.text,
  resolvedChain?.isCustom ?? false,
);

<Badge
  bg={chainBadgeStyle.bg}
  color={chainBadgeStyle.fg}
  borderColor={chainBadgeStyle.border}
  /* … */
>
  <ChainIcon chainId={tx.chainId} size="12px" />
  {resolvedChain?.name ?? tx.chainName}
</Badge>
```

**Don't branch on `isDarkTheme` inside a confirmation screen to adjust a
chain badge** — call this hook so future themes can add their own strategy
in one place.

### `useThemedToast()` (lives in `hooks/useThemedToast.tsx`)

Drop-in replacement for the legacy `useBauhausToast`. Maps each status to an
accent intent (`info → secondary`, `success/warning → highlight`,
`error → primary`) and renders the toast with `surface.raised` /
`border.default` / `boxShadow="card"` so it respects both themes.

```tsx
const showToast = useThemedToast();
showToast({
  title: "Copied!",
  status: "success",
  duration: 2000,
});
```

### Primitives

All five live in `theme/primitives/` and are re-exported from `@/theme`:

| Primitive | When to use |
|---|---|
| `<ThemedCard>` | Surface card. Variants: `default` / `raised` / `sunken`. Set `interactive` for hover motion, `weight="medium"` for the heavier 3px section card stroke (used in Settings / Chains). |
| `<ThemedPanel>` | Larger-padding section container — same shape as `ThemedCard` with bigger defaults. Use for asset-changes panel, gas estimate panel, etc. |
| `<ThemedField>` | `FormControl` + `Label` + `Input` + helper / error wrapper. Handles focus ring and `_invalid` per theme. |
| `<IconBox>` | The bordered + shadowed icon square pattern (~30 sites). |
| `<Decorator>` | Theme-aware corner ornament. Renders nothing in themes without `decorators.cardCorner`. Bauhaus renders the corner square; Midnight renders nothing. |

---

## 3. Authoring rules (the law)

These rules are enforced by code review and the `rg '#[0-9A-Fa-f]{6}'` audit
in `_docs/THEMING_PRD.md` §13:

1. **Never use hex literals in `apps/extension/src/components/` or
   `apps/extension/src/pages/`.** Hex belongs only in `theme/themes/*.ts` (the
   theme definitions) and a few exempt locations (see §6 below).
2. **Never use legacy color names like `bauhaus.red`, `bauhaus.black`,
   `bauhaus.yellow`** in component code. They're banned as of Phase 13. Use
   intent tokens.
3. **`text.*` is permitted** as a permanent compat alias for `fg.*` (610+
   existing call sites). New code should still prefer `fg.*` — it's the
   intent name. Documented in `tokens.ts`.
4. **`status.error.fg` is WHITE in Bauhaus.** It pairs with the RED status
   bg. If you want "red text on a neutral surface" (Reject All buttons,
   "Failed" status text, "Invalid" form errors), use `chart.negative` — the
   only token that's RED in both themes.
5. **For inverted "dark CTA strip" bars**, use `useStripTokens()` from
   `@/theme`. Don't duplicate the `themeId === "midnight" ? … : …` ternary
   inline.
6. **For toasts**, use `useThemedToast()` from `@/hooks/useThemedToast`.
7. **Modal / Menu / Popover / Slider — drop the inline overrides.** The
   factory baseStyles in `createTheme.ts` paint `<ModalContent>`,
   `<MenuList>`, `<PopoverContent>`, `<SliderTrack>`, `<SliderThumb>` from
   theme tokens. Inline `bg` / `border` / `borderRadius` / `boxShadow` props
   on those components are actively wrong — they override the factory output
   and break Midnight.
8. **For invalid form inputs**, set `isInvalid={…}` and let the Input
   baseStyle's `_invalid` state paint the border / shadow / focus ring.
   Don't pass a ternary to `borderColor`.
9. **Bauhaus-only ornaments** (decorative corner squares, triangles, dots
   that exist for Bauhaus's exuberance) should be wrapped in
   `{!isDarkTheme && (…)}` so Midnight skips them. Get `isDarkTheme` from
   `useTheme()`: `const { themeId } = useTheme(); const isDarkTheme = themeId === "midnight";`.
10. **For SVG `stroke=` and CSS triangle hacks via `borderBottomColor`**, use
    the CSS-var form `var(--chakra-colors-accent-highlight)` instead of
    Chakra token names. Chakra style props don't always resolve token paths
    in those slots.
11. **JSX comments inside `{condition && (…)}` are JS, not JSX.** Use
    `// line comments` between `(` and the JSX node, or move the comment
    *outside* the conditional. `{/* JSX comments */}` belong to JSX child
    slots and break parsing inside JS expressions.

---

## 4. Common patterns / recipes

The recipes below are the patterns that recur across Phases 4–13. If you're
writing a new component, reach for these before inventing something new.

### Pattern: surface card

```tsx
// Before — Bauhaus literals everywhere
<Box
  bg="bauhaus.white"
  border="2px solid"
  borderColor="#121212"
  boxShadow="4px 4px 0px 0px #121212"
  p={4}
>
  …
</Box>

// After — primitive
<ThemedCard p={4}>…</ThemedCard>

// Or, if you need raw style props:
<Box
  bg="surface.raised"
  border="2px solid"
  borderColor="border.default"
  boxShadow="card"
  p={4}
>
  …
</Box>
```

### Pattern: inverted CTA strip

```tsx
const stripTokens = useStripTokens();

<Flex bg={stripTokens.bg} color={stripTokens.fg} px={3} py={2}>
  <Text>1 / N</Text>
</Flex>
```

### Pattern: status / soft-warning surface

```tsx
// Saturated warning (heavy attention — header banners)
<Box bg="status.warning.bg" color="status.warning.fg" border="1px solid" borderColor="status.warning.border">
  …
</Box>

// Soft warning wash (full-screen / row tints)
<Box bg="status.warning.tint" color="fg.primary">
  …
</Box>

// Error
<Box bg="status.error.bg" color="status.error.fg" borderColor="status.error.border">
  …
</Box>
```

### Pattern: red text on a neutral surface

```tsx
// WRONG — invisible in Bauhaus (status.error.fg is WHITE)
<Button variant="ghost" color="status.error.fg">Reject All</Button>

// RIGHT — chart.negative is RED in both themes
<Button variant="ghost" color="chart.negative" _hover={{ bg: "status.error.bg", color: "status.error.fg" }}>
  Reject All
</Button>
```

### Pattern: numeric value emphasis (calldata, typed data)

```tsx
<Text color="chart.numeric" fontFamily="mono">
  {value.toString()}
</Text>
```

### Pattern: invalid input

```tsx
// WRONG
<Input borderColor={error ? "bauhaus.red" : "bauhaus.black"} _focus={{ borderColor: error ? "bauhaus.red" : "bauhaus.blue" }} />

// RIGHT — Input baseStyle handles the _invalid state
<Input isInvalid={!!error} value={value} onChange={onChange} />
```

### Pattern: Bauhaus-only ornament

```tsx
const { themeId } = useTheme();
const isDarkTheme = themeId === "midnight";

// Inside JSX:
{!isDarkTheme && (
  <Box position="absolute" top="-6px" right="-6px" w="12px" h="12px" bg="accent.highlight" border="2px solid" borderColor="border.default" />
)}
```

### Pattern: high-contrast "selected pill" toggle

```tsx
// Active uses fg.primary (black in Bauhaus, near-white in Midnight)
// with surface.raised text (white in Bauhaus, dark in Midnight).
// The contrast inverts but the intent — "this is selected" — survives.
<Button
  bg={isSelected ? "fg.primary" : "surface.raised"}
  color={isSelected ? "surface.raised" : "fg.primary"}
>
  …
</Button>
```

### Pattern: cross-tint links inside colored bubbles

A link inside a `accent.secondary` (cool) surface uses `accent.highlight`
(warm), and vice versa. Works in both palettes (Bauhaus blue↔yellow,
Midnight cyan↔amber) without a `useTheme()` branch.

### Pattern: hand-tuned hover shade replacement

```tsx
// Before — hand-tuned hover hex
<Box bg="bauhaus.yellow" _hover={{ bg: "#e6b31c" }}>…</Box>

// After — brightness filter trick. "Darken on hover" reads correctly in both
// palettes without needing two literal hover shades.
<Box bg="accent.highlight" _hover={{ filter: "brightness(0.92)" }}>…</Box>
```

---

## 5. Adding a new theme

Adding a third theme — say, `paper.ts` — is intentionally cheap. The full
flow:

1. **Copy a starter.** `cp theme/themes/midnight.ts theme/themes/paper.ts`.
   Midnight is usually a better starting point than Bauhaus because it's
   already structured around the v3.2.0 contract additions
   (`status.warning.tint`, `chart.numeric`, `accentFg.*`, etc.).

2. **Fill in every field of `ThemeTokens`.** TypeScript will tell you what's
   missing. Pay special attention to:
   - `accentFg.*` — must read well on `accent.*` backgrounds. Test contrast.
   - `chart.numeric` — must be visible on `surface.raised`.
   - `chart.negative` — **must be RED in your theme.** Component code relies
     on this being the only "red in every theme" guarantee for Reject All
     buttons, "Failed" status, "Invalid" form errors.
   - `status.warning.tint` — soft warning wash, distinct from
     `status.warning.bg`. If you don't supply one, components fall back to
     `bg`, which is usually too saturated for full-screen washes.
   - `legacy.*` — best-effort dark / light mappings of the legacy palette so
     non-migrated screens (anything still reading `bauhaus.*` / `bg.*` /
     `text.*`) renders sensibly. Don't try to perfect this block — fix the
     consumer in its own commit.
   - `decorators` — omit entirely if your theme has no corner ornaments
     (like Midnight). The `Decorator` primitive renders nothing when the
     field is absent.

3. **Add a `ThemePreview`.** Two-color background + foreground + three accent
   chips. Used by the picker card in Settings → Appearance.

4. **Register the theme in `theme/ThemeProvider.tsx`.** Two changes:
   ```ts
   import { paperTokens } from "./themes/paper";

   export const themes: Record<ThemeId, ThemeTokens> = {
     bauhaus: bauhausTokens,
     midnight: midnightTokens,
     paper: paperTokens,
   };

   export const themeList: ThemeTokens[] = [bauhausTokens, midnightTokens, paperTokens];
   ```

5. **Widen the `ThemeId` union** in `theme/tokens.ts`:
   ```ts
   export type ThemeId = "bauhaus" | "midnight" | "paper";
   ```

6. **Update the validators in `theme/useThemeSelection.ts` and
   `theme/bootstrap.ts`** to recognize the new ID. Search for
   `value === "bauhaus" || value === "midnight"` and add the new branch.

7. **Update CSS pre-paint selectors** in `apps/extension/src/index.css` and
   `apps/extension/src/onboarding.css` if your theme needs a different body
   wash than the default. Add a new `html[data-theme="paper"]` selector with
   the body background.

8. **Build, load, walk the app.** `pnpm build:extension`, reload extension,
   switch to your theme from Settings → Appearance. Walk every screen × every
   wallet type (Bankr API, Private Key, Seed Phrase) to spot-check.

**Zero component file edits required.** If you find yourself wanting to edit
a component to make a specific screen work in your theme, that's a sign that
the contract or a primitive needs to grow — add the field to `ThemeTokens`
and have all themes provide it, rather than special-casing in component code.

---

## 6. Exempt locations (where literals are okay)

The "no hex literals in components" rule has a few principled exemptions:

| Location | Why exempt |
|---|---|
| `apps/extension/src/theme/themes/*.ts` | Theme definitions. Hex is the entire point. |
| `apps/extension/src/lib/chainIcons.ts` | Chain brand colors (Ethereum is `#627EEA` regardless of theme). Brand identity ≠ theme color. |
| `apps/extension/src/constants/chainRegistry.ts` | Same — chain brand colors. |
| `apps/extension/src/chrome/pendingTxStorage.ts`, `pendingSignatureStorage.ts` | `chrome.action.setBadgeBackgroundColor` requires literal hex; the Chrome API can't read CSS vars. |
| `apps/extension/src/index.css`, `onboarding.css` | Body background lives outside the React tree. Use `html[data-theme="…"]` selectors to make CSS theme-aware. |
| `apps/extension/src/App.tsx` (WalletChan OS brand banner gradient) | Brand element, intentionally theme-independent. |

The audit query that catches accidental new literals:

```bash
rg '#[0-9A-Fa-f]{6}' apps/extension/src \
  --glob '!theme/**' \
  --glob '!lib/chainIcons.ts' \
  --glob '!constants/chainRegistry.ts' \
  --glob '!chrome/pendingTxStorage.ts' \
  --glob '!chrome/pendingSignatureStorage.ts' \
  --glob '!*.css'
```

After Phase 13 the only match is the OS brand banner gradient.

---

## 7. Storage

One key only:

| Location | Key | Shape | Default | Introduced |
|---|---|---|---|---|
| `chrome.storage.local` | `selectedThemeId` | `"bauhaus" \| "midnight"` | Fresh install writes `"midnight"`; missing/invalid fallback is `"bauhaus"` | v3.2.0 |

Why `local`, not `sync`: cross-device sync would cause a flash on the second
device during hydration (device A is on Bauhaus, device B opens defaulted to
Midnight, then switches). Local gives a clean per-device experience without
cross-device preference churn.

**Migration:** none needed. Absence of the key resolves to `"bauhaus"` →
existing users see legacy visuals on first load post-update.

A synchronous `window.localStorage` mirror is written on every update so the
pre-React bootstrap can read it without an async round trip. The mirror is
opportunistic — if it drifts, the async hydration in `useThemeSelection`
catches up after mount.

See `_docs/STORAGE.md` for the canonical storage key reference.

---

## 8. Token contract reference

The full token vocabulary (Surface / Foreground / Border / Accent / Status /
Chart / Decorators) is documented with tables and per-token semantics in
`_docs/STYLING.md`. The TypeScript source of truth is
`apps/extension/src/theme/tokens.ts`.

Quick mental model:

- **Surfaces** are background layers, deepest → highest:
  `base → raised → raisedHover → sunken`. `overlay` is the modal scrim.
- **Foreground** is text hierarchy: `primary → secondary → muted`. `inverse`
  is text that sits on accent fills.
- **Accent** is intent-named, never color-named: `primary` is the main CTA,
  `secondary` is supporting actions / links, `highlight` is attention. The
  parallel `accentFg.*` block is the contrast text color paired with each
  accent (so the factory can build button/badge variants without guessing).
- **Status** is `{success, warning, error, info}` × `{bg, fg, border, tint?}`.
  `tint` is optional — currently set on `warning` only for soft full-screen
  washes (cross-dapp batch screen, gas estimate fallback row).
- **Chart** is data-viz: `positive` (green), `negative` (red — in **every**
  theme, by contract), `neutral`, `numeric` (calldata digit emphasis), and a
  5-element `series` for multi-line charts.
- **Decorators** is optional — present on Bauhaus (`cardCorner: "square"`),
  absent on Midnight. Themes that supply ornaments get them rendered by the
  `Decorator` primitive; themes that don't get nothing.

---

## 9. Where the component baseStyles live

`theme/createTheme.ts` builds Chakra component configs from tokens. Each
`buildXxx(t)` function reads from the active `ThemeTokens` and emits a
`baseStyle` / `variants` / `defaultProps` block. The functions registered on
the Chakra `components` map are:

| Component | Function | Notes |
|---|---|---|
| `Button` | `buildButton(t)` | `primary` / `secondary` / `highlight` / `outline` / `ghost` / `danger` variants; press / hover motion sourced from `t.motion`. |
| `Input` | `buildInput(t)` | Drives focus ring + `_invalid` from theme tokens. Set `isInvalid={…}` instead of overriding `borderColor`. |
| `Select` | `buildSelect(t)` | |
| `Badge` | `buildBadge(t)` | Intent variants matching the Button accents. |
| `Alert` | `buildAlert(t)` | Pulls from `status.*`. |
| `Divider` | `buildDivider(t)` | |
| `Code` | `buildCode(t)` | |
| `Heading` | `buildHeading(t)` | Reads `t.headingStyle` (transform / tracking / weight / lineHeight). |
| `FormLabel` | `buildFormLabel(t)` | Reads `t.labelStyle`. |
| `Switch` | `buildSwitch(t)` | |
| `Spinner` | `buildSpinner()` | |
| `Modal` | `buildModal(t)` | Paints `<ModalContent>` from tokens. **Drop inline overrides.** |
| `Menu` | `buildMenu(t)` | Paints `<MenuList>` from tokens. **Drop inline overrides.** |
| `Popover` | `buildPopover(t)` | Paints `<PopoverContent>` from tokens. **Drop inline overrides.** |
| `Slider` | `buildSlider(t)` | Sets `<SliderTrack>` / `<SliderThumb>` `borderRadius` from `t.radii.button`. |
| `Tooltip` | `buildTooltip(t)` | |

If you find yourself reaching for inline `bg` / `border` / `boxShadow` /
`borderRadius` props on a component listed above, the answer is almost always
"delete the inline override." The factory has it covered.

---

## 10. Testing changes

Any change that touches the theme engine or theme files must be smoke-tested
in **both themes**:

- `pnpm build:extension`
- Reload at `chrome://extensions`
- Walk the affected screens in Bauhaus → switch to Midnight → walk again
- For tx / signature flows: test with **all three wallet types** (Bankr API,
  Private Key, Seed Phrase) per `CLAUDE.md`. Even though theme work doesn't
  touch logic, the UI is shared across wallet types and a regression in one
  rendering path is easy to miss.
- Toggle Settings → Appearance, reload the extension, confirm the choice
  persists.
- For storage / bootstrap changes: open a second Chrome profile to confirm
  the choice does NOT sync across devices.

Visual QA checklist for "did this break Bauhaus":

- Run `rg '#[0-9A-Fa-f]{6}' apps/extension/src --glob '!theme/**' --glob '!lib/chainIcons.ts' --glob '!constants/chainRegistry.ts' --glob '!chrome/pending*' --glob '!*.css'` and confirm the only match is the OS brand banner gradient in `App.tsx`.
- Run `rg 'bauhaus\.' apps/extension/src --glob '!theme/**'` and confirm there are no live references (only docstring / comment matches).
- Run `rg 'translate\(2px, 2px\)' apps/extension/src` and confirm the only match is `theme/themes/bauhaus.ts` motion config.
