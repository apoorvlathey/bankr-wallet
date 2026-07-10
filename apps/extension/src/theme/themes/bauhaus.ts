/**
 * Bauhaus theme — light, bold, geometric, constructivist.
 *
 * This is a direct port of the original `apps/extension/src/theme.ts`. Every
 * legacy alias resolves to its exact historic hex value so the rendered output
 * is bit-for-bit identical to pre-refactor builds. Do NOT change values here
 * without an explicit visual review.
 *
 * See _docs/STYLING.md for the original design language and _docs/THEMING_PRD.md
 * for how this fits into the broader theming engine.
 */

import type { ThemeTokens } from "../tokens";

// ─────────────────────────────────────────────────────────────────────────────
// Raw color literals — the historic Bauhaus palette
// ─────────────────────────────────────────────────────────────────────────────

const RED = "#D02020";
const BLUE = "#1040C0";
const YELLOW = "#F0C020";
const GREEN = "#208040";
const BLACK = "#121212";
const WHITE = "#FFFFFF";

const BG_BASE = "#F0F0F0";
const BG_SUBTLE = WHITE;
const BG_MUTED = "#E0E0E0";
const BG_EMPHASIS = "#D0D0D0";

const TEXT_PRIMARY = BLACK;
const TEXT_SECONDARY = "#3A3A3A";
const TEXT_TERTIARY = "#666666";

const PRIMARY_400 = BLUE;
const PRIMARY_500 = BLUE;
const PRIMARY_600 = "#0D3399";
const PRIMARY_700 = "#0A2673";

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

export const bauhausTokens: ThemeTokens = {
  id: "bauhaus",
  name: "Bauhaus",
  description: "Bold, geometric, constructivist. Hard shadows and primary colors.",
  colorMode: "light",
  preview: {
    bg: BG_BASE,
    fg: BLACK,
    accents: [RED, BLUE, YELLOW],
  },

  colors: {
    surface: {
      base: BG_BASE,
      raised: WHITE,
      raisedHover: "#F5F5F5",
      sunken: WHITE,
      overlay: "rgba(0, 0, 0, 0.6)",
      // Soft warm cream — gentle warm wash that visibly distinguishes the
      // clear-signing card from the surrounding WHITE `raised` cards without
      // shouting. Subtler than the warning `tint` (#FFF8DC) since this is an
      // attention cue, not an alert; subtler than the original saturated
      // #FFF1C2 so it stays elegant rather than feeling sticker-applied.
      accentTint: "#FFF6D9",
    },
    fg: {
      primary: TEXT_PRIMARY,
      secondary: TEXT_SECONDARY,
      muted: TEXT_TERTIARY,
      inverse: WHITE,
    },
    border: {
      subtle: BLACK,
      default: BLACK,
      strong: BLACK,
      focus: BLUE,
    },
    accent: {
      primary: RED,
      secondary: BLUE,
      highlight: YELLOW,
    },
    accentFg: {
      primary: WHITE,
      secondary: WHITE,
      highlight: BLACK,
    },
    status: {
      success: { bg: YELLOW, fg: BLACK, border: BLACK },
      // Cornsilk/cream tint — used as a soft warning wash on the cross-dapp
      // batch page and the gas-estimate fallback row, where the saturated
      // YELLOW status bg would be too aggressive.
      warning: { bg: YELLOW, fg: BLACK, border: BLACK, tint: "#FFF8DC" },
      error: { bg: RED, fg: WHITE, border: BLACK },
      info: { bg: BLUE, fg: WHITE, border: BLACK },
    },
    chart: {
      positive: GREEN,
      negative: RED,
      neutral: TEXT_TERTIARY,
      // Dark goldenrod — emphasizes numeric values in calldata/typed-data
      // displays without competing with the saturated accent palette.
      numeric: "#B8860B",
      series: [BLUE, RED, YELLOW, GREEN, "#A040C0"],
    },
  },

  fonts: {
    brand: "'Anton', 'Arial Narrow', Impact, sans-serif",
    heading:
      "Outfit, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    body:
      "Outfit, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
  headingStyle: {
    transform: "uppercase",
    tracking: "tight",
    weight: 900,
    lineHeight: "0.95",
  },
  labelStyle: {
    transform: "uppercase",
    tracking: "wider",
    weight: 700,
  },

  radii: {
    button: "0",
    input: "0",
    card: "0",
    modal: "0",
    badge: "0",
    pill: "9999px",
  },
  borders: {
    thin: `2px solid ${BLACK}`,
    medium: `3px solid ${BLACK}`,
    thick: `4px solid ${BLACK}`,
    hairline: `1px solid ${BLACK}`,
  },
  shadows: {
    card: `4px 4px 0px 0px ${BLACK}`,
    cardHover: `6px 6px 0px 0px ${BLACK}`,
    modal: `8px 8px 0px 0px ${BLACK}`,
    focus: `3px 3px 0px 0px ${BLUE}`,
    errorFocus: `3px 3px 0px 0px ${RED}`,
    button: `4px 4px 0px 0px ${BLACK}`,
    buttonPressed: "none",
    pressed: "none",
  },
  motion: {
    press: {
      transform: "translate(2px, 2px)",
      shadowOverride: "none",
    },
    hover: {
      transform: "translateY(-2px)",
      shadowOverride: null,
    },
    transitionBase: "all 0.2s ease-out",
    transitionSmooth: "all 0.3s ease-out",
    screenDuration: 0.22,
    screenEase: [0.32, 0.72, 0.2, 1],
  },
  decorators: {
    // Bauhaus uses sharp 8px squares as the corner ornament — see e.g. the
    // yellow square on the "Confirm Swap" header. The Decorator primitive
    // reads this and renders the matching shape; "dot" was incorrect.
    cardCorner: "square",
    dividerStyle: "solid-thick",
  },

  // Legacy aliases — these mirror the original `theme.ts` color block exactly,
  // so every existing `bauhaus.*` / `bg.*` / `text.*` reference renders as it
  // did before the refactor.
  legacy: {
    bauhaus: {
      red: RED,
      blue: BLUE,
      yellow: YELLOW,
      green: GREEN,
      black: BLACK,
      white: WHITE,
    },
    bg: {
      base: BG_BASE,
      subtle: BG_SUBTLE,
      muted: BG_MUTED,
      emphasis: BG_EMPHASIS,
    },
    text: {
      primary: TEXT_PRIMARY,
      secondary: TEXT_SECONDARY,
      tertiary: TEXT_TERTIARY,
    },
    border: {
      subtle: BLACK,
      default: BLACK,
      strong: BLACK,
    },
    primary: {
      400: PRIMARY_400,
      500: PRIMARY_500,
      600: PRIMARY_600,
      700: PRIMARY_700,
    },
    success: { bg: YELLOW, border: BLACK, solid: BLACK },
    warning: { bg: YELLOW, border: BLACK, solid: BLACK },
    error: { bg: RED, border: BLACK, solid: WHITE },
    info: { bg: BLUE, border: BLACK, solid: WHITE },
  },
};

export default bauhausTokens;
