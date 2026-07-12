/**
 * Theme Tokens — the contract every theme must satisfy.
 *
 * See _docs/THEMING_PRD.md for the full specification, design decisions, and
 * phased rollout plan. This file is the type-level source of truth: a theme
 * tokens object must satisfy `ThemeTokens` for the factory to accept it.
 *
 * Naming convention is INTENT-based, not color-based. A theme should never
 * have a token called `red` or `yellow` — use `accent.primary`, `status.error`,
 * `accent.highlight`, etc. so the same component code can adopt any visual
 * language without modification.
 */

import type { ComponentType } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

export const THEME_IDS = ["bauhaus", "midnight"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const SELECTED_THEME_STORAGE_KEY = "selectedThemeId";
export const DEFAULT_THEME_ID: ThemeId = "bauhaus";
export const FRESH_INSTALL_THEME_ID: ThemeId = "midnight";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}

export function isDarkThemeId(value: ThemeId | string): boolean {
  return value === "midnight";
}

export interface ThemePreview {
  /** Background color used in the picker card */
  bg: string;
  /** Foreground color used in the picker card */
  fg: string;
  /** Three accent swatches shown as small chips in the picker card */
  accents: [string, string, string];
}

// ─────────────────────────────────────────────────────────────────────────────
// Color tokens
// ─────────────────────────────────────────────────────────────────────────────

/** Background layers, deepest → highest elevation */
export interface SurfaceColors {
  /** Page background — the deepest layer */
  base: string;
  /** Cards, modals, headers — one step elevated */
  raised: string;
  /** Hover state for `raised` surfaces — a subtle shift in the same direction */
  raisedHover: string;
  /** Input fields, recessed containers — one step recessed */
  sunken: string;
  /** Modal scrim / backdrop overlay */
  overlay: string;
  /**
   * Soft accent-tinted surface — used to make a card visually distinct from
   * the standard `raised` cards around it without using a loud status color.
   * Currently used by the clear-signing card so the human-readable intent
   * draws the eye before Origin/From/Network metadata. Should remain *very*
   * subtle: a wash, not a banner.
   */
  accentTint: string;
}

/** Foreground / text hierarchy */
export interface ForegroundColors {
  /** Main body text */
  primary: string;
  /** Labels, metadata, secondary text */
  secondary: string;
  /** Placeholders, disabled states */
  muted: string;
  /** Text that sits on accent fills (button labels, badge text) */
  inverse: string;
}

/** Stroke hierarchy */
export interface BorderColors {
  /** Hairline dividers */
  subtle: string;
  /** Standard borders */
  default: string;
  /** Strong dividers, card outlines */
  strong: string;
  /** Focus ring color */
  focus: string;
}

/**
 * Brand / action accents — INTENT-named, not color-named.
 * `primary` is the main CTA color regardless of whether the theme uses
 * red, indigo, or anything else.
 */
export interface AccentColors {
  /** Main CTA — primary actions */
  primary: string;
  /** Secondary actions, links */
  secondary: string;
  /** Attention, highlights, special callouts */
  highlight: string;
}

/**
 * Foreground (text) colors that read well on each accent background.
 * Maintained as a parallel structure so the factory can build button/badge
 * variants without guessing contrast.
 */
export interface AccentForegrounds {
  primary: string;
  secondary: string;
  highlight: string;
}

export interface StatusColor {
  bg: string;
  /** Foreground with sufficient contrast when rendered on `bg`. */
  fg: string;
  border: string;
  /** Semantic-colored text/icon rendered on a neutral application surface. */
  emphasis: string;
  /**
   * Softer tinted variant of `bg` — used when the standard `bg` would be too
   * saturated for a full-screen wash or row highlight. Optional. If a theme
   * doesn't supply one, components fall back to `bg`.
   *
   * Currently set on `status.warning` only (cream wash for the cross-dapp batch
   * screen and the gas-estimate fallback row).
   */
  tint?: string;
}

export interface StatusColors {
  success: StatusColor;
  warning: StatusColor;
  error: StatusColor;
  info: StatusColor;
}

/** Chart and data viz palette */
export interface ChartColors {
  /** Positive change (e.g. portfolio up, asset received) */
  positive: string;
  /** Negative change (e.g. portfolio down, asset sent) */
  negative: string;
  /** Neutral / unchanged */
  neutral: string;
  /**
   * Color for highlighting numeric values inside calldata / typed-data displays
   * — distinct from regular fg text but still readable on `surface.raised`.
   * Bauhaus uses dark goldenrod, Midnight uses warm amber.
   */
  numeric: string;
  /** Series colors for multi-line/bar charts */
  series: [string, string, string, string, string];
}

export interface ThemeColors {
  surface: SurfaceColors;
  fg: ForegroundColors;
  border: BorderColors;
  accent: AccentColors;
  /** Contrast text colors paired with each accent (used by button/badge variants) */
  accentFg: AccentForegrounds;
  status: StatusColors;
  chart: ChartColors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typography
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeFonts {
  /** Display face reserved for the WalletChan brand wordmark. */
  brand: string;
  heading: string;
  body: string;
  mono: string;
}

export interface HeadingStyle {
  /** Whether headings are uppercased */
  transform: "uppercase" | "none";
  /** letter-spacing value (Chakra letterSpacing token or raw CSS) */
  tracking: string;
  /** Font weight (CSS numeric) */
  weight: number;
  /** Line height (Chakra lineHeight token or raw CSS) */
  lineHeight: string;
}

export interface LabelStyle {
  transform: "uppercase" | "none";
  tracking: string;
  weight: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural tokens
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeRadii {
  button: string;
  input: string;
  card: string;
  modal: string;
  badge: string;
  /** Always "9999px" for circular elements */
  pill: string;
}

export interface ThemeBorders {
  /** Thin border (e.g. "2px solid {border.default}") */
  thin: string;
  /** Medium border — used heavily by section cards in Settings/Chains (Bauhaus 3px) */
  medium: string;
  /** Thick border (e.g. "4px solid {border.default}") */
  thick: string;
  /** Hairline (1px) */
  hairline: string;
}

export interface ThemeShadows {
  /** Default card shadow */
  card: string;
  /** Hovered card shadow */
  cardHover: string;
  /** Modal / dialog shadow */
  modal: string;
  /** Focus ring shadow */
  focus: string;
  /** Invalid-field focus ring, kept distinct from the normal action focus */
  errorFocus: string;
  /** Default button shadow */
  button: string;
  /** Button shadow when pressed (null = no swap) */
  buttonPressed: string | null;
  /** Generic pressed-state shadow override (null = no swap) */
  pressed: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Motion
// ─────────────────────────────────────────────────────────────────────────────

export interface MotionStyle {
  /** transform value (e.g. "translate(2px, 2px)" or "scale(0.98)") */
  transform: string;
  /** Optional shadow override applied alongside the transform */
  shadowOverride: string | null;
}

export interface ThemeMotion {
  /** Active / pressed state */
  press: MotionStyle;
  /** Hover state for interactive cards */
  hover: MotionStyle;
  /** Default transition for most elements */
  transitionBase: string;
  /** Smoother / longer transition for layout changes */
  transitionSmooth: string;
  /** Duration (in seconds) for top-level screen transitions (framer-motion) */
  screenDuration: number;
  /** Easing curve for top-level screen transitions — cubic-bezier as [x1,y1,x2,y2] */
  screenEase: [number, number, number, number];
}

// ─────────────────────────────────────────────────────────────────────────────
// Decorators (theme-specific visual flourishes)
// ─────────────────────────────────────────────────────────────────────────────

export type CardCornerStyle = "dot" | "square" | "triangle" | "none";
export type DividerStyle =
  | "solid-thick"
  | "solid-thin"
  | "dashed-glow"
  | "none";

export interface ThemeDecorators {
  /** Corner ornament drawn on cards */
  cardCorner?: CardCornerStyle;
  /** Style of divider lines */
  dividerStyle?: DividerStyle;
  /** Optional theme-supplied loader (e.g. ShapesLoader replacement) */
  shapesLogo?: ComponentType<{ size?: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy aliases — preserves the existing `bauhaus.*`, `bg.*`, `text.*`,
// `border.*`, `primary.*`, `success.*`, `warning.*`, `error.*`, `info.*`
// color tokens that 60+ files reference today.
//
// Phase 1 introduced these so the migration could land incrementally without
// breaking unmigrated screens. By Phase 13, components no longer reference
// `bauhaus.*` (the saturated color names), but `text.*` remains in active
// use across 600+ sites.
//
// **Decision (Phase 13):** keep `text.*` as a permanent compat layer alias
// for `fg.*`. Renaming all 600+ references to `fg.primary` / `fg.secondary`
// / `fg.tertiary` would be high-churn, low-value sed work that adds no
// expressive power — the legacy block already maps `text.*` to the active
// theme's `fg.*` colors at zero cost. New code should still prefer `fg.*`
// (it's the intent name), but existing `text.*` usage is fine to leave.
//
// The other legacy slots (`bg.*`, `bauhaus.*`, `primary.*`, `success.*`,
// `warning.*`, `error.*`, `info.*`) are eligible for removal if all
// references migrate to intent tokens; they're unused in component code as
// of Phase 13 except for `bg.muted` (button hover bg) and `border.subtle`.
// ─────────────────────────────────────────────────────────────────────────────

export interface LegacyBauhausPalette {
  red: string;
  blue: string;
  yellow: string;
  green: string;
  black: string;
  white: string;
}

export interface LegacyBgPalette {
  base: string;
  subtle: string;
  muted: string;
  emphasis: string;
}

export interface LegacyTextPalette {
  primary: string;
  secondary: string;
  tertiary: string;
}

export interface LegacyBorderPalette {
  subtle: string;
  default: string;
  strong: string;
}

export interface LegacyPrimaryPalette {
  400: string;
  500: string;
  600: string;
  700: string;
}

export interface LegacyStatusPalette {
  bg: string;
  border: string;
  solid: string;
}

export interface LegacyAliases {
  bauhaus: LegacyBauhausPalette;
  bg: LegacyBgPalette;
  text: LegacyTextPalette;
  border: LegacyBorderPalette;
  primary: LegacyPrimaryPalette;
  success: LegacyStatusPalette;
  warning: LegacyStatusPalette;
  error: LegacyStatusPalette;
  info: LegacyStatusPalette;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level ThemeTokens shape
// ─────────────────────────────────────────────────────────────────────────────

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  description: string;
  /** Drives Chakra's initialColorMode */
  colorMode: "light" | "dark";
  preview: ThemePreview;

  colors: ThemeColors;

  fonts: ThemeFonts;
  headingStyle: HeadingStyle;
  labelStyle: LabelStyle;

  radii: ThemeRadii;
  borders: ThemeBorders;
  shadows: ThemeShadows;
  motion: ThemeMotion;

  decorators?: ThemeDecorators;

  /**
   * Legacy color aliases — maintained during the migration so existing
   * `bauhaus.red` / `bg.base` / `text.primary` references keep working.
   * Will be removed once all components migrate to intent tokens.
   */
  legacy: LegacyAliases;

  /**
   * Escape hatch — additional Chakra component config merged on top of
   * the factory output. Use sparingly and only when tokens cannot
   * express the difference.
   */
  componentOverrides?: Record<string, unknown>;
}
