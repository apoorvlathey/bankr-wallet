/**
 * Decorator — theme-aware corner ornament.
 *
 * Bauhaus puts a small accented square / dot / triangle in one corner of
 * many cards as a constructivist flourish (e.g. the yellow square on the
 * "Confirm Swap" header). Other themes (Midnight) opt out entirely.
 *
 * This primitive renders nothing when the active theme has no
 * `decorators.cardCorner` (or sets it to `"none"`), so a parent component
 * can drop `<Decorator />` into any card and trust the theme to decide
 * whether the ornament appears.
 *
 * Parent must be `position="relative"` for absolute positioning to work.
 */

import { Box, type BoxProps } from "@chakra-ui/react";
import { useTheme } from "../ThemeProvider";

export type DecoratorPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type DecoratorAccent = "primary" | "secondary" | "highlight";

export interface DecoratorProps extends Omit<BoxProps, "position"> {
  /** Which corner of the parent to anchor to */
  corner?: DecoratorPosition;
  /** Which accent color to fill with (resolved against the active theme) */
  accent?: DecoratorAccent;
  /** Square edge length (e.g. "8px"); for triangles, this is the side length */
  size?: string;
}

const POSITION_OFFSETS: Record<DecoratorPosition, BoxProps> = {
  "top-left": { top: "-3px", left: "-3px" },
  "top-right": { top: "-3px", right: "-3px" },
  "bottom-left": { bottom: "-3px", left: "-3px" },
  "bottom-right": { bottom: "-3px", right: "-3px" },
};

export function Decorator({
  corner = "top-right",
  accent = "highlight",
  size = "8px",
  ...rest
}: DecoratorProps) {
  const { tokens } = useTheme();
  const style = tokens.decorators?.cardCorner;

  // Themes without a corner ornament render nothing.
  if (!style || style === "none") return null;

  const offsets = POSITION_OFFSETS[corner];
  const accentToken = `accent.${accent}`;

  if (style === "triangle") {
    return (
      <Box
        position="absolute"
        {...offsets}
        w={0}
        h={0}
        borderLeft={`${size} solid transparent`}
        borderRight={`${size} solid transparent`}
        borderBottom={`${size} solid`}
        borderBottomColor={accentToken}
        {...rest}
      />
    );
  }

  // "dot" => circle, "square" => square. Both share the same border treatment.
  return (
    <Box
      position="absolute"
      {...offsets}
      w={size}
      h={size}
      bg={accentToken}
      border={tokens.borders.hairline}
      borderColor="border.default"
      borderRadius={style === "dot" ? "full" : "0"}
      {...rest}
    />
  );
}
