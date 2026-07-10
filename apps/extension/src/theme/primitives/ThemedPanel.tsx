/**
 * ThemedPanel — larger sibling of ThemedCard.
 *
 * Same API as ThemedCard but with bigger default padding, intended for a
 * section that genuinely needs one enclosing surface. Prefer spacing,
 * headings, and dividers for the content inside it instead of nesting more
 * cards by default.
 *
 * Use ThemedPanel for sections that own multiple related rows. Let inner rows
 * share the panel edge and use separators.
 */

import { forwardRef } from "react";
import { Box, type BoxProps } from "@chakra-ui/react";
import { useTheme } from "../ThemeProvider";
import type { ThemedCardVariant, ThemedCardWeight } from "./ThemedCard";

export interface ThemedPanelProps extends BoxProps {
  variant?: ThemedCardVariant;
  weight?: ThemedCardWeight;
  interactive?: boolean;
}

export const ThemedPanel = forwardRef<HTMLDivElement, ThemedPanelProps>(
  function ThemedPanel(
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
        p={4}
        {...interactiveProps}
        {...rest}
      >
        {children}
      </Box>
    );
  },
);
