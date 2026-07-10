/**
 * ThemedCard — the canonical surface primitive.
 *
 * Replaces the dozens of inline `<Box bg="bauhaus.white" border="2px solid"
 * borderColor="bauhaus.black" boxShadow="...">` patterns scattered through the
 * codebase. Reads structural tokens from the active theme so the same
 * component instance renders correctly under any theme.
 *
 * Variants:
 *   - "default" — surface.raised + theme-default elevation (most common)
 *   - "raised"  — surface.raised + elevated cardHover shadow (modal-like)
 *   - "sunken"  — surface.sunken, no shadow (recessed input/list rows)
 *
 * Border weights (`weight` prop):
 *   - "thin"   — 2px in Bauhaus, 1px in Midnight (default; small cards)
 *   - "medium" — 3px in Bauhaus, 1px in Midnight (Settings rows, account list)
 *   - "thick"  — 4px in Bauhaus, 1px in Midnight (modals, hero containers)
 *
 * Pass `interactive` to opt into hover/active/focus styling. The caller must
 * still supply native button/link semantics through `as` or wrap the card in a
 * native interactive element; visual interactivity is not a semantic role.
 */

import { forwardRef } from "react";
import { Box, type BoxProps } from "@chakra-ui/react";
import { useTheme } from "../ThemeProvider";

export type ThemedCardVariant = "default" | "raised" | "sunken";
export type ThemedCardWeight = "thin" | "medium" | "thick";

export interface ThemedCardProps extends BoxProps {
  variant?: ThemedCardVariant;
  weight?: ThemedCardWeight;
  interactive?: boolean;
}

export const ThemedCard = forwardRef<HTMLDivElement, ThemedCardProps>(
  function ThemedCard(
    { variant = "default", weight = "thin", interactive = false, children, ...rest },
    ref,
  ) {
    const { tokens } = useTheme();
    const isDarkTheme = tokens.colorMode === "dark";

    const surfaceBg = variant === "sunken" ? "surface.sunken" : "surface.raised";
    const baseShadow =
      variant === "sunken"
        ? "none"
        : variant === "raised"
          ? tokens.shadows.cardHover
          : tokens.shadows.card;

    const interactiveProps = interactive
      ? {
          cursor: "pointer",
          transition: tokens.motion.transitionBase,
          _hover: {
            bg: "surface.raisedHover",
            borderColor: "border.default",
            transform: tokens.motion.hover.transform,
            boxShadow: tokens.motion.hover.shadowOverride ?? tokens.shadows.cardHover,
          },
          _active: {
            transform: tokens.motion.press.transform,
            boxShadow: tokens.motion.press.shadowOverride ?? baseShadow,
          },
          _focusVisible: {
            boxShadow: tokens.shadows.focus,
            outline: "none",
          },
        }
      : {};

    return (
      <Box
        ref={ref}
        bg={surfaceBg}
        border={tokens.borders[weight]}
        borderColor={
          isDarkTheme && variant !== "raised" ? "border.subtle" : "border.default"
        }
        borderRadius={tokens.radii.card}
        boxShadow={baseShadow}
        p={3}
        {...interactiveProps}
        {...rest}
      >
        {children}
      </Box>
    );
  },
);
