/**
 * IconBox — small bordered+shadowed square holding an icon.
 *
 * Replaces the ~30 occurrences of `<Box boxSize="32px" bg="..." border="2px
 * solid bauhaus.black" boxShadow="2px 2px 0px 0px #121212" display="flex"
 * alignItems="center" justifyContent="center">` scattered through toast
 * components, feature cards, and confirmation headers.
 *
 * Defaults to a `surface.raised` background; pass any Chakra color token
 * via `bg` to colorize (commonly `accent.highlight`, `accent.primary`,
 * `status.success.bg`, etc.).
 *
 * The shadow scales with the active theme's `shadows.card` so a Bauhaus
 * IconBox renders with a hard offset and a Midnight one renders with a soft
 * glow — no per-component change required.
 */

import { forwardRef } from "react";
import { Box, type BoxProps } from "@chakra-ui/react";
import { useTheme } from "../ThemeProvider";

export interface IconBoxProps extends BoxProps {
  /** Square dimension (Chakra size token or raw CSS, e.g. "32px") */
  size?: BoxProps["boxSize"];
  /** Suppress the drop shadow — useful for nested icon containers */
  noShadow?: boolean;
}

export const IconBox = forwardRef<HTMLDivElement, IconBoxProps>(
  function IconBox(
    { size = "32px", noShadow = false, bg = "surface.raised", children, ...rest },
    ref,
  ) {
    const { tokens } = useTheme();

    return (
      <Box
        ref={ref}
        boxSize={size}
        bg={bg}
        border={tokens.borders.thin}
        borderColor="border.default"
        borderRadius={tokens.radii.badge}
        boxShadow={noShadow ? "none" : tokens.shadows.card}
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
        {...rest}
      >
        {children}
      </Box>
    );
  },
);
