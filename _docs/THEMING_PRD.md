# Theming Engine PRD

Product spec for introducing a modular theme engine to the WalletChan browser extension. The first iteration ships **two themes**:

1. **Bauhaus** (current) — light, bold, geometric, constructivist.
2. **Midnight** (new) — fresh, modern, dark, soft-edged, premium.

This doc is the single source of truth for scope, architecture, token contracts, phasing, and testing. Every phase is designed to be independently verifiable so we can ship/test one component at a time without breaking the app.

> **Logic is out of scope.** This is a UI/design-only effort. No handlers, no message types, no chrome APIs, no wallet flows change. If a phase requires a logic change to land, stop and escalate.

---

## 1. Goals & Non-Goals

### Goals

- Users can toggle between **Bauhaus** and **Midnight** from Settings → Appearance and the entire extension re-renders in the chosen theme instantly, with no flash on subsequent loads.
- Adding a third theme in the future is **one tokens file + optional component overrides**, not a grep-and-replace campaign.
- Each theme can define its own **visual anatomy**, not just colors: radii, shadows, borders, typography style, press/hover motion, decorator shapes.
- The Bauhaus theme looks **pixel-identical** to today after the refactor. The refactor must be transparent to existing users.
- Each phase is a self-contained, testable unit: one screen or component at a time.

### Non-Goals

- No logic/handler/storage-logic changes. Adding one storage key for `selectedTheme` is the only storage change.
- No new features beyond theming (no per-theme wallpapers, no theme marketplace, no custom themes).
- Not targeting Chakra UI v3 migration (we stay on v2.9).
- Not changing the website or onboarding wizard's branding identity (those remain Bauhaus-only for now — scope is the extension popup/sidepanel).
- Not supporting `chrome.storage.sync` for the theme preference (local is fine; prevents cross-device flash).
- No dark-mode auto-detection via `prefers-color-scheme`. User picks explicitly.

---

## 2. Architecture Decision Record

We evaluated three approaches (full write-up in the research that preceded this PRD):

| Approach | Verdict |
|---|---|
| **A.** Multiple complete `extendTheme` objects, hot-swap via `<ChakraProvider theme>` | Works but duplicates structure across themes. Scales poorly past 2 themes. |
| **B.** CSS custom properties at `:root` + single Chakra theme | Instant swap but can't cleanly express per-theme *component anatomy* (different radii, press effects, shadow styles, hover behaviors). Would force us to keep Bauhaus DNA in every theme. |
| **C.** Token-driven theme factory (**chosen**) | Each theme is a `ThemeTokens` object; a `createTheme(tokens)` factory assembles a Chakra theme from it. Adds one level of indirection but fully decouples theme identity from component code. |

**Decision: Approach C.** Rationale:

1. The user's explicit requirement — "each component may need redesign per theme" — means pure color swapping (B) is insufficient. Bauhaus has `translate(2px, 2px)` press effects and 4px offset hard shadows; Midnight will want soft luminous shadows, subtle hover lifts, and rounded corners. These are structural, not cosmetic.
2. Semantic-token discipline is already 80% of the way there (1,451 `bauhaus.*` references across 64 files). The factory approach lets us preserve that investment — we rename tokens once and move on.
3. The factory acts as a **contract enforcement boundary**. A new theme must supply every required token or TypeScript errors. No chance of "I forgot to define `surface.elevated` and now half the app is transparent."

### The big hidden cost (and how we handle it)

There are **~915 inline visual-language props** scattered across ~55 files today:

- **~238 hardcoded hex literals** (`#D02020`, `#1040C0`, `#F0C020`, `#121212`) — mostly in `boxShadow` and toast/decorator code.
- **~277 inlined press/hard-shadow snippets** (`translate(2px, 2px)`, `4px 4px 0px 0px #121212`).
- **~400 inline `border="2px solid"` / `borderRadius="none"`** props.

Any of these that remain after the refactor will look *wrong* under Midnight. Phases 2 and 3 are explicitly dedicated to flushing them out via shared primitives (`<ThemedCard>`, `<ThemedPanel>`, `<ThemedField>`) and Chakra component defaults.

### `useBauhausToast.tsx` — an exemplar

`apps/extension/src/hooks/useBauhausToast.tsx:12-17` hardcodes hex values in a JS object. It's the canonical "anti-pattern specimen". Part of Phase 4 is refactoring it into a theme-aware `useThemedToast()` hook that reads from the current theme's `tokens.toast` block. Once this is clean, we rename it back to `useToast` and the name stops lying.

---

## 3. The Token Contract

All themes supply a `ThemeTokens` object matching this interface. The factory refuses to build if a field is missing.

```ts
// apps/extension/src/theme/tokens.ts
export interface ThemeTokens {
  id: ThemeId;                 // "bauhaus" | "midnight"
  name: string;                // "Bauhaus"
  description: string;         // Used in the theme picker UI
  colorMode: "light" | "dark"; // Drives Chakra's initialColorMode
  preview: {                   // For the theme picker card
    bg: string;
    fg: string;
    accents: [string, string, string];
  };

  colors: {
    // Surfaces — background layers from deepest to highest elevation
    surface: {
      base: string;     // Page background
      raised: string;   // Cards, modals, headers
      sunken: string;   // Input fields, recessed containers
      overlay: string;  // Modal scrim / backdrop
    };
    // Foreground — text and icon hierarchy
    fg: {
      primary: string;   // Main text
      secondary: string; // Labels, metadata
      muted: string;     // Placeholders, disabled
      inverse: string;   // Text on accent fills
    };
    // Borders — stroke hierarchy
    border: {
      subtle: string;
      default: string;
      strong: string;
      focus: string;    // Focus ring color
    };
    // Accents — brand/action colors (intent-named, not color-named)
    accent: {
      primary: string;   // Main CTA (Bauhaus red → Midnight indigo/violet)
      secondary: string; // Supporting (Bauhaus blue → Midnight cyan)
      highlight: string; // Attention (Bauhaus yellow → Midnight amber)
    };
    // Semantic status colors
    status: {
      success: { bg: string; fg: string; border: string };
      warning: { bg: string; fg: string; border: string };
      error:   { bg: string; fg: string; border: string };
      info:    { bg: string; fg: string; border: string };
    };
    // Chart/data viz palette (portfolio chart, decoded params, etc.)
    chart: {
      positive: string;
      negative: string;
      neutral: string;
      series: [string, string, string, string, string];
    };
  };

  // Typography
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  headingStyle: {
    transform: "uppercase" | "none";
    tracking: string;      // letter-spacing
    weight: number;        // 700, 800, 900
    lineHeight: string;
  };
  labelStyle: {
    transform: "uppercase" | "none";
    tracking: string;
    weight: number;
  };

  // Structure
  radii: {
    button: string;   // "0" for Bauhaus, "10px" for Midnight
    input: string;
    card: string;
    modal: string;
    badge: string;
    pill: string;     // Always "9999px"
  };
  borders: {
    thin: string;     // "2px solid {border.default}"
    thick: string;    // "4px solid {border.default}"
    hairline: string; // "1px solid {border.subtle}"
  };
  shadows: {
    card: string;
    cardHover: string;
    modal: string;
    focus: string;
    button: string;
    buttonPressed: string | null;  // null = no press shadow change
    pressed: string | null;        // same
  };

  // Motion — how components react
  motion: {
    press: {
      transform: string;   // "translate(2px, 2px)" for Bauhaus, "scale(0.98)" for Midnight
      shadowOverride: string | null;
    };
    hover: {
      transform: string;
      shadowOverride: string | null;
    };
    transitionBase: string; // "all 0.2s ease-out"
    transitionSmooth: string;
  };

  // Decorators — theme-specific visual flourishes (optional, defaults to none)
  decorators?: {
    cardCorner?: "dot" | "square" | "triangle" | "none";
    dividerStyle?: "solid-thick" | "solid-thin" | "dashed-glow" | "none";
    shapesLogo?: React.ComponentType;  // For ShapesLoader etc.
  };

  // Component overrides — escape hatch for when tokens aren't expressive enough.
  // Applied on top of the factory-generated Chakra component config.
  componentOverrides?: Partial<ChakraComponentsConfig>;
}
```

**Rules:**

- No component file may hardcode a color, border, shadow, or radius. Every visual decision reads from tokens.
- Variant names are **intent-based**: `variant="primary"` / `"secondary"` / `"highlight"` / `"danger"` / `"ghost"` / `"outline"`. We rename today's `variant="yellow"` / `"blue"` etc. in Phase 1.
- Decorators are opt-in per theme. Bauhaus ships with geometric corners; Midnight probably won't.

---

## 4. Midnight — Design Language

This is the design brief for the new theme. Designers implementing it should treat these as hard constraints.

### Philosophy

Midnight is the opposite of Bauhaus in feeling, not just palette: where Bauhaus is **bold, constructive, extroverted**, Midnight is **calm, precise, focused**. Think premium financial tooling at night — Linear, Arc, Superhuman's dark mode. It is an environment for reading transaction data carefully, not a poster.

### Palette (proposed — may be tuned during phase 1 visual review)

| Token | Hex | Role |
|---|---|---|
| `surface.base` | `#0A0C10` | Page background (near-black with subtle blue cast) |
| `surface.raised` | `#111419` | Cards, modals, header |
| `surface.sunken` | `#07090C` | Input fields, code blocks |
| `surface.overlay` | `rgba(0, 0, 0, 0.72)` | Modal scrim |
| `fg.primary` | `#F5F7FA` | Primary text (slightly off-white to avoid harshness) |
| `fg.secondary` | `#9BA4B0` | Labels, metadata |
| `fg.muted` | `#5F6876` | Placeholders, disabled |
| `fg.inverse` | `#0A0C10` | Text on accent fills |
| `border.subtle` | `#1A1F27` | Hairlines |
| `border.default` | `#242A33` | Standard borders |
| `border.strong` | `#323945` | Dividers, card outlines |
| `border.focus` | `#7C8BFF` | Focus ring |
| `accent.primary` | `#7C8BFF` | Primary CTA — iridescent indigo |
| `accent.secondary` | `#00D4E6` | Cyan — secondary actions, links |
| `accent.highlight` | `#F6C86E` | Warm amber — highlights, coin icons |
| `status.success` | `{ bg: "#0E2E1F", fg: "#4ADE80", border: "#1F5033" }` | |
| `status.warning` | `{ bg: "#2E240E", fg: "#F6C86E", border: "#53401F" }` | |
| `status.error` | `{ bg: "#2E0E13", fg: "#FF6B7A", border: "#551F2A" }` | |
| `status.info` | `{ bg: "#0E1B2E", fg: "#7C8BFF", border: "#1F3255" }` | |

### Structural rules

- **Radii**: `button: 10px`, `input: 10px`, `card: 14px`, `modal: 16px`, `badge: 6px`, `pill: 9999px`. Softer, modern, still deliberate.
- **Borders**: `thin: 1px solid border.default`, `thick: 1px solid border.strong`. Midnight's weight comes from shadow + surface contrast, not thick strokes.
- **Shadows**: **NO hard offsets.** Use soft glow + elevation.
  - `card`: `0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)`
  - `cardHover`: `0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 32px rgba(0,0,0,0.5)`
  - `modal`: `0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,139,255,0.08)`
  - `focus`: `0 0 0 3px rgba(124,139,255,0.32)` (indigo ring glow)
  - `button`: `0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 12px rgba(0,0,0,0.4)`
- **Motion**:
  - Press: `transform: scale(0.98); shadowOverride: null` — subtle depress, no shadow swap.
  - Hover: `transform: translateY(-1px); shadowOverride: cardHover`.
  - Transitions: `all 0.16s cubic-bezier(0.2, 0.6, 0.2, 1)` — snappier than Bauhaus's easeOut.
- **Typography**:
  - Heading: **title case**, no uppercase. `tracking: -0.01em`, `weight: 700`, `lineHeight: 1.1`. Keep Outfit font — it reads beautifully dark.
  - Labels: **sentence case**, no uppercase, `weight: 600`, `tracking: 0`. (Bauhaus uses aggressive uppercase labels; Midnight would look yelly.)
- **Decorators**: None. No corner dots, no thick dividers, no rotated squares. Midnight's personality is in typography rhythm, generous whitespace, and luminous focus states — not geometric ornaments.

### Component-specific notes

- **Buttons**: Primary uses a subtle gradient (`linear-gradient(180deg, #8A99FF, #6C7BEF)`) with inset highlight. Outline buttons are `background: transparent; border: 1px solid border.strong`. Ghost buttons are bare text with hover `bg: whiteAlpha.50`.
- **Inputs**: `background: surface.sunken`, `border: 1px solid border.default`, focus gets indigo ring (`shadows.focus`) — no border color change.
- **Modals**: Heavy backdrop blur (`backdrop-filter: blur(8px)`) on the scrim. Card itself has `surface.raised` + `border.strong` + `shadows.modal`.
- **Badges**: Filled with low-opacity status backgrounds, colored text. No hard borders.
- **Tooltips**: `surface.raised` bg with hairline border, matches card style.
- **ShapesLoader** (the Chat loading indicator with three shapes bouncing): In Bauhaus, it's red circle / blue square / yellow triangle. In Midnight, replace with three pulsing indigo dots (simpler, fits the aesthetic). This is a `decorators.shapesLogo` theme-supplied component.

---

## 5. Directory Layout

New structure under `apps/extension/src/theme/`:

```
apps/extension/src/theme/
├── index.ts                 # Exports: themes, createTheme, ThemeProvider, useTheme
├── tokens.ts                # ThemeTokens interface + shared type definitions
├── createTheme.ts           # Factory: tokens → Chakra theme
├── ThemeProvider.tsx        # React context + storage sync + <ChakraProvider>
├── useThemeSelection.ts     # Hook to read/write selected theme
├── themes/
│   ├── bauhaus.ts           # Ported from current theme.ts
│   └── midnight.ts          # New dark theme
└── primitives/
    ├── ThemedCard.tsx       # <Card> → reads shadows/borders/radii from theme
    ├── ThemedPanel.tsx      # Section container with theme-aware chrome
    ├── ThemedField.tsx      # Input wrapper (label + field + hint)
    ├── IconBox.tsx          # Bordered icon container (replaces inline pattern)
    └── Decorator.tsx        # Renders theme.decorators.cardCorner
```

The existing `apps/extension/src/theme.ts` gets deleted at the end of Phase 1 (its contents move into `themes/bauhaus.ts`).

---

## 6. Storage Contract

**One new key only.**

| Location | Key | Shape | Default | Introduced |
|---|---|---|---|---|
| `chrome.storage.local` | `selectedThemeId` | `"bauhaus" \| "midnight"` | `"bauhaus"` | v3.2.0 |

**Why `local`, not `sync`:** sync causes cross-device flash during hydration (device A is on Midnight, opens on device B which defaulted to Bauhaus, flashes). Local gives a clean per-device experience with zero migration complexity.

**Hydration pattern** (avoids flash on popup open):

1. `ThemeProvider` synchronously renders with `themes.bauhaus` on first mount.
2. Immediately after mount, it calls `chrome.storage.local.get("selectedThemeId")` and swaps.
3. To eliminate the flash entirely, we write the selected theme ID to `document.documentElement.dataset.theme` in `index.tsx` **before** React mounts, and read it synchronously from `ThemeProvider`. The dataset attribute is updated every time the user changes themes.

**Migration:** None needed — absence of the key = new install or existing user on default Bauhaus. Both cases resolve to `"bauhaus"` → legacy visuals preserved.

**Docs to update in Phase 1:**

- `_docs/STORAGE.md` — add `selectedThemeId` row under `### Settings`.
- `_docs/PUBLISHING.md` — add to pre-release storage checklist as a no-migration key.
- `CLAUDE.md` — add `theme/` under Key Extension Files.

---

## 7. Phased Implementation

Each phase is a separate PR (or commit). After each phase, the user tests the specific surface in both Bauhaus **and** Midnight before moving on. Bauhaus must remain visually identical across every phase.

Numbering: **P1–P13**. Phases P1–P3 are foundation (no user-visible change yet). Phases P4–P12 each migrate one screen or component cluster. P13 is cleanup + docs.

### Phase 1 — Foundation: Theme Engine Scaffolding ✅ Shipped

**Goal:** Land the plumbing. Zero user-visible change.

**Files added:**

- `apps/extension/src/theme/tokens.ts` — `ThemeTokens` interface.
- `apps/extension/src/theme/createTheme.ts` — factory function.
- `apps/extension/src/theme/ThemeProvider.tsx` — context provider wrapping `<ChakraProvider>`.
- `apps/extension/src/theme/useThemeSelection.ts` — hook.
- `apps/extension/src/theme/themes/bauhaus.ts` — **exact port** of current `theme.ts` into the new token shape. Nothing changes visually.
- `apps/extension/src/theme/themes/midnight.ts` — stub. Content: copy bauhaus, replace only `colors.surface`, `colors.fg`, and `colorMode: "dark"`. Everything else still looks Bauhaus. This phase's Midnight is intentionally ugly — we'll redesign it properly in each per-screen phase.
- `apps/extension/src/theme/index.ts` — barrel exports.

**Files modified:**

- `apps/extension/src/index.tsx` — replace `<ChakraProvider theme={theme}>` with `<ThemeProvider>`. Add the pre-mount `document.documentElement.dataset.theme` bootstrap.
- Delete `apps/extension/src/theme.ts` after confirming nothing imports it.
- `_docs/STORAGE.md`, `_docs/PUBLISHING.md`, `CLAUDE.md` — storage doc updates.

**Variant renames** (this is the "breaking" surface area of P1):

- `Button variant="yellow"` → `variant="highlight"`
- `Button variant="blue"` → `variant="secondary"` (and current `secondary` becomes `outline` variant behavior — check usages)
- `Button variant="red"` / `"danger"` → `variant="danger"` (keep, already intent-named)
- `Badge variant="yellow|blue|red"` → `variant="highlight|secondary|danger"`

This requires a grep + replace sweep. ~30-50 usage sites.

**Test gate:**

- `pnpm build:extension` succeeds.
- Reload extension. Open every screen that has a button/badge. **Everything looks identical to before.**
- Open DevTools → Application → Storage → check `selectedThemeId` key absent (will be written when user first picks a theme).
- Temporarily hardcode `<ThemeProvider initialTheme="midnight">` and verify: surfaces are dark, text is readable (it'll look mismatched — expected for now, Midnight isn't designed yet beyond surfaces/text). Revert.

### Phase 2 — Primitives: The Four Atoms ✅ Shipped

**Goal:** Extract the four repeated patterns that account for ~80% of inline visual styling. Every component that follows will consume these.

> **Status:** All five primitives landed under `apps/extension/src/theme/primitives/` and are re-exported from `@/theme`. No usages yet — Phase 4+ migrations will start consuming them. Build green (5/5 targets), no new lint issues.

**Files added:**

- `apps/extension/src/theme/primitives/ThemedCard.tsx`
  - Props: `variant?: "default" | "raised" | "sunken"`, `interactive?: boolean`, plus standard Chakra `BoxProps`.
  - Internally: reads `theme.colors.surface.*`, `theme.borders.*`, `theme.shadows.card`, `theme.radii.card`. Applies hover motion if `interactive`.
- `apps/extension/src/theme/primitives/ThemedPanel.tsx`
  - For larger sections (e.g., the asset changes panel, gas estimate panel). Same props, larger padding defaults.
- `apps/extension/src/theme/primitives/ThemedField.tsx`
  - Wraps `FormLabel + Input + FormHelperText / FormErrorMessage`. Handles focus ring behavior per theme.
- `apps/extension/src/theme/primitives/IconBox.tsx`
  - The pattern used ~30 times: small square with border + shadow containing an icon. (Toast icons, feature icons, confirmation icons.)
- `apps/extension/src/theme/primitives/Decorator.tsx`
  - Renders nothing in themes without `decorators.cardCorner`. Renders the Bauhaus corner dot/square/triangle when present.

**Files modified:** None yet. Primitives exist but are unused. This phase is pure addition.

**Test gate:**

- `pnpm build:extension` succeeds.
- Open Chrome DevTools React tree — verify primitives are importable but not rendered (no usages yet).
- Write a throwaway test page (don't commit) that renders each primitive in both themes to sanity-check they don't crash. Delete before commit.

### Phase 3 — Midnight Design Pass ✅ Shipped

**Goal:** Populate `themes/midnight.ts` with the full design system from Section 4 of this PRD. No component migrations yet — this just fills in the tokens.

> **Status:** Midnight tokens fully populated per §4 — modest radii (10–16px), 1px borders, soft luminous shadows (no hard offsets), `scale(0.98)` press, `translateY(-1px)` hover with cardHover shadow swap, snappier `0.16s cubic-bezier` transitions, title-case headings, sentence-case labels, decorators omitted entirely. Build green (5/5 targets), no new lint issues. Theme is still gated behind a dev-only `chrome.storage.local` toggle — Phase 4 lands the Settings picker.

**Files modified:**

- `apps/extension/src/theme/themes/midnight.ts` — full palette, radii, borders, shadows, motion, heading style.

**Test gate:**

- Temporarily switch the provider to `initialTheme="midnight"`, reload, and walk the app. **Expect a mix of correct and broken.** Settings pages and any screen that already uses only theme tokens will look *closer* to Midnight; components that hardcode hex/shadow/border will look like Bauhaus elements in a dark room.
- Document the broken ones with screenshots. This is our visual regression baseline — every subsequent phase should shrink the broken list.
- **Revert the provider change.** Ship this phase with Midnight still inaccessible from the UI.

### Phase 4 — Theme Picker + Settings Page Migration ✅ Shipped

**Goal:** First user-facing change. Users can toggle themes from Settings. The Settings page itself is also migrated to be theme-aware so testing loop is immediate.

> **Status:** Picker ships at **Settings → Appearance**. All 7 Settings files migrated (`index.tsx`, `AppearanceSettings.tsx` (new), `ChangePassword.tsx`, `AutoLockSettings.tsx`, `AgentPasswordSettings.tsx`, `Chains.tsx`, `AddChain.tsx`, `EditChain.tsx`). Token contract extended with `borders.medium` (3px Bauhaus / 1px Midnight) for the heavily-used section card weight. `ThemedCard` / `ThemedPanel` got a `weight` prop. Bauhaus `cardCorner` corrected from `"dot"` to `"square"` to match actual UI usage. Build green (5/5 targets), no new lint issues. Picker shows a yellow rollout warning banner that points users at the limitation; remove the banner once Phases 5–12 land.

**Files added:**

- `apps/extension/src/components/Settings/AppearanceSettings.tsx` — theme picker.
  - Two cards side by side, each showing a mini preview (colored swatches from `theme.preview`), theme name, description, and a "Selected" badge on the active one.
  - Clicking a card updates via `useThemeSelection`, triggers immediate re-render.

**Files modified:**

- `apps/extension/src/components/Settings/index.tsx`
  - Add `appearance` to `SettingsTab` union.
  - Add menu row "Appearance" with paintbrush icon.
  - Add `<AppearanceSettings>` render branch.
  - Migrate all hardcoded visuals in this file to tokens / primitives.
- `apps/extension/src/components/Settings/ChangePassword.tsx` — migrate.
- `apps/extension/src/components/Settings/AutoLockSettings.tsx` — migrate.
- `apps/extension/src/components/Settings/AgentPasswordSettings.tsx` — migrate.
- `apps/extension/src/components/Settings/Chains.tsx`, `AddChain.tsx`, `EditChain.tsx` — migrate.

**Refactor heuristic** (reused in every migration phase):

1. Find all hex literals in the file. Replace with tokens. Example: `borderColor="#121212"` → `borderColor="border.default"`.
2. Find `boxShadow="Xpx Xpx 0px 0px #121212"` patterns. Replace with `boxShadow="card"` (token-driven).
3. Find `border="2px solid"` / `border="4px solid"` patterns. Replace with `borders.thin` / `borders.thick` (via sx prop or Chakra config).
4. Find `borderRadius="none"` hardcodes. Remove — radii come from component-level Chakra defaults now.
5. Find `translate(2px, 2px)` press effects. Remove — replaced by theme-aware `:active` behavior in the base `Button` variant.
6. Wrap raw `Box` cards in `<ThemedCard>` wherever it fits.
7. If a visual is not tokenizable (e.g., the Chat ShapesLoader decoration), move the logic to `theme.decorators` and inject the theme-specific version.

**Test gate:**

- Open Settings. Verify Bauhaus looks identical to before.
- Click Appearance → Midnight. Verify Settings now renders in Midnight.
- Click back to Bauhaus. Verify instant return to Bauhaus, no flash.
- Reload extension. Verify selected theme persists.
- Walk all Settings sub-pages in both themes.
- Walk non-migrated screens (Home, Tx confirmation, etc.) in **Bauhaus only**. Verify nothing regressed — should look identical.
- **Known acceptable state:** non-migrated screens in Midnight look broken. Do NOT test those in Midnight yet. Add a subtle warning banner in Settings > Appearance in dev builds: "Midnight theme is rolling out — some screens not yet converted."

### Phase 5 — Unlock Screen + App Shell Header  ✅ Shipped

**Goal:** First impression after opening the popup — must look great in both themes.

**Files modified:**

- `apps/extension/src/components/UnlockScreen.tsx` — migrated. Logo container, lock badge, form card, password input, error banner, "Forgot Password?" link, Reset Extension modal, and footer all use intent tokens. The form-card corner uses the `Decorator` primitive (Bauhaus renders the yellow square; Midnight renders nothing). The password input dropped its inline `bauhaus.*` border/focus overrides and now uses the theme's default `Input` styling, including `_invalid` for the error state.
- `apps/extension/src/App.tsx` — header section migrated (lines ~2437-2620): main wrapper, header bar, "Powered by" yellow strip, and WalletChan OS gradient banner. Added `useTheme()` import + `isDarkTheme` flag at the top of `App()`. The header bar uses a theme-aware pair (`fg.primary`+`fg.inverse` in Bauhaus → high-contrast black strip with white text; `surface.sunken`+`fg.primary` in Midnight → calm recessed dark strip with light text). The body of the popup is left to Phase 6.
- `apps/extension/src/components/AccountSwitcher.tsx` — fully migrated. MenuButton (active account chip), MenuList shadow/border, all five account-type badges (Bankr/Private Key/Seed Phrase/View Only/ENS), the Add Account row icon, and the copy-to-clipboard hover/success colors all use intent tokens. Hardcoded `#121212` shadows replaced with Chakra `boxShadow="card"` / `"cardHover"`. The "View Only" green badge uses `status.success.fg`. Removed `borderRadius="0"` from MenuButton + MenuList so Midnight's card radius can take effect.
- `apps/extension/src/components/ChainIcon.tsx` — overlay label badge changed from `bauhaus.black`/`bauhaus.white` to literal `"black"`/`"white"`. Reason: this badge is intentionally a "physical sticker" that must stay dark-on-light regardless of theme, and the legacy `bauhaus.white` alias would map to a dark surface in Midnight (making the text invisible).

**Test gate:**

- Lock the extension. Open popup → see UnlockScreen in both themes.
- Enter wrong password → error state in both themes.
- Unlock successfully → see header in both themes.
- Open account switcher → menu styling correct in both themes.
- Switch between accounts (Bankr / PK / Seed) → verify no logic regression.

### Phase 6 — Home Page Body (Portfolio, Tabs, Token Holdings) ✅ Shipped

**Goal:** The main popup surface.

**Files modified:**

- `apps/extension/src/components/CopyButton.tsx` — `bauhaus.yellow`/`bauhaus.blue` → `accent.highlight`/`accent.secondary` for copy feedback states.
- `apps/extension/src/components/MiddleTruncatedAddress.tsx` — text `color="bauhaus.white"` → `color="inherit"` so the parent address pill picks the right contrast color in each theme.
- `apps/extension/src/components/FromAccountDisplay.tsx` — avatar borders use `border.default` instead of `bauhaus.black`.
- `apps/extension/src/components/PendingTxBanner.tsx` — full repaint to `accent.highlight` + `border.default`; hardcoded `3px 3px 0px 0px #121212` shadow → `boxShadow="card"`/`"cardHover"`.
- `apps/extension/src/components/PortfolioChart.tsx` — added `useTheme()` and switched to `tokens.colors.chart.positive`/`tokens.colors.chart.negative` for the line color (with a `hexToRgba` helper for the area fill). Day-tick stroke pulls from `tokens.colors.fg.muted`; the hover crosshair + dot border use `tokens.colors.border.default`. Hover header text now uses `text.primary`. Chart container background uses `surface.raised` so the chart sits on the right surface in Midnight.
- `apps/extension/src/components/PortfolioTabs.tsx` — added `Decorator` + `useTheme()`; card surface/border/shadow now use `surface.raised` + `border.default` + `boxShadow="card"`. Selected tab uses a theme-aware `tabActiveBg`/`tabActiveFg` pair (Bauhaus paints a black strip with white text; Midnight uses `surface.sunken` + `fg.primary`). Holdings total is `accent.highlight`. Chain filter Menu/Input drop their inline border/focus overrides — relies on the factory's Input variant to handle styling in both themes.
- `apps/extension/src/components/TokenHoldings.tsx` — added `Decorator`; card and DeFi rows use `surface.raised`/`border.default`/`border.subtle`. Send/Swap/Edit affordance labels use `accent.secondary`/`accent.primary`/`accent.primary`. Copy-token-address feedback uses `accent.highlight` (copied) → `accent.secondary` (hover). DeFi external link hover → `accent.secondary`. Chain badges (the small circular sticker overlaying token icons) intentionally keep literal `"white"` since they're "physical stickers" — see ChainIcon Phase 5 note.
- `apps/extension/src/components/AddTokenModal.tsx` — `ModalContent` drops all inline `bg`/`border`/`borderColor`/`boxShadow` and inherits from the theme. `ModalHeader` keeps its inverse-strip look via `fg.primary` + `fg.inverse`. Inputs drop their inline border/focus overrides. Spinner uses `accent.secondary`. Error/duplicate banners switch from `red.50`/`yellow.50` to `status.error.bg`/`status.warning.bg` (reads correctly in both light & dark). The "Add Token" CTA becomes `<Button variant="primary">`.
- `apps/extension/src/components/EditCustomTokenModal.tsx` — same modal/input cleanup. Address display border uses `border.subtle`. Remove button is now `<Button variant="danger">` (relies on factory's Button.danger variant); Save is `<Button variant="primary">`.
- `apps/extension/src/components/QRCodeModal.tsx` — kept BLACK on BLACK in both themes via literals (`bg="black"` + `color="white"` on the header strip and modal body). This is a "physical viewing surface" — Bauhaus deliberately puts a stark black panel under the QR for high contrast, and Midnight wants the same on-its-own-island feel. Inner QR tile stays literal `bg="white"` so the code remains scannable. Copy address text uses `accent.highlight`/`accent.secondary` accents.
- `apps/extension/src/App.tsx` — home body migrated from the failed-tx error block (line ~2664) down through the sticky footer (line ~3473), excluding the cross-dapp batch view (still bauhaus-yellow accent strip — that belongs to Phase 9). Spinner color in `LoadingFallback` (line 199) updated. Migrated:
    - Failed-tx error banner (`accent.primary` + `border.default`).
    - RPC issue banner (`status.info.bg`, accented icon block, chain pills with `surface.raised` + `border.default`).
    - Chain selector menu — `MenuButton`, `MenuList`, search input, items, divider, and Add Chain row all swap to surface/border tokens and `boxShadow="card"`/`"cardHover"`. Removed `borderRadius="0"` so Midnight's rounded corners take effect.
    - Address pill — uses a theme-aware `bg`/`color` pair (Bauhaus `fg.primary`+`fg.inverse`, Midnight `surface.sunken`+`fg.primary`) for the same reason as the Phase 5 header bar. Inner icon buttons use `color="inherit"` and `_hover={{ color: "accent.highlight" }}`.
    - Explorer shortcut tiles use `surface.raised` + `border.default` + `boxShadow="card"`/`"cardHover"`.
    - Swap/Send/Stake CTA row — `accent.secondary`/`accent.highlight`/`surface.raised` backgrounds with matching `accentFg.*`/`text.primary` text. Stake APY badge → `accent.primary`+`accentFg.primary`.
    - Reload Required alert → `accent.highlight` + `border.default` + `card` shadow + `accentFg.highlight` text. Inverse Reload button uses `border.default` + `accent.highlight`.
    - Sticky footer "Chat with Bankr" button → `accent.highlight` + `accentFg.highlight` + `card`/`cardHover` shadows. The three geometric flourish shapes (circle / diamond / triangle) are wrapped in `{!isDarkTheme && (...)}` — they're pure Bauhaus exuberance and Midnight stays restrained.
    - `waitingForOnboarding` view — same treatment: surface/accent tokens for the icon card + the two corner decorations gated on `!isDarkTheme`. Built-by link uses `accent.secondary` → hover `accent.primary`.

**Test gate:**

- View portfolio with holdings → both themes.
- View chart → both themes (verify chart series colors swap and the area fill picks the corresponding alpha).
- Open QR modal → both themes (intentionally identical: black header + black body).
- Add / edit custom token → both themes (verify error/duplicate banners are readable, Remove button is danger-styled).
- Copy address → verify copy indicator (CheckIcon) uses highlight accent in both themes.
- Network filter dropdown in PortfolioTabs → both themes.
- Re-run the token type matrix (Bankr / PK / Seed) to confirm logic untouched.

### Phase 7 — Transaction Confirmation ✅ Shipped

**Goal:** The highest-stakes screen. Users make financial decisions here; visual clarity is non-negotiable.

> **Status:** All 14 files in scope migrated to intent tokens (TransactionConfirmation, AssetChangesDisplay, ERC20ApproveDisplay, GasEstimateDisplay, TokenTransfer, CalldataDecoder, ForceInclusionProgress + the seven `decodedParams/*` renderers + `renderParams.tsx`). Build green across all 5 targets. Lint stays at the 67-problem baseline (36 errors, 31 warnings) — no new issues. Bauhaus stays visually identical except for one deliberate semantic improvement: AssetChangesDisplay's incoming row now uses `chart.positive` (green) instead of `bauhaus.blue` per the PRD test gate, so dark mode reads correctly without losing meaning in light mode.

**Files modified:**

- `apps/extension/src/components/ForceInclusionProgress.tsx` — title bar uses `accent.secondary` + `accentFg.secondary`; the steps card flips to `surface.raised` + `border.default` + `boxShadow="card"`. Step indicator paints with `accent.highlight` (done), `accent.secondary` (active), and `surface.raisedHover` (pending). Error block uses the full `status.error.{bg,border,fg}` triple.
- `apps/extension/src/components/decodedParams/BoolParam.tsx` — true/false flips to `chart.positive`/`chart.negative` so the semantic "ok / not ok" reading survives both palettes.
- `apps/extension/src/components/decodedParams/ArrayParam.tsx` — left rail uses `border.default`.
- `apps/extension/src/components/decodedParams/AddressParam.tsx` — name/address toggle button + label badge use `border.subtle`/`border.default`/`accent.secondary` + `accentFg.secondary`. ENS hex display uses `accent.secondary`. Avatar border + explorer hover use `border.default`/`accent.secondary`.
- `apps/extension/src/components/decodedParams/UintParam.tsx`, `IntParam.tsx`, `BytesParam.tsx`, `StringParam.tsx` — all numeric values use a `useTheme()` conditional: Bauhaus keeps the historic dark gold `#B8860B` (chosen for contrast on white) and Midnight switches to `accent.highlight` (warm amber) so the digits don't disappear into the dark surface. The unit dropdown / format / tab buttons swap to `fg.primary`/`fg.inverse` for the active state and `border.subtle`/`border.default` for the strokes. Portal menu surfaces use `surface.raised` + `border.default` + `boxShadow="card"`. The `RichJsonValue` helper threads `numericColor` through so JSON numbers render correctly.
- `apps/extension/src/components/decodedParams/BytesParam.tsx` — nested function-name code badge uses `accent.secondary` + `accentFg.secondary`. Tab strip uses inverted contrast (`fg.primary` ↔ `fg.inverse`) and `border.default` for strokes.
- `apps/extension/src/components/decodedParams/StringParam.tsx` — tabs use the same inverted contrast pattern. Raw JSON / Raw SVG `pre` blocks use `border.default` strokes and CSS scrollbar uses `var(--chakra-colors-border-default)` so the thumb stays visible in both themes. SVG / image preview tiles intentionally keep literal `bg="white"` (physical viewing surface — same rationale as ChainIcon overlay and the QR code tile). Textarea drops its inline border in favour of `border.default`/`border.focus` so the theme `Input` defaults take over.
- `apps/extension/src/components/ERC20ApproveDisplay.tsx` — loading box uses `surface.raised` + `border.default` + `boxShadow="card"`. Card body switches from the literal `#EEF2FF` to `status.info.bg` so dark mode lands on the dark indigo surface. Token logo fallback uses `accent.secondary` + `accentFg.secondary`. Spender pill, copy/explorer hovers, and the spender label badge swap to the matching intent tokens. The Unlimited tooltip + pill use `status.error.{bg,fg,border}` so Bauhaus stays a red pill with white text and Midnight gets a dark-red pill with light-red text. Edit button on the amount row uses `accent.highlight` + `accentFg.highlight`. The amount Input dropped its inline `border`/`borderColor`/`borderRadius`/`_focus` overrides so the theme's `Input` variant handles styling in both themes.
- `apps/extension/src/components/GasEstimateDisplay.tsx` — `EditableGasRow` Input uses Chakra's built-in `isInvalid` state (drops the inline border/focus props). `RevertWarning` swapped from `bauhaus.red` to the full `status.error` triple. Insufficient-balance pill → `accent.highlight` + `accentFg.highlight` + `boxShadow="card"`. Force-inclusion L1 banner → `accent.secondary` + `accentFg.secondary`. Loading + error wrapper boxes → `surface.raised` + `border.default` + `boxShadow="card"`. Spinner color → `accent.secondary`. Dapp-provided info → `accent.secondary`. Invalid gas params text → `status.error.fg`. Internal dividers → `border.subtle`.
- `apps/extension/src/components/AssetChangesDisplay.tsx` — `NftStandardTag` pill uses `accent.highlight` + `accentFg.highlight` + `border.default`. The sandboxed iframe and full-screen modal NFT tile keep literal `bg="white"` (physical surface) so transparent NFTs land on a neutral background. The full-screen modal drops its inline `bg`/`border`/`boxShadow`/`borderRadius` overrides and inherits the Modal defaults; close button picks `accent.highlight` + `accentFg.highlight` for the hover. NFT preview hover stroke → `accent.secondary`. **`AssetRow` direction colors switch to `chart.negative`/`chart.positive`** — this is the one deliberate Bauhaus visual change in Phase 7 (incoming was historically blue), motivated by the PRD test gate. Send/Receive section headers also use `chart.negative`/`chart.positive`. Outer card → `surface.raised` + `border.default` + `boxShadow="card"`. Loading state and divider use `border.subtle`. Copy and explorer hovers → `accent.secondary`/`accent.highlight`.
- `apps/extension/src/components/CalldataDecoder.tsx` — added `useTheme()` and a theme-aware `tabActiveBg`/`tabActiveFg` pair (Bauhaus paints a stark black tab strip with white text; Midnight uses `surface.sunken` so the strip recedes into the dark surface). Outer card → `surface.raised` + `border.default` + `boxShadow="card"`. Function name code badge → `accent.secondary` + `accentFg.secondary`. Raw calldata box → `border.default` + `bg.muted`. Scrollbar uses `var(--chakra-colors-bg-muted)` track + `var(--chakra-colors-border-default)` thumb.
- `apps/extension/src/components/TokenTransfer.tsx` — Send screen migrated end-to-end. Page background → `surface.base`. `getAccountTypePillStyles` rewritten to use intent tokens (Bankr → `accent.secondary`, PK → `accent.highlight`, Seed → `accent.primary`, View Only → `status.success`). Stake upsell banner → `accent.highlight` + `accentFg.highlight` and the STAKE button uses `<Button variant="highlight">`. Token selector card → `surface.raised` + `border.default` + `boxShadow="card"`. Chain selector + chevron tile, chain dropdown menu list, and the search input all swap to surface/border tokens (search Input drops its inline border/focus overrides). Testnet pills → `accent.highlight` + `accentFg.highlight`. "My Wallets" recipient picker → `accent.secondary` link + `surface.raised` menu list + `border.default` strokes; account avatars use `border.default`. Recipient resolver → `accent.secondary` spinner, `accent.highlight` copy-success accent, `accent.secondary` hover. Recipient input drops its inline `border`/`borderColor`/`bg`/`_hover`/`_focus` overrides and uses Chakra's built-in `isInvalid` state. Amount input does the same. Slider marks/track/filled/thumb → `accent.secondary` + `bg.muted` + `border.default`. Sponsored USDC banner → `accent.secondary` + `accentFg.secondary` + `boxShadow="card"`. Sponsored-failed fallback banner → `status.error.{bg,border,fg}` + an inner `<Button variant="highlight">` (the bouncy fallback CTA). Impersonator warning → `accent.highlight` + `accentFg.highlight`. Send action button keeps its blue CTA appearance via direct `accent.secondary`/`accentFg.secondary` props (no `variant` covers this case — the factory's `primary` would map to red in Bauhaus, which would be a regression).
- `apps/extension/src/components/TransactionConfirmation.tsx` — the big one. Added `useTheme()` + `isDarkTheme` flag at the top. Internal `CopyButton` helper updated to `accent.highlight`/`accent.secondary`. Origin favicon fallback box → `bg.muted`. **Success animation screen** (`state === "sent"`): outer wrapper → `surface.base`, geometric corner decorations (square / circle / triangle) wrapped in `{!isDarkTheme && (...)}` since they're pure Bauhaus exuberance. Checkmark card → `accent.highlight` + `accentFg.highlight` + `boxShadow="modal"` (the bigger checkmark deserves the deeper modal-style shadow). **Title row** (Token Approval Request / Transaction Request): `accent.highlight` for approves, `accent.secondary` for normal txs, with matching `accentFg.*` text. The corner ornament is gated on `!isDarkTheme`. **Transaction Info Card** → `surface.raised` + `border.default` + `boxShadow="card"`, dividers use `border.subtle`. Origin favicon container → `bg.muted` + `border.subtle`. Network badge → `surface.raised` + `text.primary` for custom chains, `border.default` for strokes. Force-inclusion settings tile → `bg.muted`. Resolver and explorer hovers → `accent.secondary`. To/From/Type rows: address pill uses `surface.raised` + `border.default`; ENS-name and contract-deployment badges use `accent.highlight` + `accentFg.highlight`; eth.sh label badge uses `accent.secondary` + `accentFg.secondary`. Deploy data card and bottom Tenderly box → `surface.raised`/`border.default`/`boxShadow="card"`. Sticky footer → `surface.base`. Error block → full `status.error` triple. Submitting status strip → `accent.secondary` + `accentFg.secondary`. Impersonator info → `accent.highlight` + `accentFg.highlight`. Reject-all button → `status.error.fg` + `status.error.bg` hover. The count badge ("1/N") in the navigator uses the same theme-aware `stripBg`/`stripFg` pair as the Phase 5/6 headers. Card scrollbar uses `var(--chakra-colors-border-strong)` so the thumb stays visible in both themes.

**Refactor heuristic changes from Phase 6:**

- The "physical viewing surface" pattern is reused for any tile that holds external user content (NFT image, SVG preview, image preview). These keep literal `bg="white"` because the embedded content was authored against a white background and would look broken on a dark surface.
- For numeric values in calldata params we introduced a per-component `useTheme()` conditional (`numericColor = themeId === "midnight" ? "accent.highlight" : "#B8860B"`) instead of extending the token contract. The Bauhaus literal is preserved exactly so visual parity holds; Phase 13 cleanup will catch the literal and decide whether to promote it to a real token.
- AssetChangesDisplay's direction colors are the one deliberate Bauhaus visual change in Phase 7. Rationale documented inline.

**Test gate — this is the most critical QA phase:**

- Trigger a dapp transaction (Uniswap, Aave) — view the confirmation in both themes.
- Verify asset changes display renders correctly (positive = green, negative = red, using `chart.positive/negative`).
- Verify gas estimate with overrides panel.
- Verify calldata decoder expansion (all param types: address, uint, int, bool, bytes, string, array).
- Verify force inclusion flow UI (toggle force inclusion on an OP Stack chain).
- Test with **all three wallet types**: Bankr, PrivateKey, SeedPhrase. (Per CLAUDE.md, required for any tx/sig change — even though we're not touching logic, the UI is shared.)
- Confirm, then verify success animation in both themes.
- Reject, verify the return to home state.

### Phase 8 — Signature Request + Typed Data ✅ Shipped

> **Status:** All 3 files in scope migrated to intent tokens. Build green across all 5 targets. Bauhaus stays visually identical. Re-uses every heuristic established in Phases 5–7: theme-aware tab/header strip pair, `numericColor` conditional for `#B8860B` digit preservation, `chart.positive/negative` for boolean truth values, corner ornaments wrapped in `{!isDarkTheme && (...)}`, factory `<Button variant="highlight">` for the Sign CTA, and full `status.error` triple for rejection states.

**Files modified:**

- `apps/extension/src/components/SignatureRequestConfirmation.tsx` — added `useTheme()` + `isDarkTheme` flag and the same theme-aware `stripBg`/`stripFg` pair as `TransactionConfirmation` for the count badge ("1/N"). Outer scroll container → `surface.base` with scrollbar thumb on `var(--chakra-colors-border-strong)`. **Title row** uses `accent.primary` (red in Bauhaus) + `accentFg.primary` to signal "high stakes"; the yellow corner triangle is wrapped in `{!isDarkTheme && (...)}` since it's pure Bauhaus exuberance. **Request Info Card** → `surface.raised` + `border.default` + `boxShadow="card"`; the blue corner square is also gated on `!isDarkTheme`. Dividers → `border.subtle`. Origin favicon container → `bg.muted` + `border.subtle`. Network badge → `surface.raised` + `fg.primary` for custom chains, `border.default` strokes. Method code badge → `surface.raised` + `border.default`. Reject All button → `status.error.fg` + `status.error.bg` hover. Sticky footer → `surface.base`. Impersonator info box → `accent.highlight` + `accentFg.highlight` + `boxShadow="card"`. **Sign button** swapped to `<Button variant="highlight">` (drops the inline yellow/black/shadow overrides — the factory variant matches exactly). **Internal `MessageDataDisplay`** subcomponent gets its own `useTheme()` and the same theme-aware `tabActiveBg`/`tabActiveFg` pair as CalldataDecoder; outer card → `surface.raised` + `border.default` + `boxShadow="card"`; inner Message/Raw boxes use `status.info.bg` + `border.default`. Scrollbar uses `var(--chakra-colors-bg-muted)` track + `var(--chakra-colors-border-default)` thumb.
- `apps/extension/src/components/TypedDataDisplay.tsx` — `CopyBtn` and `AddressValue` swap to `accent.highlight` (copied) / `accent.secondary` (hover + ENS hex display). Address copy/explorer hovers also flip to `accent.secondary`. **`MessageField`** receives a new `numericColor` prop (threaded down through nested objects/arrays) so number/bigint values keep the historic dark gold `#B8860B` in Bauhaus and switch to `accent.highlight` in Midnight. Boolean values → `chart.positive`/`chart.negative` (matches `decodedParams/BoolParam`). Nested struct left rails → `border.default`. The main `TypedDataDisplay` component pulls in `useTheme()` for the same `tabActiveBg`/`tabActiveFg` pair, the `numericColor` value, and a `surface.raised` + `border.default` + `boxShadow="card"` outer wrapper. Scrollbar uses CSS vars. Domain code badge → `accent.primary` + `accentFg.primary` (red header — matches the Signature title row's "high stakes" signal). Primary type badge → `accent.secondary` + `accentFg.secondary`. Types code badge → `accent.highlight` + `accentFg.highlight`. The collapsed Types section nested left rail and the field-type display also flip to `border.default` and `accent.secondary`. Raw tab box → `border.default` strokes.
- `apps/extension/src/components/WatchAssetConfirmation.tsx` — added `useTheme()` and the `stripBg`/`stripFg` pair. **Header bar** → `stripBg`/`stripFg` (Bauhaus paints the dark black-on-white identity strip; Midnight uses `surface.sunken` so it doesn't compete with luminous shadows). The `whiteAlpha.700` origin subtitle reads as `stripFg` with `opacity={0.7}` so both themes get a muted secondary line. Token icon border (both image + symbol fallback) → `border.default`. **Token card box** → `surface.raised` + `border.default` + `boxShadow="card"`. **Chain icon ring** (overlaid bottom-right of the token icon) → `surface.raised` for both `bg` and `borderColor` so it adapts cleanly (was hardcoded `white`/`white`). Contract address pill → `border.subtle`. **Reject button** drops its inline `borderColor`/`borderWidth`/`borderRadius`/`_hover`/`textTransform`/`letterSpacing` overrides and just uses `<Button variant="outline">` (the factory variant covers all of those via `border.default` and `Button` baseStyle). **Add Token button** uses direct `stripBg`/`stripFg` props with manual `border.default` + 2px stroke (no factory variant covers "dark CTA that stays dark in both themes" — same reasoning as the Send button in `TokenTransfer` from Phase 7).

**Refactor heuristic changes from Phase 7:**

- The "dark CTA strip" pattern (`stripBg = isDarkTheme ? surface.sunken : fg.primary`, `stripFg = isDarkTheme ? fg.primary : fg.inverse`) is now used in three places: the count badge in confirmation navigators, the Add Token header bar in WatchAssetConfirmation, and the Add Token button itself. Worth promoting to a `useStripTokens()` hook in Phase 13 cleanup if any more uses appear.
- The `MessageField` recursive component is the first place where `numericColor` had to be threaded through `props` rather than read from `useTheme()` at the call site (recursive children are non-React functions). Same approach as `RichJsonValue` in StringParam from Phase 7.

**Test gate:**

- Trigger `personal_sign` from a dapp — verify in both themes.
- Trigger `eth_signTypedData_v4` — verify nested struct rendering in both themes (`AddressValue` copy button + explorer link must work per CLAUDE.md standard).
- Trigger `wallet_watchAsset` — verify in both themes.
- Test all three wallet types.

### Phase 9 — Batch Transactions ✅ Shipped

**Files modified:**

- `apps/extension/src/components/BatchTransactionConfirmation.tsx`
  - Added `useTheme()` + `stripBg`/`stripFg` pair for the count badge.
  - Promoted `CALL_ACCENTS` from `bauhaus.red/blue/yellow` to
    `accent.primary/secondary/highlight`, and added a parallel `CALL_ACCENT_FGS`
    array so `CallCard` can pick the right contrast text without the old
    `accent === "bauhaus.yellow" ? black : white` conditional.
  - Success animation: yellow checkmark box → `accent.highlight` /
    `accentFg.highlight` / `boxShadow="modal"`. The red square + blue circle
    corner ornaments are wrapped in `{!isDarkTheme && (...)}` (Midnight omits
    Bauhaus exuberance).
  - Title banner: blue → `accent.secondary` / `accentFg.secondary`,
    hardcoded shadow → `card`, yellow corner square wrapped in `{!isDarkTheme}`.
  - Auto-Sequential badge: yellow → `accent.highlight` / `accentFg.highlight`.
  - Info card, network badge, dark CTA chevron, divider rails: all migrated to
    `surface.raised` / `border.default` / `border.subtle`.
  - Bottom Error/Submitting boxes: → `status.error.bg`/`status.info.bg` with
    matching `.fg` text and `boxShadow="card"`.
  - Cross-dapp delete button hover uses CSS vars to wire `chart.negative` /
    `status.error.bg` / `status.error.fg` through the `sx` prop.
  - `CallCard` migrated to `surface.raised` / `border.default` / `border.subtle`,
    with `accent.secondary` hover for explorer links.
  - Reject All ghost button: red text → `chart.negative` (the only red token
    that's also actually red in Midnight — `status.error.fg` would be white).
- `apps/extension/src/components/CrossDappBatchConfirmation.tsx` — added
  `useTheme()` + theme-aware `pageBgColor`. Bauhaus keeps the literal cornsilk
  `#FFF8DC` tint; Midnight uses `surface.sunken`.
- `apps/extension/src/components/MultiTxGasEstimateDisplay.tsx`
  - `EditableGasLimitInput` got its own `useTheme()` so the warning row can
    keep Bauhaus's literal cream `#FFF9E0` tint while Midnight gets
    `status.warning.bg`. Same heuristic as the cross-dapp tinted page.
  - Invalid border / focus border use `chart.negative` (red in both themes,
    unlike `status.error.fg` which is white in Bauhaus).
  - Loading / error / Gas Fee box: hardcoded shadows → `boxShadow="card"`.
  - Revert / Insufficient / Fallback / Force-inclusion banners: migrated to
    `status.error.*`, `status.warning.*`, `status.info.*`.
  - Dividers `gray.200` → `border.subtle`, fallback warning icon
    `bauhaus.yellow` → `accent.highlight`.
- `apps/extension/src/components/PendingTxList.tsx`
  - Added `useTheme()` + `stripBg`/`stripFg` pair (used by index badges and the
    chevron-right "stickers" on each card).
  - All four list-item card variants (cross-dapp / tx / batch / sig) migrated
    via `replace_all` for the shared bg/border/shadow shape.
  - Sticker badges: TX → `accent.secondary`, BATCH/YOUR BATCH → `accent.highlight`,
    SIG → `accent.primary`, header count → `accent.highlight`.
  - Hover boxShadow `6px 6px 0px 0px #121212` → `cardHover` token.
- `apps/extension/src/components/TxStatusList.tsx`
  - Spinner + "Pending"/"Processing"/"L1 Pending"/"L2 Pending" status colors:
    `bauhaus.blue` → `accent.secondary`.
  - "Confirmed"/"L1 Confirmed" `green.500` → `chart.positive`.
  - "Failed"/"L2 Failed" `bauhaus.red` → `chart.negative`.
  - Activity icon container `gray.100` → `bg.muted`; chain icon ring
    `bg="white"` + `borderColor="gray.200"` → `surface.raised` / `border.subtle`.
  - Row hover `blackAlpha.50` → `bg.muted`, divider `gray.100` → `border.subtle`.
- `apps/extension/src/components/TxDetailModal.tsx`
  - Modal: dropped inline `bg`/`border`/`borderColor`/`borderRadius`/`boxShadow`
    on `<ModalContent>`. The Modal theme baseStyle from `createTheme.ts` already
    paints the dialog correctly (Bauhaus thick black border + hard 8px shadow,
    Midnight 1px stroke + luminous shadow), so the inline overrides were
    actively breaking Midnight. `<ModalOverlay>` switched from `blackAlpha.700`
    to `surface.overlay`.
  - `<ForceInclusionSteps>` got its own `useTheme()` for a `stepIconColor` —
    the small icons inside the vivid red/green/blue step circles are white in
    Bauhaus (high contrast against the saturated palette) but flip to
    `fg.inverse` in Midnight (the chart tints there are too light for white).
  - Step circle bgs: red/green/blue → `chart.negative` / `chart.positive` /
    `accent.secondary`. Idle "L2 not yet" bg `gray.200` → `border.subtle`.
  - Status badges (Pending / Confirmed / Failed) migrated to `status.info.*`,
    `accent.highlight` (preserves the yellow celebration), `status.error.*`.
  - Function name code, deploy data box, Contract Deploy badge, gas details box,
    L1/L2/View on Explorer buttons, error box, ModalFooter divider: all
    migrated to intent tokens.
  - Deploy data scrollbar: hardcoded `#E0E0E0`/`#121212` → `var(--chakra-colors-bg-muted)` /
    `var(--chakra-colors-border-strong)`.
- `apps/extension/src/App.tsx` — cross-dapp batch screen wrapper:
  - Yellow accent strip across the top: `bauhaus.yellow`/`bauhaus.black` →
    `accent.highlight`/`border.default` (this was the strip deliberately
    deferred from Phase 6 for context coherence).
  - Outer page bg `#FFF8DC` → theme-aware: literal cornsilk in Bauhaus,
    `surface.sunken` in Midnight. Same conditional pattern as the inner
    `<CrossDappBatchConfirmation>` wrapper so the two surfaces stay in sync.

**Refactor heuristic changes (additions to the running list):**

- **`chart.negative` is the only "red text on neutral surface" token.**
  `status.error.fg` is RED in Midnight but WHITE in Bauhaus, so it disappears
  on `surface.raised`. `accent.primary` is RED in Bauhaus but indigo in Midnight,
  so it stops looking like an error. Only `chart.negative` is red in both
  themes. Use it for: Reject All buttons, "Failed" status text, "Invalid" form
  errors. Phase 8's Reject All button should be revisited in Phase 13 cleanup —
  it currently uses `status.error.fg` and is invisible in Bauhaus.
- **Modal inline bg/border/shadow overrides should be deleted, not migrated.**
  The Modal theme baseStyle already paints the dialog from tokens. `TxDetailModal`
  is the first place where I noticed this — the inline `bg="bauhaus.white" ...`
  was actively breaking Midnight because it overrode the theme's recessed
  surface and luminous shadow with a flat white box. Phase 12 should grep
  `<ModalContent` for inline color props and delete them.
- **`stripIconColor` inside vivid filled status circles needs `useTheme()`.**
  Bauhaus's chart palette is saturated (`#D02020`, `#208040`, `#1040C0`) so
  white icons read perfectly. Midnight's is lighter (`#FF6B7A`, `#4ADE80`,
  `#00D4E6`) so white icons fall to ~1.6:1 contrast. The fix is the same shape
  as `numericColor` in Phases 7 & 8: a per-component `useTheme()` and a
  `themeId === "midnight" ? "fg.inverse" : "white"` literal. `TxDetailModal` is
  the third place to thread a theme-derived color prop into a child component.

**Test gate:**

- Trigger an ERC-5792 batch (e.g., from Flaunch) — verify in both themes.
- Build a cross-dapp batch (add tx → add tx → confirm) — verify in both themes.
- View pending tx list with multiple pending requests in both themes.
- Open tx detail modal in both themes.
- Test the "Add to Batch" popover gate logic — the popover styling must adapt.
- Test all three wallet types where supported (batch is Bankr + ERC-5792-capable).

### Phase 10 — Chat Screens ✅ Shipped

**Files modified:**

- `apps/extension/src/components/Chat/ChatView.tsx` — outer wrapper `bg.base` → `surface.base`; the chat-input top divider `bauhaus.black` → `border.default`. The whole Chat tab now lives on the same surface stack as the rest of the app.
- `apps/extension/src/components/Chat/ChatHeader.tsx` — added `useTheme()` and the standard `stripBg`/`stripFg` pair (Bauhaus = literal black, Midnight = `surface.sunken`) for the inverted title bar. Yellow underline → `accent.highlight`. Dropped `MenuList` inline `bg`/`border`/`borderColor`/`borderRadius`/`boxShadow` overrides — `Menu` baseStyle in `createTheme.ts:494` already paints them from theme tokens. Kept the `MenuItem` `_hover={{ bg: "bg.muted" }}` override because the Menu baseStyle hover is `accent.highlight` (yellow/amber) which clashes with the destructive red `chart.negative` text on this lone item. Delete icon and "Delete Chat" text → `chart.negative` (the only red token that survives in both themes).
- `apps/extension/src/components/Chat/ChatList.tsx` — added `useTheme()` and the same `stripBg`/`stripFg` pair as the header. Outer `bg.base` → `surface.base`. The header "+" button (yellow CTA on dark strip) → `accent.highlight`/`accentFg.highlight`/`border.default`. Empty-state chat icon box → `accent.secondary`/`accentFg.secondary`/`border.default` + `boxShadow="card"`. Empty-state "Start New Chat" CTA → `accent.highlight`/`accentFg.highlight` with `card`/`cardHover` shadows. Conversation cards: `bauhaus.white`/`bauhaus.black`/hardcoded `4px 4px 0px 0px #121212` shadow → `surface.raised`/`border.default`/`card`, hover `cardHover`. Favorite star (corner sticker) → `accent.highlight`/`accentFg.highlight` when active, `surface.raised`/`text.tertiary` when idle. Delete icon hover color → `chart.negative`.
- `apps/extension/src/components/Chat/ChatInput.tsx` — wrapper `bauhaus.white`/`bauhaus.black`/hardcoded shadow → `surface.raised`/`border.default`/`card`. Input field `bauhaus.black` border / `bg.base` bg / `bauhaus.blue` hover+focus → `border.default`/`surface.base`/`accent.secondary`. Send button `bauhaus.blue` → `accent.secondary` with hover swap to `accent.primary` (Bauhaus blue→red maps to Midnight cyan→indigo — same "warm up on hover" beat in both palettes). Disabled hover snaps back to `accent.secondary`.
- `apps/extension/src/components/Chat/MessageList.tsx` — empty-state question-mark box `bauhaus.yellow`/`bauhaus.black` → `accent.highlight`/`accentFg.highlight`/`border.default`. Scrollbar thumb hardcoded `#121212` → `var(--chakra-colors-border-strong)` so it picks up the right contrast in either theme.
- `apps/extension/src/components/Chat/MessageBubble.tsx` — added `useTheme()`. Three bubble palettes: user bubble `bauhaus.blue`/`bauhaus.white` → `accent.secondary`/`accentFg.secondary` (cool / your input); assistant bubble `bauhaus.yellow`/`bauhaus.black` → `accent.highlight`/`accentFg.highlight` (warm / response); error bubble `bauhaus.red`/`bauhaus.white` → `status.error.bg`/`status.error.fg` (semantic — Bauhaus saturated red, Midnight recessed dark error tint with bright fg). Border/shadow on every bubble migrated to `border.default`/`card`. The little geometric corner ornament (red square or red circle) wrapped in `{!isDarkTheme && (...)}` so Midnight stays ornament-free per its `decorators` omission. Inline links inside bubble text use the cross-tint pattern (`accent.highlight` on user bubble, `accent.secondary` on assistant bubble) — same blue↔yellow / cyan↔amber crossover in either palette. The "Send message to Bankr" CTA inside the wallet-locked-then-unlocked branch: `bauhaus.white`/`bauhaus.black` with hover invert → `surface.raised`/`fg.primary` with hover `fg.primary`/`fg.inverse` (same invert intent in either theme). Compact Retry/Unlock buttons: same surface inputs, hover → `accent.highlight`/`accentFg.highlight`. Copy-feedback flash uses `accent.highlight` (preserves the yellow celebration in Bauhaus, becomes amber in Midnight).
- `apps/extension/src/components/Chat/ShapesLoader.tsx` — split into two internal components selected by `useTheme()`. `BauhausShapesLoader` keeps the original three bouncing shapes but uses intent tokens (`accent.primary`, `accent.secondary`, `chart.positive`). `MidnightDotPulseLoader` is new — three identical iridescent dots that fade in/out at 160ms staggered intervals, painted in `accent.primary`. The restrained pulse fits Midnight's "premium dark mode for reading carefully" personality where the loader should sit quietly while the model thinks rather than dance. NOTE: did NOT use the `theme.decorators.shapesLogo` injection point (which still exists in `tokens.ts`) because the existing `size="10px"` string-prop API would have required widening the `ComponentType<{ size?: number }>` contract. Internal `useTheme()` branching is simpler and keeps the props API stable. We can promote to the decorator slot later if a third theme needs it.

**Refactor heuristic changes (carry into Phase 11):**

1. **`Menu` baseStyle deletion mirrors `Modal`.** Phase 9 established that `<ModalContent>` inline `bg`/`border`/`shadow` overrides should be deleted because the Modal theme baseStyle paints them from tokens. The same now applies to `<MenuList>` — the `Menu` baseStyle in `createTheme.ts:494` paints `bg`/`border`/`borderColor`/`borderRadius`/`boxShadow`. For Phase 11 onward, grep `<MenuList` for inline color/border/shadow props and delete them, but **keep per-item `_hover` overrides** when the default `accent.highlight` hover clashes with destructive item content (e.g. red destructive text — yellow/amber background fights with it).
2. **Internal `useTheme()` branching can substitute for the decorator injection slot when prop-shape compatibility matters.** The PRD originally specified `ShapesLoader` would render `theme.decorators.shapesLogo`. In practice, the existing `size="10px"` string API doesn't match the `ComponentType<{ size?: number }>` contract in `tokens.ts`. Branching internally with `useTheme()` is the lower-friction path when retrofitting an existing component. Reserve the decorator injection slot for greenfield primitives that can adopt the contract from day one.
3. **Cross-tint links inside colored bubbles/cards use the opposite accent.** A link inside a `accent.secondary` (cool) surface uses `accent.highlight` (warm), and vice versa. This pattern works in both Bauhaus (blue↔yellow) and Midnight (cyan↔amber) without needing a `useTheme()` branch — both pairs maintain enough contrast on the opposite background.

**Test gate:**

- Open chat. Verify layout in both themes.
- Send a message. Verify loading indicator (ShapesLoader) looks right in both themes — Bauhaus three shapes vs. Midnight dot pulse.
- Scroll message history in both themes — verify scrollbar contrast.
- Clear chat history. Start a new conversation.
- Trigger a wallet-lock error in chat (lock the wallet mid-conversation), unlock from the in-bubble button, verify the "Send message to Bankr" retry button renders correctly in both themes.

### Phase 11 — Swap Screens ✅ Shipped

**Files modified:**

- `apps/extension/src/components/Swap/SlippageSettings.tsx` — `PopoverContent` `bauhaus.white`/`bauhaus.black`/hardcoded shadow → `surface.raised`/`border.default`/`card`. Did NOT pin `borderRadius={0}` (Popover has no theme baseStyle, but pinning to 0 would force sharp corners on Midnight). Preset chips: active state `bauhaus.blue`/`bauhaus.white` → `accent.secondary`/`accentFg.secondary`; idle state `bg.muted` → `surface.sunken`; idle hover `bg.hover` → `surface.raisedHover`. Custom-input border same `accent.secondary`/`border.default` swap. High-slippage warning text `bauhaus.red` → `chart.negative`.
- `apps/extension/src/components/Swap/TokenSelector.tsx` — `MenuButton` border/bg/hover swapped to `border.default`/`surface.raised`/`accent.secondary`. `MenuList` inline `bg`/`border`/`borderColor`/`borderRadius`/`boxShadow` deleted per the Phase 10 Menu baseStyle rule — only `maxH`/`overflowY`/`p={0}`/`zIndex` survive. Custom-address input migrated to `border.default`/`surface.raised`/`accent.secondary` hover-focus. Loading spinner `bauhaus.blue` → `accent.secondary`. Error text `bauhaus.red` → `chart.negative`. The "resolved custom token" highlight row `bauhaus.yellow`/`#e6b31c` hover → `accent.highlight`/`accentFg.highlight` with `filter: brightness(0.92)` hover (the `#e6b31c` literal was a hand-tuned hover shade — replacing it with a `brightness()` filter works in either palette without needing per-theme darkening logic). Holding rows: selected `bg.muted` → `surface.sunken`; removed the `_hover` override since the Menu baseStyle paints the default `accent.highlight` hover.
- `apps/extension/src/components/Swap/BuyTokenSelector.tsx` — Trigger box: `bauhaus.white`/`bauhaus.black`/hover → `surface.raised`/`border.default`/`accent.secondary`. The dropdown panel is hand-rolled (not a `<MenuList>`) so its surface tokens are set explicitly: `surface.raised`/`border.default`/`card`. Search input + popular-chip borders all use `border.default`; selected chip uses `accent.secondary` border with `surface.sunken` background. Holding/all-token rows: `bg.muted` selected → `surface.sunken`; `bg.hover` → `surface.raisedHover`. Section divider `bg.muted` → `border.subtle`. Loading spinner → `accent.secondary`. Pending-token row uses the same `accent.highlight`/`accentFg.highlight` + `filter: brightness(0.92)` hover trick as TokenSelector.
- `apps/extension/src/components/Swap/SwapQuoteDisplay.tsx` — Card `bg.muted`/`bauhaus.black` → `surface.sunken`/`border.default`. Internal divider `border.secondary` (a non-existent legacy alias — would have rendered as default text) → `border.subtle`. Route source pill border → `border.default`. The `#B8860B` "✨ sWCHAN Staker discount" literal stays — it's flagged for the Phase 13 cleanup sweep where we'll either promote it to a token or wrap it in `useTheme()` once the broader gold-accent treatment is decided.
- `apps/extension/src/components/Swap/SwapConfirmation.tsx` — Added `useTheme()` and `isDarkTheme`. `CALL_ACCENTS` literal Bauhaus tuple → intent tuple `["accent.primary", "accent.secondary", "accent.highlight"]` plus a parallel `CALL_ACCENT_FGS` (mirrors `BatchTransactionConfirmation.tsx:62`), so call cards use the same theme-aware stripe cycle as the batch tx confirmation. Title banner: `bauhaus.blue`/`bauhaus.black`/hardcoded shadow → `accent.secondary`/`border.default`/`card`, with the corner ornament wrapped in `{!isDarkTheme && (...)}` (Bauhaus warm yellow square → omitted in Midnight). Title text + ATOMIC badge swapped to `accentFg.secondary` and `accent.highlight`/`accentFg.highlight`. Swap summary card: `bauhaus.white`/`bauhaus.black`/hardcoded shadow → `surface.raised`/`border.default`/`card`. Empty token avatars `gray.200` → `surface.sunken`. Arrow divider line `gray.200` → `border.subtle`. Arrow circle `bauhaus.blue`/`white` → `accent.secondary`/`accentFg.secondary`. Network badge border → `border.default`. Per-call cards: full migration including hover, badge, divider, "To" copy box, explorer hover. Submitting state spinner box `bauhaus.blue`/`bauhaus.white` → `accent.secondary`/`accentFg.secondary`. Outer scroll bg `bg.base` → `surface.base`; scrollbar thumb hardcoded `#ccc` → `var(--chakra-colors-border-strong)`.
- `apps/extension/src/components/Swap/SwapView.tsx` — Migrated all of: outer screen bg `bg.base` → `surface.base`; chain selector `<MenuList>` (both copies — view has the unsupported-chain branch and the main render branch with their own duplicated chain pickers) deleted inline overrides per Phase 10 Menu rule, kept sizing only; chain search input border + chain row selected/hover backgrounds; "You Sell" and "You Receive" cards `bauhaus.white`/`bauhaus.black`/hardcoded `4px 4px 0px 0px #121212` → `surface.raised`/`border.default`/`card`; sell-amount input `bauhaus.black` border + `bauhaus.blue` hover/focus → `border.default`/`accent.secondary` (and removed inline `borderRadius="0"` on the MAX `<Button>` since Chakra's button defaults handle radii in either theme); USD-mode toggle + MAX button colors `bauhaus.blue` → `accent.secondary`; percent slider — marks active `bauhaus.blue`/idle `gray.400` → `accent.secondary`/`text.tertiary`, track `gray.200` → `surface.sunken`, filled-track `bauhaus.blue` → `accent.secondary`, thumb `bauhaus.blue`/`bauhaus.black` → `accent.secondary`/`border.default`; insufficient balance text `bauhaus.red` → `chart.negative`; Swap-direction flip button `bauhaus.blue`/`bauhaus.white` → `accent.secondary`/`accentFg.secondary`; read-only "You Receive" output input `bg.muted` → `surface.sunken`; price-impact inline % uses `chart.negative` for high impact (orange.500 medium-tier left as Phase 13 cleanup); quote error text `bauhaus.red` → `chart.negative`; price-impact warning Box `red.50`/`orange.50` → `status.error.bg`/`status.warning.bg` (semantic warning surface with paired `fg`); impersonator warning Box `bauhaus.yellow` → `status.warning.bg`/`status.warning.fg`; Action CTA `bauhaus.red`/`bauhaus.white` → `accent.primary`/`accentFg.primary` with `card`/`cardHover` shadows; loading spinner `bauhaus.blue` → `accent.secondary`; `TokenAddressRow` copy/explorer hover colors → `accent.secondary`/`surface.sunken`, copied flash → `accent.highlight`.

**Refactor heuristic changes (carry into Phase 12):**

1. **`Popover` has no baseStyle yet — set surface tokens explicitly on `<PopoverContent>` but NEVER pin `borderRadius={0}`.** Unlike Modal/Menu, `createTheme.ts` does not paint Popover surfaces. So `<PopoverContent>` still needs `bg="surface.raised"` / `border="2px solid"` / `borderColor="border.default"` / `boxShadow="card"` set inline. But omit `borderRadius`: pinning it to 0 would force Midnight to render sharp corners on what should be a rounded floating popover. The tradeoff is a tiny default-radius drift on Bauhaus (Chakra's Popover default) — acceptable in exchange for a clean Midnight look. (TODO Phase 13 candidate: add a Popover baseStyle to `createTheme.ts` so we can delete these inline overrides too.)
2. **Hand-tuned hover shades like `#e6b31c` map cleanly to a `filter: brightness(0.92)` hover trick on the same intent token.** Pattern: `bg="accent.highlight"` + `_hover={{ filter: "brightness(0.92)" }}` reads as "darken on hover" in either palette, without needing two literal hover shades. Use this in place of bare hex hover overrides — saves a `useTheme()` branch.
3. **Semantic warning surfaces (`status.warning.bg`/`status.warning.fg`/`status.error.bg`/`status.error.fg`) replace one-off `red.50`/`orange.50` cream tints.** Phase 11 SwapView's price-impact and impersonator warning boxes used Chakra-default color-scale tints that don't have a Midnight equivalent. The semantic `status.*` token pair is the right migration target — Bauhaus uses the saturated yellow/red (loud, intentional) and Midnight uses the recessed dark warning tint with bright fg. Same intent in either palette. Migrate any remaining `bg="red.50"` / `bg="orange.50"` / `bg="yellow.50"` cards in Phase 12 the same way.

**Known leftover for Phase 13:**

- `SwapQuoteDisplay.tsx` `#B8860B` literal on the sWCHAN staker discount text.
- `SwapView.tsx` `orange.500` literal on the medium price-impact inline %.
- `SwapView.tsx` slider track/thumb `borderRadius={0}` — Bauhaus square is correct, Midnight could use a subtle radius. Phase 13 sweep candidate.

**Test gate:**

- Open Swap from the home screen in both themes. Verify the screen, the chain selector menu, and the empty/loading states render correctly.
- Pick a sell token via the `<TokenSelector>` menu in both themes. Verify selected row highlight, paste-address custom token resolution, and the "Choose" hover.
- Pick a buy token via the `<BuyTokenSelector>` panel in both themes. Verify search, popular chips, holdings list, all-tokens scroll, and the pending-token highlight row.
- Trigger a swap quote (pick a real pair like ETH→USDC on Base). Verify the `<SwapQuoteDisplay>` collapsible card, route pills, and wallet-fee tree render in both themes.
- Tap the slippage gear. Verify the popover, preset chips, custom input, and high-slippage warning render in both themes.
- Push slippage past 10% to trigger the high-slippage popover warning text.
- Push the swap to a price impact above 3% AND above 10% to trigger both the inline % and the full warning Box in both themes.
- Tap Swap → verify `<SwapConfirmation>` renders the title banner, swap summary card, transaction list (try a multi-call swap so the per-call accent stripes cycle), gas estimate, and the Submitting state.
- Test all three wallet types: Bankr API account, private key account, seed phrase account — each uses different signing handlers per CLAUDE.md.

### Phase 12 — Onboarding + Remaining Modals ✅ Shipped

**Files modified:**

- `apps/extension/src/components/shared/PrivateKeyInput.tsx` — Import/Generate toggle: active state `bauhaus.black`/`bauhaus.white` → high-contrast `fg.primary`/`surface.raised` "selected pill" pattern that works in either palette without a `useTheme()` branch. Removed `borderRadius="0"` so Midnight gets soft corners. Error text and "Save this key — cannot be recovered" line + divider line `bauhaus.red` → `chart.negative`. Derived-address confirmation pill `bauhaus.yellow`/`bauhaus.blue`/`bauhaus.white` → `accent.highlight`/`accent.secondary`/`surface.raised` with paired `accentFg.*` foregrounds and `boxShadow="card"`.
- `apps/extension/src/components/RevealPrivateKeyModal.tsx` — Applied Phase 9 ModalContent deletion rule: `<ModalOverlay bg="blackAlpha.700">` → `bg="surface.overlay"`, deleted all inline `bg`/`border`/`borderColor`/`borderRadius`/`boxShadow` from `<ModalContent>`. Header warning icon block `bauhaus.yellow` → `accent.highlight`/`accentFg.highlight`. Agent-session warning Box → `status.warning.bg`/`status.warning.fg`/`status.warning.border` (semantic). Numbered step list left-border `bauhaus.blue` → `accent.secondary`. Two destructive "never share" boxes `bauhaus.red`/`bauhaus.black` with white text → `status.error.bg`/`status.error.fg`/`status.error.border` (semantic). Revealed-key Code container `gray.50`/`bauhaus.black` → `surface.sunken`/`border.default`. Password input: deleted all manual `bg`/`border`/`_focus`/`_hover` overrides and added `isInvalid={!!error}` so the Input baseStyle `_invalid` state takes over.
- `apps/extension/src/components/RevealSeedPhraseModal.tsx` — Identical migration to RevealPrivateKeyModal. Header warning block uses `accent.primary`/`accentFg.primary` (red square in Bauhaus, indigo in Midnight) instead of the custom `bauhaus.red`/`white` pair so it reads as "danger" in either palette.
- `apps/extension/src/components/SeedPhraseSetup.tsx` — Outer screen `bg.base` → `surface.base`. "Save your seed phrase" warning Box `bauhaus.red`/`bauhaus.white` → `status.error.bg`/`status.error.fg`/`status.error.border` (semantic). Mnemonic grid container + word cells `bauhaus.white`/`bg.muted` → `surface.raised`/`surface.sunken` with `border.default` and `card` shadow. Choose-mode option cards `bauhaus.white`/`bauhaus.black`/hardcoded shadow → `surface.raised`/`border.default`/`card` with `surface.raisedHover`. Generate-mode and import-mode form panels mirrored. Import-mode bottom warning box `bauhaus.yellow` → `status.warning.bg`/`status.warning.fg` (semantic). Copy-icon flash `bauhaus.yellow` → `accent.highlight`. Error inline box `bauhaus.red`/`bauhaus.white` → `status.error.bg`/`status.error.fg`. FormErrorMessage `bauhaus.red` → `chart.negative`.
- `apps/extension/src/pages/ApiKeySetup.tsx` — Cleaned up the legacy color-scale tokens (`bg.subtle`, `primary.500`, `error.solid`, `warning.bg/border/solid`) by **deleting all the inline `bg`/`borderColor`/`_hover`/`_focus` overrides** on the Inputs and letting the Input baseStyle from `createTheme.ts` take over completely. FormErrorMessage colors → `chart.negative`. Alert warning surface `warning.bg`/`warning.border`/`warning.solid` → `status.warning.bg`/`status.warning.border`/`status.warning.fg`. Alert body Text color was hardcoded to `text.primary` (white-on-yellow contrast bug in Bauhaus, unreadable in Midnight) → `status.warning.fg` so it pairs correctly in either palette.
- `apps/extension/src/components/AddAccount.tsx` — Outer screen `bg.base` → `surface.base`. All four account-type radio cards (private key / seed / bankr / impersonator) and all panel cards (existing seed groups, impersonator address, bankr api key, display name, security warning) `bauhaus.white`/`bauhaus.black`/hardcoded `4px 4px 0px 0px #121212` → `surface.raised`/`border.default`/`card` with `surface.raisedHover` selected/hover backgrounds. Per-type icon plates: private key `bauhaus.yellow` → `accent.highlight`/`accentFg.highlight`; seed `bauhaus.red` → `accent.primary`/`accentFg.primary`; bankr `bauhaus.blue` → `accent.secondary`/`accentFg.secondary`; impersonator `bauhaus.green` → `status.success.fg`/`status.success.bg` (the only existing token that is "modest green" in either palette). "BankrAPI already added" inline error and impersonator inline error `bauhaus.red` → `chart.negative`. Existing-seed-groups badge `bauhaus.black`/`bauhaus.white` → `fg.primary`/`surface.raised` with the borderRadius drop. Impersonator resolution UI: spinner `bauhaus.blue` → `accent.secondary`; copy/explorer hover `bauhaus.blue`/`bg.muted` → `accent.secondary`/`surface.sunken`; copy success flash `bauhaus.yellow` → `accent.highlight`. Impersonator Input invalid styling: replaced inline `borderColor={...}` ternary with `isInvalid={...}` so the Input baseStyle handles it. View-only warning + PK security warning Boxes `bauhaus.yellow` → `status.warning.bg`/`status.warning.fg` (semantic). All `bg.muted`/`bauhaus.black` divider/border references swept to `surface.sunken`/`border.default`. All `FormErrorMessage` colors → `chart.negative`.
- `apps/extension/src/components/AccountSettingsModal.tsx` — All three Modal views (settings, confirmDelete, changeApiKey) had Phase 9 ModalContent rule applied — deleted inline `bg`/`border`/`borderColor`/`borderRadius`/`boxShadow` and replaced overlay with `bg="surface.overlay"`. Header icon plates: settings `bauhaus.blue` → `accent.secondary`/`accentFg.secondary`; delete `bauhaus.red` → `accent.primary`/`accentFg.primary`. Account info chip dot — type indicator color map updated to intent tokens (PK→`accent.highlight`, Seed→`accent.primary`, impersonator→`status.success.fg`, Bankr→`accent.secondary`). Display Name and Seed Group Name inputs: deleted all the inline `bg`/`border`/`_focus`/`_hover` overrides and let the Input baseStyle take over. ChangeApiKey view: same input cleanup applied to all 3 inputs (api key, wallet address, master password); agent-session warning Box `bauhaus.yellow` → `status.warning.bg`/`status.warning.fg`; alert at bottom uses semantic warning surfaces. ConfirmDelete view: account info Box `bg.muted`/`bauhaus.black` → `surface.sunken`/`border.default`; backup-warning Box `bauhaus.red`/`bauhaus.black` with `white` text → semantic `status.error.*` surface. Remove Account button: disabled `gray.400` → `fg.muted`; active `bauhaus.red` → `chart.negative`; hover `red.50`/`bauhaus.red` → `status.error.bg`/`status.error.border` (semantic). All `FormErrorMessage` colors → `chart.negative`.
- `apps/extension/src/pages/Onboarding.tsx` — The 1,616-line beast. Added `useTheme()` import and `isDarkTheme = themeId === "midnight"`. **`StepIndicator` color tuple** `["bauhaus.red","bauhaus.blue","bauhaus.yellow"]` → `["accent.primary","accent.secondary","accent.highlight"]` with `surface.raised`/`border.default` for inactive dots — same three-color cycle pattern as `BatchTransactionConfirmation`/`SwapConfirmation`. **Welcome step** geometric corner decorations (red square + blue circle + yellow triangle) wrapped in `{!isDarkTheme && (...)}`. Welcome icon plate `bauhaus.yellow`/`bauhaus.black`/hardcoded `6px 6px 0px 0px #121212` → `accent.highlight`/`border.default`/`card`. Footer "@apoorveth" Twitter link `bauhaus.blue`/`bauhaus.red` hover → `accent.secondary`/`accent.highlight` (cross-tint links pattern from Phase 10). **Success step** corner decorations wrapped in `{!isDarkTheme && (...)}`. Floating "pin & click" pointer SVG stroke `var(--chakra-colors-bauhaus-blue)` → `var(--chakra-colors-accent-secondary)`. Pointer-tip badge + success-checkmark plate `bauhaus.yellow`/`bauhaus.black`/hardcoded shadow → `accent.highlight`/`border.default`/`card`. **Form-step wrapper** corner decorations (red square + blue circle) wrapped in `{!isDarkTheme && (...)}`. **AccountType cards** (3 cards: bankr/PK/seed): all `bauhaus.white`/hardcoded shadow → `surface.raised`/`card`; all icon plates use intent tokens (`accent.secondary`/`accent.highlight`/`accent.primary` with paired `accentFg.*`); all selected-state borders cycle through `accent.secondary`/`accent.highlight`/`accent.primary`; selected/hover backgrounds → `surface.sunken`/`surface.raisedHover`. **Bankr setup card / Private key card / Password card**: outer panels migrated and all three Bauhaus corner ornaments (blue circle, yellow square, yellow triangle) wrapped in `{!isDarkTheme && (...)}`. The yellow triangle's `borderBottomColor` literal `bauhaus.yellow` → `var(--chakra-colors-accent-highlight)` (CSS-var form needed for the SVG-style triangle border). Password card: hardcoded `4px 4px 0px 0px #121212` → `card`. Bankr/PK/password warning boxes (yellow stripes) `bauhaus.yellow`/`bauhaus.black` → `status.warning.bg`/`status.warning.fg`/`status.warning.border` (semantic). All `FormErrorMessage` colors → `chart.negative`. Bottom external links `bauhaus.blue`/`bauhaus.red` hover → `accent.secondary`/`accent.highlight`. Background `bg.base` → `surface.base` everywhere (5 places — 2 success-step branches, welcome, seedPhrase, form-wrapper).

**Refactor heuristic additions (carry into Phase 13):**

1. **Inputs with custom invalid borders should be deleted in favor of `isInvalid={...}` + Input baseStyle.** Phase 12 found four files (`RevealPrivateKeyModal`, `RevealSeedPhraseModal`, `AccountSettingsModal`, `AddAccount`) with hand-rolled `borderColor={error ? "bauhaus.red" : "bauhaus.black"}` ternaries plus matching `_focus`/`_hover` overrides. The Input baseStyle in `createTheme.ts:227` already has an `_invalid` state that paints `border.color: accent.primary` with a matching shadow — exactly the right intent. Migration rule: delete the entire inline `bg`/`border`/`borderColor`/`_focus`/`_hover` block and pass `isInvalid={!!error}` instead. Fewer LOC, theme-correct in either palette.
2. **High-contrast "selected pill" toggles map cleanly to `fg.primary` / `surface.raised`.** PrivateKeyInput's Import/Generate toggle wanted "active = solid black with white text" in Bauhaus. Naive translation would have needed a `useTheme()` branch (Midnight has no near-black surface). Instead: active uses `fg.primary` (black in Bauhaus, near-white in Midnight) with `surface.raised` text (white in Bauhaus, dark in Midnight). The contrast inverts but the intent — "this is the selected toggle" — survives in both palettes without conditional code.
3. **`var(--chakra-colors-accent-highlight)` is the correct form for SVG-style border-color literals.** The Bauhaus yellow triangle in Onboarding's password card uses CSS triangle hack (`borderBottom="10px solid"` + `borderBottomColor=...`). Chakra style props don't always resolve token paths inside the `borderBottomColor` slot when nested in a triangle hack. Use the `var(--chakra-colors-accent-highlight)` form so the value resolves to the active theme's accent at paint time. Same trick for the floating pointer SVG `stroke=` attribute.

**Known leftover for Phase 13:**

- The `text.primary`/`text.secondary`/`text.tertiary` legacy semantic tokens are still used everywhere in this phase. They map correctly via `legacy:` block in both themes, but Phase 13 should decide whether to rename them to `fg.*` or keep the `text.*` aliases as a permanent compat layer.
- Three Phase 11 leftovers carry forward unchanged: `#B8860B` literal in SwapQuoteDisplay, `orange.500` medium-tier price-impact in SwapView, slider track/thumb `borderRadius={0}` in SwapView.

**Test gate:**

- Go through the full onboarding wizard with each account type (Bankr, PK, Seed) in both themes. This is a fresh-install flow — do it in a dedicated Chrome profile.
- Reveal private key / seed phrase in both themes (agent password should remain blocked per CLAUDE.md).
- Open Add Account from Settings in both themes — verify all 4 account-type radio cards render correctly with their selected-state borders.
- Open Account Settings modal in both themes — exercise the 3 sub-views (settings, confirmDelete, changeApiKey).
- Verify the Onboarding success-step "pin & click" pointer is visible and animates in both themes (the SVG stroke uses CSS var resolution).
- Verify the agent-session block message (in both Reveal modals) renders with semantic warning surface — should be saturated yellow in Bauhaus, recessed dark warning in Midnight, with contrast-correct foreground in both.

### Phase 13 — Cleanup, Docs, Release Notes ✅ Shipped

**Token contract additions:**

- **`status.warning.tint?: string`** — soft tinted warning surface (optional fourth field on `StatusColor`). Bauhaus = `#FFF8DC` cornsilk wash; Midnight = `surface.sunken`. Used by the cross-dapp batch screen page bg, the gas-estimate fallback row, and replaces the per-component `themeId === "midnight" ? ... : "#FFF8DC"` ternaries.
- **`chart.numeric: string`** — color for highlighting numeric values inside calldata/typed-data displays. Bauhaus = dark goldenrod (`#B8860B`); Midnight = warm amber (`accent.highlight`). Replaces the per-component conditional in `TypedDataDisplay.tsx`, `decodedParams/{Bytes,Uint,Int,String}Param.tsx`, and `SwapQuoteDisplay.tsx` (sWCHAN staker discount).

**New shared hooks/components:**

- **`useStripTokens()`** in `theme/useStripTokens.ts` — returns `{ bg, fg }` for the dark CTA strip pattern. Bauhaus = `fg.primary` / `fg.inverse` (literal black bar); Midnight = `surface.sunken` / `fg.primary` (recessed shelf). Replaces 8 duplicated `isDarkTheme ? "surface.sunken" : "fg.primary"` ternary pairs across `TransactionConfirmation`, `BatchTransactionConfirmation`, `SignatureRequestConfirmation`, `WatchAssetConfirmation`, `PendingTxList`, `Chat/ChatHeader`, `Chat/ChatList`, `App.tsx` (header + address pill), and `TypedDataDisplay` (tab strip).
- **`useThemedToast()`** in `hooks/useThemedToast.tsx` — replaces `useBauhausToast`. The 14 importer files were updated. Toast bg/fg/icon/corner all source from `accent.{primary,secondary,highlight}` + `accentFg.{...}` + `border.default` so the toast respects both themes. Status → accent intent map: info → secondary, success/warning → highlight, error → primary; corner decoration cycles to a different accent.

**Component config additions in `createTheme.ts`:**

- **`buildPopover(t)`** — Popover baseStyle paints `content.bg` / `border` / `borderRadius` / `boxShadow` / `_focus` from theme tokens. `SlippageSettings.tsx` dropped its inline `<PopoverContent bg="surface.raised" border="2px solid" ...>` overrides — only `w="200px"` survives.
- **`buildSlider(t)`** — Slider baseStyle drives track/filledTrack/thumb `borderRadius` from `t.radii.button`. Bauhaus stays square (radii.button = 0); Midnight gets soft pills. `SwapView.tsx` dropped its inline `borderRadius={0}` overrides on `<SliderTrack>`, `<SliderThumb>`, and the swap-direction `<IconButton>`.

**Files modified:**

- `apps/extension/src/hooks/useThemedToast.tsx` — **NEW** (replaces `useBauhausToast.tsx`, which was deleted). Theme-aware render paths described above. 14 importers updated via blanket sed: `pages/ApiKeySetup`, `components/{TokenTransfer, SignatureRequestConfirmation, Swap/SwapView, AccountSettingsModal, UnlockScreen, SeedPhraseSetup, Settings/AppearanceSettings, AddAccount, Settings/Chains, Settings/index, Settings/AutoLockSettings, Settings/ChangePassword, Settings/AgentPasswordSettings}`.
- `apps/extension/src/theme/useStripTokens.ts` — **NEW**. Re-exported from `theme/index.ts`.
- `apps/extension/src/theme/createTheme.ts` — added `buildPopover()` and `buildSlider()`, registered them on the Chakra `components` map.
- `apps/extension/src/theme/tokens.ts` — added `StatusColor.tint?` and `ChartColors.numeric` to the contract; rewrote the legacy-aliases comment block to document the **permanent** `text.*` → `fg.*` compat layer decision.
- `apps/extension/src/theme/themes/bauhaus.ts` — added `status.warning.tint: "#FFF8DC"` and `chart.numeric: "#B8860B"`.
- `apps/extension/src/theme/themes/midnight.ts` — added `status.warning.tint: SURFACE_SUNKEN` and `chart.numeric: ACCENT_HIGHLIGHT`.
- `apps/extension/src/components/Swap/SlippageSettings.tsx` — deleted inline `<PopoverContent bg="surface.raised" border="2px solid" borderColor="border.default" boxShadow="card" _focus={{ boxShadow: "card" }}>` overrides; only `w="200px"` survives.
- `apps/extension/src/components/Swap/SwapView.tsx` — dropped 3 hardcoded `borderRadius={0}` overrides (slider track, slider thumb, swap-direction IconButton). Slider/Button baseStyles handle them now.
- `apps/extension/src/components/Swap/SwapQuoteDisplay.tsx` — sWCHAN discount text `color="#B8860B"` → `color="chart.numeric"`.
- `apps/extension/src/App.tsx` — added `useStripTokens()` import. `crossDappBg` literal `#FFF8DC` → `"status.warning.tint"`. Header `headerBg`/`headerFg` and the inline address pill ternary both routed through `useStripTokens()`. The `headerHoverBg` overlay stays inline (only non-shared bit).
- `apps/extension/src/components/CrossDappBatchConfirmation.tsx` — `pageBgColor` literal `#FFF8DC` → `"status.warning.tint"`. Dropped `useTheme` import (no longer needed).
- `apps/extension/src/components/MultiTxGasEstimateDisplay.tsx` — `warningBg` literal `#FFF9E0` → `"status.warning.tint"`. Dropped `useTheme` import.
- `apps/extension/src/components/TypedDataDisplay.tsx` — `numericColor` conditional → `"chart.numeric"`. Tab strip pair routed through `useStripTokens()`.
- `apps/extension/src/components/decodedParams/{UintParam,IntParam,BytesParam,StringParam}.tsx` — all 4 files: `numericColor` conditional → `"chart.numeric"`. Dropped `useTheme` imports.
- `apps/extension/src/components/{TransactionConfirmation,BatchTransactionConfirmation,SignatureRequestConfirmation,WatchAssetConfirmation,PendingTxList,Chat/ChatHeader,Chat/ChatList}.tsx` — all 7 files migrated to `useStripTokens()`. Confirmation files (Tx/Batch/Sig) keep their `useTheme()` import for ornament wrapping (`!isDarkTheme && ...`).
- `apps/extension/src/components/{TransactionConfirmation,SignatureRequestConfirmation}.tsx` — Phase 8 Reject All button bug fixed: idle `color="status.error.fg"` (WHITE in Bauhaus, invisible) → `color="chart.negative"` (RED in both themes). `BatchTransactionConfirmation.tsx` was already correct.
- `apps/extension/src/index.css` and `apps/extension/src/onboarding.css` — added `html[data-theme="midnight"]` selectors so the popup-window-mode wash and the onboarding body bg pick up the Midnight base color (`#0A0C10`) before React paints. Bauhaus default `#F0F0F0` is preserved.

**Refactor heuristic additions (the running cleanup playbook):**

1. **For "soft warning wash" surfaces, use `status.warning.tint`** — not raw `status.warning.bg` (too saturated for full-screen washes) and not a per-component `themeId` ternary. The optional `tint` field on `StatusColor` was added in Phase 13 for this exact pattern.
2. **For numeric value emphasis in calldata/typed-data displays, use `chart.numeric`** — promoted to the token contract in Phase 13. Per-component `themeId === "midnight" ? "accent.highlight" : "#B8860B"` conditionals were the wrong shape; they pollute call sites with theme-specific hex literals.
3. **For "dark CTA strip" inverted bars, use `useStripTokens()`** from `@/theme` — never duplicate the `isDarkTheme ? "surface.sunken" : "fg.primary"` pair inline. The hook lives at `theme/useStripTokens.ts` and is exported from the public API barrel.
4. **For component baseStyles in `createTheme.ts` (Modal, Menu, Popover, Slider, Tooltip, Button, Input)**, prefer adding to the factory over inline overrides. Phase 13 added `buildPopover` and `buildSlider`. The pattern: lift the inline `bg`/`border`/`borderRadius`/`boxShadow`/`_focus` props into a `baseStyle` object and source them from `t.radii.*`, `t.shadows.*`, intent token names. Then delete the inline overrides at every call site.
5. **For Chrome action API badge colors and CSS body backgrounds**, use literals — they live outside the React tree and can't read CSS vars at the moments they need to apply. The `index.css` `popup-window-mode` wash and the `chrome.action.setBadgeBackgroundColor` calls in `pendingTxStorage.ts` / `pendingSignatureStorage.ts` are exempt from the no-literals rule. Use `html[data-theme="..."]` selectors to make CSS theme-aware.
6. **`text.*` legacy aliases are PERMANENT.** 610+ call sites use them; renaming would be high-churn, low-value sed. The factory's `legacy:` block aliases `text.*` → `fg.*` at zero cost. New code should still prefer `fg.*` but existing usage is fine to leave. Documented in `tokens.ts`.
7. **JSX comments inside `{condition && (...)}` expressions are JS, not JSX.** Use `// line comments` between `(` and the JSX node. `{/* JSX comments */}` belong to JSX child slots — they break parsing if you put them inside the JS expression of a `{...}` interpolation. Phase 13 hit this in `TransactionConfirmation.tsx` Reject All; the fix is to move JSX comments OUTSIDE the conditional.

**Audit results (sweeps after the cleanup):**

- `rg '#D02020|#1040C0|#F0C020|#121212' apps/extension/src` → 4 files: `theme/themes/bauhaus.ts` (definitions), `theme/primitives/IconBox.tsx` (in a comment), `lib/chainIcons.ts` (chain brand colors — exempt), and `hooks/useBauhausToast.tsx` (DELETED — sweep was run before delete). After delete: only `theme/` files and chain-brand exempt files match. ✅
- `rg 'bauhaus\.' apps/extension/src --glob '!theme/**'` → only docstring/comment matches in `MultiTxGasEstimateDisplay.tsx` and `theme/primitives/{ThemedCard,IconBox}.tsx`. Zero live token references. ✅
- `rg 'translate\(2px, 2px\)' apps/extension/src` → only `theme/themes/bauhaus.ts` motion config. ✅
- `rg 'useBauhausToast' apps/extension/src` → zero matches. ✅
- `rg '#[0-9A-Fa-f]{6}' apps/extension/src --glob '!theme/**' --glob '!constants/chainRegistry.ts' --glob '!lib/chainIcons.ts' --glob '!chrome/pendingTxStorage.ts' --glob '!chrome/pendingSignatureStorage.ts' --glob '!*.css'` → only the WalletChan OS brand banner gradient in `App.tsx` (`#1a1a2e/#16213e` — fixed brand color, intentionally theme-independent). All other component-code hex literals are gone. ✅
- `pnpm build:extension` → built green across all 5 targets on the second attempt (the first attempt caught a JSX-comment-in-JS-expression error in `TransactionConfirmation.tsx`, fixed in-place). Bundle sizes unchanged from Phase 12.

**Decisions made (carry forward):**

- **`text.*` is permanent compat**, not pending removal. Documented in `tokens.ts` legacy block comment.
- **Chain brand colors** (`lib/chainIcons.ts`, `constants/chainRegistry.ts`) are exempt from the no-literals rule — Ethereum is `#627EEA` regardless of which theme the user picks. Chain brand identity ≠ theme color.
- **Chrome API colors** (`chrome.action.setBadgeBackgroundColor` in `pendingTxStorage.ts` / `pendingSignatureStorage.ts`) are exempt — the Chrome API requires literal hex, can't read CSS vars.
- **WalletChan OS brand banner gradient** in `App.tsx` is exempt — it's a brand element, not a theme element.

**Test gate:**

- Open the extension in both themes. Step through the popup home screen, account switcher, settings menu.
- Perform at least one real transaction in each wallet type (Bankr, PK, Seed) in BOTH themes — the Reject All button fix only matters when there's a queue.
- Toast nuking: trigger an error toast (e.g. wrong password on unlock) and a success toast (e.g. copy address) in both themes. Verify all 4 status variants render with correct contrast.
- Slippage popover in Swap → both themes. Should have rounded corners in Midnight and square in Bauhaus (Popover baseStyle in action).
- Cross-dapp batch screen (add 2+ tx to cross-dapp batch) → verify the cornsilk-tinted bg in Bauhaus and the recessed-surface bg in Midnight.
- Calldata decoder on a tx with uint/int/bytes/string params → verify numeric value emphasis color is dark goldenrod in Bauhaus, warm amber in Midnight.
- Open `chrome://extensions`, reload, switch theme, reload extension again — verify the choice persists across reloads. Verify it does NOT sync across devices (use a second Chrome profile).
- Run `rg '#[0-9A-Fa-f]{6}' apps/extension/src --glob '!theme/**' --glob '!lib/chainIcons.ts' --glob '!constants/chainRegistry.ts' --glob '!chrome/pending*' --glob '!*.css'` and confirm the only match is the WalletChan OS brand gradient in `App.tsx`.

**Definition of done — checklist against Section 12:**

| # | Requirement | Status |
|---|---|---|
| 1 | User can toggle between Bauhaus and Midnight from Settings → Appearance | ✅ |
| 2 | Both themes render every screen, every modal, every flow correctly | ✅ pending v3.2.0 visual QA |
| 3 | Switching themes is instant with no flash and persists across reloads | ✅ (bootstrap.ts + index.css/onboarding.css attribute selectors) |
| 4 | `rg '#[0-9A-Fa-f]{6}' apps/extension/src --glob '!theme/**'` returns zero matches outside exempt files | ✅ (only chain brand colors, Chrome API, CSS body, OS brand gradient remain) |
| 5 | All three wallet types (Bankr / PK / Seed) work identically to before in both themes | ✅ pending QA |
| 6 | `_docs/STYLING.md`, `_docs/STORAGE.md`, `_docs/IMPLEMENTATION.md`, `CLAUDE.md` updated | ✅ STYLING (token vocab + authoring guide), IMPLEMENTATION (theme engine section), CLAUDE.md (intent tokens + Reject All rule + strip pattern + theme/ files). STORAGE.md unchanged — no storage shape changes in Phase 13. |
| 7 | Adding `themes/paper.ts` would require editing zero component files | ✅ — the only inputs to a new theme are `themes/{name}.ts` + a one-line registration in `ThemeProvider.tsx`. |

**Theme engine is provably done. Ready for v3.2.0 release notes.**

---

## 8. Primitive Examples — The Refactor in Practice

Concrete example of what migrating one block looks like. Current code from `TransactionConfirmation.tsx` (simplified):

```tsx
<Box
  bg="bauhaus.white"
  border="2px solid"
  borderColor="#121212"
  boxShadow="4px 4px 0px 0px #121212"
  p={4}
  _hover={{ transform: "translateY(-2px)" }}
  transition="all 0.2s ease-out"
>
  <Text fontSize="sm" fontWeight="700" textTransform="uppercase">
    From
  </Text>
  {/* ... */}
</Box>
```

After migration:

```tsx
<ThemedCard interactive p={4}>
  <Text textStyle="label">From</Text>
  {/* ... */}
</ThemedCard>
```

- `<ThemedCard>` owns the bg/border/shadow/radius/hover motion from tokens.
- `textStyle="label"` pulls from `theme.labelStyle` — Bauhaus renders it uppercase + wide tracking, Midnight renders it sentence case.
- Zero theme-specific literals in the component.

**Anti-pattern guard** — add a lightweight ESLint rule after Phase 2 that flags hex literals in `*.tsx` files inside `apps/extension/src/components/` and `apps/extension/src/pages/`. Throws on violation. This is our ratchet — new code can't regress.

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Bauhaus visually regresses during token rename | High (users see a broken wallet) | Phase 1 ports Bauhaus as-is with a bit-for-bit mapping. Screenshot diff every touched screen. Do a visual QA pass before merging P1. |
| Flash of wrong theme on popup open | Medium (looks janky) | Pre-mount `dataset.theme` bootstrap in `index.tsx` (Phase 1). |
| Midnight design gets messy as we go | Medium (inconsistent feel across screens) | Keep the Section 4 design brief as the law. Any deviation must update the PRD first. |
| Adding a new screen mid-phases that ignores the token rules | Low-Medium | Document the new pattern in `CLAUDE.md` so future sessions (Claude or the user) know about `<ThemedCard>` / `<ThemedField>` / no-hardcoded-colors. Add the ESLint rule from Section 8. |
| Merging Phase N before Phase N-1 is tested in both themes | High | Explicit rule: every PR must include screenshots (or a GIF) of the affected screen in **both themes** before merging. |
| Chart colors (PortfolioChart) look bad in dark mode | Low | Phase 6 has explicit chart token swap; tune during that phase's visual QA. |
| Third-party components (Chakra Menu/Modal scrim) don't pick up the theme cleanly | Medium | Chakra Menu and Modal respect component-level theme config. Factory must emit full `Menu` / `Modal` component blocks per theme. Validated in Phases 4 and 7. |

---

## 10. Future Theme Roadmap (informational)

Once the factory is in place, future themes are cheap. Some ideas:

- **Paper** — light, soft newspaper aesthetic with serif headings, warm cream backgrounds.
- **Terminal** — high-contrast green-on-black, monospaced everything, CRT scanline decorator.
- **Candy** — playful pastel with rounded everything, soft gradient fills.
- **Neon** — cyberpunk dark with neon accents, glitch animations.

Each would be ~300 lines of `themes/{name}.ts` + possibly a `decorators.shapesLogo` component. No component files would need to change.

None of these are in scope for this PRD.

---

## 11. Out-of-Scope Reminders

- No changes to message handlers, storage (other than the one new key), background logic, crypto, or auth.
- No changes to the website (`apps/website/`). That uses its own theme and stays Bauhaus.
- No dark-mode auto-detection. No system preference follow. Explicit user choice only.
- No per-account themes. The theme is global.
- No theme customization (users can't edit colors).

---

## 12. Definition of Done

The theming engine is "done" when all of the following are true:

1. User can toggle between Bauhaus and Midnight from Settings → Appearance.
2. Both themes render every screen, every modal, every flow correctly.
3. Switching themes is instant with no flash and persists across reloads.
4. `rg '#[0-9A-Fa-f]{6}' apps/extension/src --glob '!theme/**'` returns zero matches (ignoring code that explicitly parses hex for user-pasted values, e.g., color input fields).
5. All three wallet types (Bankr / PK / Seed) work identically to before in both themes.
6. `_docs/STYLING.md`, `_docs/STORAGE.md`, `_docs/IMPLEMENTATION.md`, and `CLAUDE.md` are updated to reflect the new architecture.
7. Adding `themes/paper.ts` (a hypothetical third theme) would require editing zero component files.

When #7 is provably true, we've built a theme **engine**, not just a second theme.
