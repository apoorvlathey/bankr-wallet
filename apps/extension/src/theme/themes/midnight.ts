/**
 * Midnight theme — calm, precise, focused dark mode.
 *
 * Phase 3 of the theming rollout (see _docs/THEMING_PRD.md §4 for the full
 * design brief). Where Bauhaus is bold/constructive/extroverted, Midnight is
 * its opposite: premium financial tooling at night, an environment for
 * reading transaction data carefully — not a poster.
 *
 * Until Phases 4–12 migrate every screen to intent tokens, switching to
 * Midnight will leave non-migrated surfaces looking like dark Bauhaus rather
 * than the intended Midnight aesthetic. That's expected and tracked in the
 * PRD test gate. The theme is gated behind a dev-only toggle until Phase 4
 * lands the in-app Settings picker.
 *
 * Design rules encoded here (vs. Bauhaus):
 *   - Soft luminous shadows, no hard offsets
 *   - 1px borders — Midnight gets weight from contrast, not stroke thickness
 *   - Modest radii (10–16px) — modern but still deliberate
 *   - Title-case headings, sentence-case labels — never uppercase
 *   - Snappier transitions (160ms cubic-bezier vs. 200ms ease-out)
 *   - Press uses scale(0.98) instead of translate(2px, 2px)
 *   - No corner ornaments, no thick dividers
 */

import type { ThemeTokens } from "../tokens";

// ─────────────────────────────────────────────────────────────────────────────
// Raw Midnight palette — V2 foundation.
//
// Direction: neutral financial tooling rather than violet-forward web3 UI.
// Elevation comes from a quiet zinc lightness ramp, action/focus uses one
// trustworthy blue family, and semantic colors use translucent washes.
// ─────────────────────────────────────────────────────────────────────────────

const SURFACE_BASE = "#09090B";
const SURFACE_RAISED = "#111113";
const SURFACE_RAISED_HOVER = "#18181B";
const SURFACE_SUNKEN = "#0A0A0B";
const SURFACE_OVERLAY = "rgba(0, 0, 0, 0.72)";

// Foreground steps — retuned for legibility on navy surfaces.
//   primary:   main text (was #E8ECF4, kept)
//   secondary: supporting text, labels, secondary numeric data (balances).
//              Lifted from #8B93A7 (~5:1) → #B8C0D4 (~7.5:1 on surface.raised)
//              so token balances and address subtext read clearly.
//   muted:    tertiary data (price-per-unit, timestamps, helper text).
//              Lifted from #525A6E (~2.6:1, fails WCAG AA) → #8891A8 (~4.6:1,
//              passes AA for normal text) so the USD price column next to
//              balances stops fading into the background.
const FG_PRIMARY = "#F4F4F5";
const FG_SECONDARY = "#A1A1AA";
const FG_MUTED = "#85858F";
const FG_INVERSE = "#09090B";

// BORDER_SUBTLE is the hairline divider inside cards — a *slight* grey lift
// off SURFACE_RAISED that reads as a quiet rule line, not a bright slash. If
// you make this brighter, row dividers inside the tx confirmation info card
// start looking like white marker strokes. The frame weights (default/strong)
// progress up from here so outlines still have presence.
const BORDER_SUBTLE = "rgba(255, 255, 255, 0.06)";
const BORDER_DEFAULT = "rgba(255, 255, 255, 0.10)";
const BORDER_STRONG = "rgba(255, 255, 255, 0.16)";
const BORDER_FOCUS = "#3B82F6";

const ACCENT_PRIMARY = "#2563EB";
const ACCENT_SECONDARY = "#60A5FA";
const ACCENT_HIGHLIGHT = "#F59E0B";

const SUCCESS_FG = "#4ADE80";
const SUCCESS_BG = "rgba(34, 197, 94, 0.10)";
const SUCCESS_BORDER = "rgba(34, 197, 94, 0.28)";

const WARNING_FG = "#FBBF24";
const WARNING_BG = "rgba(245, 158, 11, 0.10)";
const WARNING_BORDER = "rgba(245, 158, 11, 0.28)";

const ERROR_FG = "#F87171";
const ERROR_BG = "rgba(239, 68, 68, 0.10)";
const ERROR_BORDER = "rgba(239, 68, 68, 0.28)";

// Informational surfaces should feel calm and explanatory, not branded or
// cautionary. Keep them out of the primary violet family so permission/revoke
// callouts do not read as warnings.
const INFO_FG = "#60A5FA";
const INFO_BG = "rgba(59, 130, 246, 0.10)";
const INFO_BORDER = "rgba(59, 130, 246, 0.28)";

// ─────────────────────────────────────────────────────────────────────────────
// Resting surfaces are shadowless. Only floating/hovered surfaces receive
// neutral elevation; focus is the sole blue shadow.
// ─────────────────────────────────────────────────────────────────────────────

const SHADOW_CARD = "none";
const SHADOW_CARD_HOVER = "0 4px 12px rgba(0, 0, 0, 0.24)";
const SHADOW_MODAL = "0 20px 48px rgba(0, 0, 0, 0.52)";
const SHADOW_FOCUS = "0 0 0 3px rgba(59, 130, 246, 0.28)";
const SHADOW_ERROR_FOCUS = "0 0 0 3px rgba(239, 68, 68, 0.20)";
const SHADOW_BUTTON = "none";

// Snappier transition curve than Bauhaus's ease-out — feels more like
// Linear / Arc / Superhuman.
const TRANSITION_BASE =
  "background-color 150ms cubic-bezier(0.2, 0.6, 0.2, 1), border-color 150ms cubic-bezier(0.2, 0.6, 0.2, 1), color 150ms cubic-bezier(0.2, 0.6, 0.2, 1), opacity 150ms cubic-bezier(0.2, 0.6, 0.2, 1), transform 150ms cubic-bezier(0.2, 0.6, 0.2, 1)";
const TRANSITION_SMOOTH =
  "background-color 220ms cubic-bezier(0.2, 0.6, 0.2, 1), border-color 220ms cubic-bezier(0.2, 0.6, 0.2, 1), opacity 220ms cubic-bezier(0.2, 0.6, 0.2, 1), transform 220ms cubic-bezier(0.2, 0.6, 0.2, 1)";

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

export const midnightTokens: ThemeTokens = {
  id: "midnight",
  name: "Midnight",
  description:
    "Calm, precise, focused. Premium dark mode for reading transaction data carefully.",
  colorMode: "dark",
  preview: {
    bg: SURFACE_BASE,
    fg: FG_PRIMARY,
    accents: [ACCENT_PRIMARY, ACCENT_SECONDARY, ACCENT_HIGHLIGHT],
  },

  colors: {
    surface: {
      base: SURFACE_BASE,
      raised: SURFACE_RAISED,
      raisedHover: SURFACE_RAISED_HOVER,
      sunken: SURFACE_SUNKEN,
      overlay: SURFACE_OVERLAY,
      accentTint: "rgba(37, 99, 235, 0.08)",
    },
    fg: {
      primary: FG_PRIMARY,
      secondary: FG_SECONDARY,
      muted: FG_MUTED,
      inverse: FG_INVERSE,
    },
    border: {
      subtle: BORDER_SUBTLE,
      default: BORDER_DEFAULT,
      strong: BORDER_STRONG,
      focus: BORDER_FOCUS,
    },
    accent: {
      primary: ACCENT_PRIMARY,
      secondary: ACCENT_SECONDARY,
      highlight: ACCENT_HIGHLIGHT,
    },
    accentFg: {
      primary: "#FFFFFF",
      secondary: FG_INVERSE,
      highlight: FG_INVERSE,
    },
    status: {
      success: { bg: SUCCESS_BG, fg: SUCCESS_FG, border: SUCCESS_BORDER },
      // `tint` is the same recessed surface used for cross-dapp / fallback rows;
      // Bauhaus uses a literal cornsilk for parity, Midnight reuses surface.sunken
      // so the muted luminous shadows still read against it.
      warning: {
        bg: WARNING_BG,
        fg: WARNING_FG,
        border: WARNING_BORDER,
        tint: "rgba(245, 158, 11, 0.05)",
      },
      error: { bg: ERROR_BG, fg: ERROR_FG, border: ERROR_BORDER },
      info: { bg: INFO_BG, fg: INFO_FG, border: INFO_BORDER },
    },
    chart: {
      positive: SUCCESS_FG,
      negative: ERROR_FG,
      neutral: FG_MUTED,
      // Warm amber matches the Bauhaus dark-goldenrod intent — emphasizes
      // numeric values without competing with the cool indigo/cyan accents.
      numeric: ACCENT_HIGHLIGHT,
      series: ["#3B82F6", "#22C55E", ACCENT_HIGHLIGHT, "#A78BFA", ERROR_FG],
    },
  },

  // Typography — title case headings, sentence case labels. No uppercase.
  // Bauhaus uppercase would feel "yelly" against Midnight's restrained surfaces.
  fonts: {
    brand: "'Anton', 'Arial Narrow', Impact, sans-serif",
    heading:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    body:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
  headingStyle: {
    transform: "none",
    tracking: "-0.01em",
    weight: 700,
    lineHeight: "1.1",
  },
  labelStyle: {
    transform: "none",
    tracking: "0",
    weight: 600,
  },

  // Modest, modern radii. Still deliberate — never fully pill, never sharp.
  radii: {
    button: "8px",
    input: "8px",
    card: "12px",
    modal: "16px",
    badge: "6px",
    pill: "9999px",
  },

  // Single-pixel borders. Midnight gets weight from surface contrast and
  // luminous shadows, not from thick strokes — so all three weights collapse
  // to 1px and only the color shifts.
  borders: {
    thin: `1px solid ${BORDER_SUBTLE}`,
    medium: `1px solid ${BORDER_DEFAULT}`,
    thick: `1px solid ${BORDER_STRONG}`,
    hairline: `1px solid ${BORDER_SUBTLE}`,
  },

  // Soft elevation. Inset highlight + offset blur, no hard offsets anywhere.
  shadows: {
    card: SHADOW_CARD,
    cardHover: SHADOW_CARD_HOVER,
    modal: SHADOW_MODAL,
    focus: SHADOW_FOCUS,
    errorFocus: SHADOW_ERROR_FOCUS,
    button: SHADOW_BUTTON,
    // null = factory leaves boxShadow alone on press; combined with the
    // scale(0.98) transform this gives a depress without a shadow swap.
    buttonPressed: null,
    pressed: null,
  },

  motion: {
    press: {
      transform: "scale(0.985)",
      shadowOverride: null,
    },
    hover: {
      transform: "none",
      shadowOverride: SHADOW_CARD_HOVER,
    },
    transitionBase: TRANSITION_BASE,
    transitionSmooth: TRANSITION_SMOOTH,
    screenDuration: 0.22,
    screenEase: [0.32, 0.72, 0, 1],
  },

  // No corner ornaments, no thick dividers. Midnight's personality is in
  // typography rhythm, generous whitespace, and luminous focus states.
  // The optional `decorators` field is omitted entirely so the Decorator
  // primitive renders nothing under this theme.

  // ───────────────────────────────────────────────────────────────────────────
  // Legacy aliases — best-effort dark mappings.
  //
  // These exist purely so non-migrated screens (anything that still reads
  // `bauhaus.*` / `bg.*` / `text.*`) render in dark colors instead of throwing.
  // Some contrast will be wrong (e.g. `bauhaus.black` used as a border vs as
  // text) until each component migrates to intent tokens in Phases 4–12.
  // Don't try to perfect this block — fix the *consumer* in its phase instead.
  // ───────────────────────────────────────────────────────────────────────────
  legacy: {
    bauhaus: {
      red: ERROR_FG,
      blue: ACCENT_PRIMARY,
      yellow: ACCENT_HIGHLIGHT,
      green: SUCCESS_FG,
      // Most usages are border colors; default to a strong border so the UI
      // doesn't get bright white outlines on dark surfaces. Text usages will
      // look dim until migrated.
      black: BORDER_STRONG,
      white: SURFACE_RAISED,
    },
    bg: {
      base: SURFACE_BASE,
      subtle: SURFACE_RAISED,
      muted: SURFACE_RAISED_HOVER,
      emphasis: SURFACE_SUNKEN,
    },
    text: {
      primary: FG_PRIMARY,
      secondary: FG_SECONDARY,
      tertiary: FG_MUTED,
    },
    border: {
      subtle: BORDER_SUBTLE,
      default: BORDER_DEFAULT,
      strong: BORDER_STRONG,
    },
    primary: {
      400: ACCENT_PRIMARY,
      500: ACCENT_PRIMARY,
      600: "#6C7BEF",
      700: "#5C6BDF",
    },
    success: { bg: SUCCESS_BG, border: SUCCESS_BORDER, solid: SUCCESS_FG },
    warning: { bg: WARNING_BG, border: WARNING_BORDER, solid: WARNING_FG },
    error: { bg: ERROR_BG, border: ERROR_BORDER, solid: ERROR_FG },
    info: { bg: INFO_BG, border: INFO_BORDER, solid: INFO_FG },
  },
};

export default midnightTokens;
