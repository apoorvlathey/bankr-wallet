import type { ThemeTokens } from "../tokens";

export function buildDivider(t: ThemeTokens) {
  const isDarkTheme = t.colorMode === "dark";
  return {
    baseStyle: {
      borderColor: isDarkTheme ? "border.subtle" : "border.default",
      borderWidth: isDarkTheme
        ? "1px"
        : t.decorators?.dividerStyle === "solid-thin"
          ? "1px"
          : "2px",
    },
  };
}

export function buildCode(t: ThemeTokens) {
  return {
    baseStyle: {
      bg: t.colorMode === "dark" ? "surface.sunken" : "surface.raised",
      color: "fg.primary",
      fontFamily: "mono",
      borderRadius: t.radii.input,
      border: t.borders.hairline,
      borderColor: t.colorMode === "dark" ? "border.subtle" : "border.default",
    },
  };
}

export function buildHeading(t: ThemeTokens) {
  return {
    baseStyle: {
      color: "fg.primary",
      fontWeight: t.headingStyle.weight,
      textTransform: t.headingStyle.transform,
      letterSpacing: t.headingStyle.tracking,
      lineHeight: t.headingStyle.lineHeight,
    },
  };
}
