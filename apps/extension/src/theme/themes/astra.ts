/**
 * Astra theme — minimal, utilitarian, emerald-accented dark mode.
 *
 * Design direction: modern productivity tooling (Linear / shadcn-style
 * dashboards). Where Midnight is premium-navy with luminous violet accents
 * and soft shadows, Astra is utilitarian-zinc with a flat, low-chrome feel
 * and a vibrant emerald CTA.
 *
 * Design rules encoded here (vs. Midnight):
 *   - Zinc-based neutrals (cool grey) rather than navy
 *   - Flat surfaces — minimal shadows, depth comes from border + bg contrast
 *   - 8px radii across the board — no soft pill shapes
 *   - System font stack — no custom webfont
 *   - Emerald focus ring and CTA colour (#10B981)
 *   - Subtle scale(0.98) press, no hover lift on cards (just bg shift)
 */

import type { ThemeTokens } from "../tokens";

// ─────────────────────────────────────────────────────────────────────────────
// Raw Astra palette — zinc neutrals + emerald accent
//
// Mirrors the Tailwind zinc scale (zinc-950 … zinc-600) because that's the
// vocabulary Astra's source design system uses. Text hierarchy is four deep,
// matching the tokens contract: primary (zinc-100) → secondary (zinc-400)
// → muted (zinc-600) → inverse (zinc-950 — for text on accent fills).
// ─────────────────────────────────────────────────────────────────────────────

const SURFACE_BASE = "#09090B"; // zinc-950 — page wash
const SURFACE_RAISED = "#18181B"; // zinc-900 — cards / modals
const SURFACE_RAISED_HOVER = "#27272A"; // zinc-800 — row hover
const SURFACE_SUNKEN = "#050507"; // slightly below base — inputs / recessed
const SURFACE_OVERLAY = "rgba(0, 0, 0, 0.82)";

const FG_PRIMARY = "#F4F4F5"; // zinc-100
const FG_SECONDARY = "#A1A1AA"; // zinc-400 — labels / metadata
const FG_MUTED = "#52525B"; // zinc-600 — placeholder / disabled
const FG_INVERSE = "#09090B"; // zinc-950 — text on light accent fills

// Borders progress from nearly-invisible (matches raised surface) up to a
// readable mid-grey. Astra leans heavily on 1px borders at every weight —
// the visual weight comes from colour contrast, not stroke thickness.
const BORDER_SUBTLE = "#1F1F23"; // just above raised bg — hairline divider
const BORDER_DEFAULT = "#27272A"; // zinc-800 — standard card / input stroke
const BORDER_STRONG = "#3F3F46"; // zinc-700 — emphasized separators
const BORDER_FOCUS = "#10B981"; // emerald-500

const ACCENT_PRIMARY = "#10B981"; // emerald-500 — main CTA / focus
const ACCENT_SECONDARY = "#0EA5E9"; // sky-500 — secondary action / link
const ACCENT_HIGHLIGHT = "#F59E0B"; // amber-500 — attention / callout

const SUCCESS_FG = "#10B981"; // emerald-500
const SUCCESS_BG = "#052E1C"; // emerald-950-ish tint
const SUCCESS_BORDER = "#065F46"; // emerald-800

const WARNING_FG = "#F59E0B"; // amber-500
const WARNING_BG = "#2E1F00";
const WARNING_BORDER = "#78350F"; // amber-900

const ERROR_FG = "#F43F5E"; // rose-500 (destructive in Astra)
const ERROR_BG = "#2E0710";
const ERROR_BORDER = "#881337"; // rose-900

const INFO_FG = "#38BDF8"; // sky-400
const INFO_BG = "#082F49"; // sky-950
const INFO_BORDER = "#075985"; // sky-800

// ─────────────────────────────────────────────────────────────────────────────
// Shadow strings — Astra is nearly flat. Cards get a whisper of shadow to
// separate them from the page wash; modals get a stronger drop. Focus rings
// carry an emerald tint matching the primary accent.
// ─────────────────────────────────────────────────────────────────────────────

const SHADOW_CARD = "0 1px 2px rgba(0, 0, 0, 0.4)";
const SHADOW_CARD_HOVER = "0 2px 6px rgba(0, 0, 0, 0.5)";
const SHADOW_MODAL =
  "0 24px 48px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.04)";
const SHADOW_FOCUS = "0 0 0 3px rgba(16, 185, 129, 0.35)";
const SHADOW_BUTTON = "0 1px 2px rgba(0, 0, 0, 0.4)";

// Tailwind-style transition — 150ms cubic-bezier(0.4, 0, 0.2, 1).
const TRANSITION_BASE = "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)";
const TRANSITION_SMOOTH = "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)";

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

export const astraTokens: ThemeTokens = {
  id: "astra",
  name: "Astra",
  description:
    "Minimal, utilitarian, emerald-accented. Modern productivity tooling in dark mode.",
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
      // Emerald-500 is bright/saturated — near-black reads cleanly on it and
      // matches the shadcn convention (primary-foreground is dark). Sky gets
      // white text (classic tech-blue rule). Amber pairs with near-black.
      primary: FG_INVERSE,
      secondary: "#FFFFFF",
      highlight: FG_INVERSE,
    },
    status: {
      success: { bg: SUCCESS_BG, fg: SUCCESS_FG, border: SUCCESS_BORDER },
      warning: {
        bg: WARNING_BG,
        fg: WARNING_FG,
        border: WARNING_BORDER,
        // `tint` is the recessed surface used for cross-dapp / fallback rows;
        // reuse surface.sunken so it stays consistent with Midnight's choice.
        tint: SURFACE_SUNKEN,
      },
      error: { bg: ERROR_BG, fg: ERROR_FG, border: ERROR_BORDER },
      info: { bg: INFO_BG, fg: INFO_FG, border: INFO_BORDER },
    },
    chart: {
      positive: SUCCESS_FG,
      negative: ERROR_FG,
      neutral: FG_MUTED,
      numeric: ACCENT_HIGHLIGHT,
      series: [
        ACCENT_PRIMARY,
        ERROR_FG,
        ACCENT_HIGHLIGHT,
        ACCENT_SECONDARY,
        "#8B5CF6", // violet-500 — matches Astra's chart-5
      ],
    },
  },

  // System font stack — Astra uses whatever the OS provides. No custom webfont
  // loading, no FOUT. Mono is SF Mono first (macOS), Menlo/Monaco next.
  fonts: {
    heading:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    body:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    mono: "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', ui-monospace, monospace",
  },
  headingStyle: {
    transform: "none",
    tracking: "-0.01em",
    weight: 600,
    lineHeight: "1.2",
  },
  labelStyle: {
    transform: "none",
    tracking: "0",
    weight: 500,
  },

  // 8px everywhere — matches Astra's `--radius: 0.5rem` default. Modal nudges
  // to 12px so overlays feel distinct from inline cards.
  radii: {
    button: "8px",
    input: "8px",
    card: "8px",
    modal: "12px",
    badge: "6px",
    pill: "9999px",
  },

  // Flat 1px borders. Weight variance comes from the colour scale
  // (subtle → default → strong), not stroke thickness.
  borders: {
    thin: `1px solid ${BORDER_DEFAULT}`,
    medium: `1px solid ${BORDER_DEFAULT}`,
    thick: `1px solid ${BORDER_STRONG}`,
    hairline: `1px solid ${BORDER_SUBTLE}`,
  },

  shadows: {
    card: SHADOW_CARD,
    cardHover: SHADOW_CARD_HOVER,
    modal: SHADOW_MODAL,
    focus: SHADOW_FOCUS,
    button: SHADOW_BUTTON,
    buttonPressed: null,
    pressed: null,
  },

  motion: {
    press: {
      transform: "scale(0.98)",
      shadowOverride: null,
    },
    hover: {
      // Astra hover is a colour shift (surface.raisedHover), not a lift. Keep
      // transform at none so cards don't jitter on mouse-over.
      transform: "none",
      shadowOverride: SHADOW_CARD_HOVER,
    },
    transitionBase: TRANSITION_BASE,
    transitionSmooth: TRANSITION_SMOOTH,
  },

  // No decorators — Astra is utilitarian and deliberately un-ornamented.

  // ───────────────────────────────────────────────────────────────────────────
  // Legacy aliases — best-effort dark mappings so un-migrated screens render
  // in the right colour family instead of throwing. Same approach as Midnight.
  // ───────────────────────────────────────────────────────────────────────────
  legacy: {
    bauhaus: {
      red: ERROR_FG,
      blue: ACCENT_SECONDARY,
      yellow: ACCENT_HIGHLIGHT,
      green: ACCENT_PRIMARY,
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
      400: "#34D399", // emerald-400
      500: ACCENT_PRIMARY,
      600: "#059669", // emerald-600
      700: "#047857", // emerald-700
    },
    success: { bg: SUCCESS_BG, border: SUCCESS_BORDER, solid: SUCCESS_FG },
    warning: { bg: WARNING_BG, border: WARNING_BORDER, solid: WARNING_FG },
    error: { bg: ERROR_BG, border: ERROR_BORDER, solid: ERROR_FG },
    info: { bg: INFO_BG, border: INFO_BORDER, solid: INFO_FG },
  },
};

export default astraTokens;
