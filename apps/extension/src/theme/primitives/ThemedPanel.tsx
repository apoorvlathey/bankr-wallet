/**
 * ThemedPanel — larger sibling of ThemedCard.
 *
 * Same API as ThemedCard but with bigger default padding, intended for the
 * "section container" pattern: gas estimate panel, asset changes panel,
 * settings sub-page wrappers. The visual treatment otherwise matches
 * ThemedCard so the two compose cleanly.
 *
 * Use ThemedPanel for sections that own multiple rows / sub-cards.
 * Use ThemedCard for the rows / sub-cards themselves.
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
            transform: tokens.motion.hover.transform,
            boxShadow: tokens.motion.hover.shadowOverride ?? tokens.shadows.cardHover,
          },
          _active: {
            transform: tokens.motion.press.transform,
            boxShadow: tokens.motion.press.shadowOverride ?? baseShadow,
          },
        }
      : {};

    return (
      <Box
        ref={ref}
        bg={surfaceBg}
        border={tokens.borders[weight]}
        borderColor="border.default"
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
