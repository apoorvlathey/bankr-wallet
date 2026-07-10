import type { ThemeTokens } from "../tokens";

export function buildModal(t: ThemeTokens) {
  return {
    baseStyle: {
      overlay: {
        bg: "surface.overlay",
      },
      dialog: {
        bg: "surface.raised",
        border: t.colorMode === "dark" ? t.borders.medium : t.borders.thick,
        borderColor: "border.default",
        borderRadius: t.radii.modal,
        boxShadow: t.shadows.modal,
      },
      header: {
        fontWeight: t.colorMode === "dark" ? 600 : 700,
        textTransform: t.labelStyle.transform,
        letterSpacing: t.labelStyle.tracking,
      },
      closeButton: {
        borderRadius: t.radii.button,
        _focusVisible: {
          boxShadow: t.shadows.focus,
          outline: "none",
        },
      },
    },
  };
}

export function buildDrawer(t: ThemeTokens) {
  return {
    baseStyle: {
      overlay: {
        bg: "surface.overlay",
      },
      dialog: {
        bg: "surface.raised",
        color: "fg.primary",
        borderColor: "border.default",
        boxShadow: t.shadows.modal,
      },
      header: {
        borderColor: "border.subtle",
        fontWeight: t.colorMode === "dark" ? 600 : 700,
        textTransform: t.labelStyle.transform,
        letterSpacing: t.labelStyle.tracking,
      },
      footer: {
        borderColor: "border.subtle",
      },
      closeButton: {
        borderRadius: t.radii.button,
        _focusVisible: {
          boxShadow: t.shadows.focus,
          outline: "none",
        },
      },
    },
  };
}

export function buildMenu(t: ThemeTokens) {
  // Bauhaus signature hover is the yellow bar; Midnight uses a quieter
  // raised-hover surface because amber + light text is unreadable.
  const isDarkTheme = t.colorMode === "dark";
  const hoverBg = isDarkTheme ? "surface.raisedHover" : "accent.highlight";
  const hoverColor = isDarkTheme ? "fg.primary" : "accentFg.highlight";

  return {
    baseStyle: {
      list: {
        bg: "surface.raised",
        border: t.borders.thin,
        borderColor: "border.default",
        borderRadius: t.radii.card,
        boxShadow: isDarkTheme ? t.shadows.cardHover : t.shadows.card,
        py: isDarkTheme ? 1 : undefined,
      },
      item: {
        bg: "surface.raised",
        color: "fg.primary",
        borderRadius: isDarkTheme ? t.radii.badge : undefined,
        mx: isDarkTheme ? 1 : undefined,
        fontWeight: isDarkTheme ? 500 : undefined,
        _hover: {
          bg: hoverBg,
          color: hoverColor,
        },
        _focus: {
          bg: hoverBg,
          color: hoverColor,
        },
        _active: {
          bg: hoverBg,
          color: hoverColor,
        },
        _disabled: {
          color: "fg.muted",
          opacity: 0.55,
          cursor: "not-allowed",
        },
        "&[aria-current=page], &[aria-checked=true]": {
          bg: isDarkTheme ? "surface.raisedHover" : "accent.highlight",
          color: isDarkTheme ? "accent.secondary" : "accentFg.highlight",
        },
      },
    },
  };
}

export function buildPopover(t: ThemeTokens) {
  return {
    baseStyle: {
      content: {
        bg: "surface.raised",
        border: t.borders.thin,
        borderColor: "border.default",
        borderRadius: t.radii.card,
        boxShadow: t.colorMode === "dark" ? t.shadows.cardHover : t.shadows.card,
        _focus: {
          boxShadow: t.colorMode === "dark" ? t.shadows.cardHover : t.shadows.card,
          outline: "none",
        },
        _focusVisible: {
          boxShadow: t.shadows.focus,
          outline: "none",
        },
      },
      header: {
        borderColor: "border.subtle",
        fontWeight: t.colorMode === "dark" ? 600 : 700,
      },
      footer: {
        borderColor: "border.subtle",
      },
    },
  };
}

export function buildTooltip(t: ThemeTokens) {
  return {
    baseStyle: {
      bg: t.colorMode === "dark" ? "surface.raisedHover" : "fg.primary",
      color: t.colorMode === "dark" ? "fg.primary" : "surface.raised",
      border: t.colorMode === "dark" ? t.borders.hairline : "none",
      borderColor: "border.default",
      borderRadius: t.radii.badge,
      fontWeight: 500,
      boxShadow: t.colorMode === "dark" ? t.shadows.cardHover : "none",
    },
  };
}
