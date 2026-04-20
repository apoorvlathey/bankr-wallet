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
 * Custom chains (user-added from Settings) and unknown chains (not in
 * CHAIN_REGISTRY) don't have a curated brand color; they fall back to neutral
 * surface/foreground tokens in both themes — a plain `surface.raised` chip
 * with `fg.primary` text. Unknown chains are auto-detected by comparing the
 * incoming brand values against `DEFAULT_CHAIN_CONFIG`, so every consumer
 * (SwapView, TxConfirmation, PendingTxList, etc.) gets the readable fallback
 * for free even without passing `isCustom`.
 *
 * Future themes can implement whatever rendering strategy they want by
 * extending this hook — no consumer component has to change.
 */

import { useTheme } from "./ThemeProvider";
import { DEFAULT_CHAIN_CONFIG } from "@/constants/chainRegistry";

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
/**
 * Pure resolver — same logic as the hook, but takes `themeId` as an argument
 * so it can be called inside render loops (where a hook can't be invoked
 * per-row). Use this when iterating over many chains in the same component.
 */
export function resolveChainBadgeStyle(
  themeId: string,
  brandBg: string,
  brandFg: string,
  isCustom = false,
): ChainBadgeStyle {
  const isDarkTheme = themeId === "midnight";

  // Chains not in CHAIN_REGISTRY fall back to DEFAULT_CHAIN_CONFIG, whose
  // sentinel white-on-white values would render the badge unreadable in
  // Midnight (brand fg #FAFAFA on a whiteAlpha.900 chip). Treat them the same
  // as user-added custom chains so they pick up neutral surface tokens.
  const isUnknownChain =
    brandBg === DEFAULT_CHAIN_CONFIG.bg && brandFg === DEFAULT_CHAIN_CONFIG.text;

  if (isCustom || isUnknownChain) {
    return {
      bg: "surface.raised",
      fg: "fg.primary",
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

export function useChainBadgeStyle(
  brandBg: string,
  brandFg: string,
  isCustom = false,
): ChainBadgeStyle {
  const { themeId } = useTheme();
  return resolveChainBadgeStyle(themeId, brandBg, brandFg, isCustom);
}
