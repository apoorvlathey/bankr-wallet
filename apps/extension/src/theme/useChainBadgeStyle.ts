/**
 * useChainBadgeStyle — theme-aware resolution of chain badge colors.
 *
 * Chain brand colors live in `constants/chainRegistry.ts` and are exempt from
 * the "no hex literals in components" rule (Ethereum is always `#627EEA`
 * regardless of theme). The registry exposes three values per chain:
 *
 *   - `bg`   — a low-alpha rgba tint of the brand color
 *   - `text` — the saturated brand color (used for text + icons)
 *   - `border` — a slightly higher alpha border derived from the brand
 *
 * These values read beautifully on Bauhaus's light surfaces, but on Midnight's
 * deep navy wash the rgba tint collapses into near-invisibility and the badge
 * becomes brand-colored text on an almost-identical dark bg. This hook is the
 * single place where we translate the registry values into the theme-adjusted
 * triple that consumers should apply.
 *
 * Bauhaus:
 *   - bg     → brand rgba tint (as-is)
 *   - fg     → brand saturated color (as-is)
 *   - border → `border.default` (the page-wide black stroke)
 *
 * Midnight:
 *   - bg     → `whiteAlpha.900` (light chip — crucial because many chain
 *              icons like Ethereum are dark-on-transparent SVGs that vanish
 *              on a dark background; the light chip keeps both the icon and
 *              the brand-colored text legible in one place)
 *   - fg     → brand saturated color
 *   - border → brand saturated color (the brand hue becomes the badge frame)
 *
 * Custom chains (user-added from Settings) don't have a curated brand color;
 * they fall back to neutral surface/foreground tokens in both themes.
 *
 * Future themes can implement whatever rendering strategy they want by
 * extending this hook — no consumer component has to change.
 */

import { useTheme } from "./ThemeProvider";

export interface ChainBadgeStyle {
  /** Badge/pill background */
  bg: string;
  /** Badge text + icon color */
  fg: string;
  /** Badge border color */
  border: string;
}

/**
 * Resolve chain badge colors for the active theme.
 *
 * @param brandBg - The chain's registry `bg` value (low-alpha rgba tint)
 * @param brandFg - The chain's registry `text` value (saturated brand color)
 * @param isCustom - Whether this is a user-added custom chain (no brand colors)
 */
export function useChainBadgeStyle(
  brandBg: string,
  brandFg: string,
  isCustom = false,
): ChainBadgeStyle {
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";

  if (isCustom) {
    return {
      bg: isDarkTheme ? "whiteAlpha.900" : "surface.raised",
      fg: isDarkTheme ? "fg.inverse" : "fg.primary",
      border: "border.default",
    };
  }

  if (isDarkTheme) {
    return {
      bg: "whiteAlpha.900",
      fg: brandFg,
      border: brandFg,
    };
  }

  return {
    bg: brandBg,
    fg: brandFg,
    border: "border.default",
  };
}
