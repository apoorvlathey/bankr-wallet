/**
 * useStripTokens — shared color pair for inverted "strip" / pill UI.
 *
 * Two variants:
 *
 * - `"inverted"` (default) — the dark CTA strip used by transaction
 *   confirmation headers, WatchAsset's "Add Token" bar, chat header / list
 *   bars, and confirmation count badges. Bauhaus paints it as a literal black
 *   bar with white text; Midnight uses the recessed `surface.sunken` so it
 *   reads as a darker shelf above the base surface, with primary fg text on
 *   top.
 *
 * - `"elevated"` — the card-styled strip used by the inline address pill on
 *   the home screen. Bauhaus keeps the signature black bar (so the home page
 *   still carries the inverted-strip rhythm), but Midnight swaps to an
 *   *elevated* raised surface with a visible border — surface.sunken is too
 *   close to surface.base in Midnight, so the pill would otherwise blend into
 *   the page wash. A real border + raised bg reads as a framed card.
 *
 * Promoted to a hook in Phase 13 — previously each call site duplicated the
 * `isDarkTheme ? ... : ...` ternary inline. The `"elevated"` variant was added
 * in Phase 14 so we could centralize the address-pill fix without scattering
 * `isDarkTheme` checks into consumer components.
 */

import { useTheme } from "./ThemeProvider";

export type StripVariant = "inverted" | "elevated";

export interface StripTokens {
  /** Background token for the strip itself */
  bg: string;
  /** Foreground (text/icon) token that reads on top of `bg` */
  fg: string;
  /** Border token — `"transparent"` when the strip has no visible edge. */
  border: string;
}

export function useStripTokens(variant: StripVariant = "inverted"): StripTokens {
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";

  if (variant === "elevated") {
    // Bauhaus keeps the literal inverted black bar — it's a signature look and
    // the address pill sits nicely in the page rhythm. Midnight lifts the pill
    // onto the raised surface with a visible border so it reads as a framed
    // card above the base wash.
    if (isDarkTheme) {
      return {
        bg: "surface.raised",
        fg: "fg.primary",
        border: "border.default",
      };
    }
    return {
      bg: "fg.primary",
      fg: "fg.inverse",
      border: "transparent",
    };
  }

  return {
    bg: isDarkTheme ? "surface.sunken" : "fg.primary",
    fg: isDarkTheme ? "fg.primary" : "fg.inverse",
    border: "transparent",
  };
}
