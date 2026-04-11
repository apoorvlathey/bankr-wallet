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
// Raw Midnight palette — v3.2.1 retune
//
// Design direction: modern web3 (Phantom / Uniswap / Rainbow) — violet-forward,
// deep navy-black base with subtle cool cast, clearly layered surfaces,
// saturated-but-not-neon accents, subtle violet tint in focus/modal shadows.
//
// Changes from the initial Phase 3 palette:
//   - Base/raised lifted from flat near-black greys to cool navy-blacks so
//     cards read as clearly elevated above the page (#0A0C10 → #0B0E17,
//     #111419 → #131826).
//   - Primary swapped from soft indigo (#7C8BFF) to electric violet (#7C5CFF)
//     — more saturated, reads as a striking CTA instead of washed pastel.
//   - Secondary swapped from flat cyan (#00D4E6) to vibrant cyan (#22D3EE) —
//     cleaner, crisper, less dated.
//   - Highlight swapped from pastel mustard (#F6C86E) to rich amber (#F5B544)
//     — less washed out, still warm, contrasts strongly on navy surfaces.
//   - Text lifted from harsh #F5F7FA to softer #E8ECF4 so the page feels
//     calmer without losing legibility.
//   - Modal/focus shadows now carry a subtle violet glow matching the primary.
// ─────────────────────────────────────────────────────────────────────────────

const SURFACE_BASE = "#0B0E17";
const SURFACE_RAISED = "#131826";
const SURFACE_RAISED_HOVER = "#1A2033";
const SURFACE_SUNKEN = "#070911";
const SURFACE_OVERLAY = "rgba(5, 7, 14, 0.82)";

const FG_PRIMARY = "#E8ECF4";
const FG_SECONDARY = "#8B93A7";
const FG_MUTED = "#525A6E";
const FG_INVERSE = "#0B0E17";

// BORDER_SUBTLE is the hairline divider inside cards — a *slight* grey lift
// off SURFACE_RAISED that reads as a quiet rule line, not a bright slash. If
// you make this brighter, row dividers inside the tx confirmation info card
// start looking like white marker strokes. The frame weights (default/strong)
// progress up from here so outlines still have presence.
const BORDER_SUBTLE = "#1E2437";
const BORDER_DEFAULT = "#2A3147";
const BORDER_STRONG = "#3B4460";
const BORDER_FOCUS = "#7C5CFF";

const ACCENT_PRIMARY = "#7C5CFF"; // Electric violet — main CTA
const ACCENT_SECONDARY = "#3B82F6"; // Classic tech blue — secondary / links
const ACCENT_HIGHLIGHT = "#F5B544"; // Rich amber — attention / highlights

const SUCCESS_FG = "#34D399";
const SUCCESS_BG = "#052E1C";
const SUCCESS_BORDER = "#1B5E3F";

const WARNING_FG = "#FBBF24";
const WARNING_BG = "#291B03";
const WARNING_BORDER = "#5F3E0E";

const ERROR_FG = "#F87171";
const ERROR_BG = "#2A0D10";
const ERROR_BORDER = "#5A1D23";

const INFO_FG = "#A78BFA";
const INFO_BG = "#1A1440";
const INFO_BORDER = "#3B2B7A";

// ─────────────────────────────────────────────────────────────────────────────
// Shadow strings — declared as constants so motion.hover can re-reference the
// cardHover value without duplicating its definition. Modal and focus shadows
// carry a subtle violet tint matching ACCENT_PRIMARY so the luminous depth
// feels coherent with the palette instead of pure grayscale.
// ─────────────────────────────────────────────────────────────────────────────

const SHADOW_CARD =
  "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.55)";
const SHADOW_CARD_HOVER =
  "0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 32px rgba(0,0,0,0.65)";
const SHADOW_MODAL =
  "0 24px 64px rgba(0,0,0,0.72), 0 0 0 1px rgba(124, 92, 255, 0.14)";
const SHADOW_FOCUS = "0 0 0 3px rgba(124, 92, 255, 0.38)";
const SHADOW_BUTTON =
  "0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 12px rgba(0,0,0,0.5)";

// Snappier transition curve than Bauhaus's ease-out — feels more like
// Linear / Arc / Superhuman.
const TRANSITION_BASE = "all 0.16s cubic-bezier(0.2, 0.6, 0.2, 1)";
const TRANSITION_SMOOTH = "all 0.24s cubic-bezier(0.2, 0.6, 0.2, 1)";

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
      // Electric violet and classic tech blue are both mid-value saturated
      // colors — they need WHITE text for legibility (near-black text reads
      // as a muddy smudge on them). Amber is bright enough to pair with
      // near-black text and still pop.
      primary: "#FFFFFF",
      secondary: "#FFFFFF",
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
        tint: SURFACE_SUNKEN,
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
      series: [ACCENT_PRIMARY, ACCENT_SECONDARY, ACCENT_HIGHLIGHT, SUCCESS_FG, ERROR_FG],
    },
  },

  // Typography — title case headings, sentence case labels. No uppercase.
  // Bauhaus uppercase would feel "yelly" against Midnight's restrained surfaces.
  fonts: {
    heading:
      "Outfit, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    body:
      "Outfit, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
    button: "10px",
    input: "10px",
    card: "14px",
    modal: "16px",
    badge: "6px",
    pill: "9999px",
  },

  // Single-pixel borders. Midnight gets weight from surface contrast and
  // luminous shadows, not from thick strokes — so all three weights collapse
  // to 1px and only the color shifts.
  borders: {
    thin: `1px solid ${BORDER_DEFAULT}`,
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
    button: SHADOW_BUTTON,
    // null = factory leaves boxShadow alone on press; combined with the
    // scale(0.98) transform this gives a depress without a shadow swap.
    buttonPressed: null,
    pressed: null,
  },

  motion: {
    press: {
      transform: "scale(0.98)",
      shadowOverride: null,
    },
    hover: {
      transform: "translateY(-1px)",
      shadowOverride: SHADOW_CARD_HOVER,
    },
    transitionBase: TRANSITION_BASE,
    transitionSmooth: TRANSITION_SMOOTH,
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
