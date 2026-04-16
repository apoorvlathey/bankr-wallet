/**
 * useIsDarkTheme — `true` when the active theme's `colorMode` is "dark".
 *
 * Components frequently need to branch on "is this a dark theme?" for
 * decisions that Chakra tokens can't express directly — e.g., wrapping a
 * dark-on-transparent dapp favicon in a light chip so it stays legible, or
 * inverting the CTA strip rhythm on the home screen.
 *
 * Previously, ~17 call sites wrote `const isDarkTheme = themeId === "midnight"`
 * inline. That check silently broke whenever a new dark theme (Astra, etc.)
 * was added — the branch fell through to the light path and icons turned
 * into black holes on a black background. This hook reads `colorMode` from
 * the active tokens so every dark theme (current and future) Just Works.
 */

import { useTheme } from "./ThemeProvider";

export function useIsDarkTheme(): boolean {
  const { tokens } = useTheme();
  return tokens.colorMode === "dark";
}
