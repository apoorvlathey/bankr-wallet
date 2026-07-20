/**
 * useIconChipBg — theme-aware background for a dapp favicon / app icon chip.
 *
 * Dapp favicons frequently ship as *dark-on-transparent* SVGs (hedgey.finance's
 * H, Safe's diamond, Balancer's B, etc.). A dark glyph on a dark surface reads
 * as a black hole. Both themes therefore paint the icon chip on a light neutral
 * background so any icon — dark or light — stays legible.
 *
 * Bauhaus already gets this for free: `bg.muted` is a light grey on the white
 * card. Midnight needs an explicit light chip because every surface token is
 * dark navy.
 *
 * Consumers pass the return value to a `<Box bg={...}>` that wraps the
 * `<Image src={favicon} />`. Border colors are still driven by `border.subtle`
 * / `border.default` — this hook only controls the chip fill.
 */

import { useTheme } from "./ThemeProvider";

export function useIconChipBg(): string {
  const { tokens } = useTheme();
  return tokens.colorMode === "dark" ? "whiteAlpha.900" : "bg.muted";
}

/** Foreground paired with the intentionally light icon-chip background. */
export function useIconChipFg(): string {
  const { tokens } = useTheme();
  return tokens.colorMode === "dark" ? "fg.inverse" : "fg.primary";
}
