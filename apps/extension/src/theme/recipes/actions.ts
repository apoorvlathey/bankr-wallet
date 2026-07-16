import type { ThemeTokens } from "../tokens";

export function buildButton(t: ThemeTokens) {
  if (t.id !== "midnight") return buildBauhausButton(t);

  const pressActive = {
    transform: t.motion.press.transform,
    boxShadow: "none",
  };
  const disabled = {
    opacity: 0.5,
    cursor: "not-allowed",
    transform: "none",
    boxShadow: "none",
  };

  return {
    baseStyle: {
      minH: "44px",
      fontWeight: 600,
      borderRadius: t.radii.button,
      textTransform: t.labelStyle.transform,
      letterSpacing: t.labelStyle.tracking,
      transition: t.motion.transitionBase,
      _focusVisible: {
        outline: "none",
        boxShadow: t.shadows.focus,
      },
      _disabled: disabled,
    },
    variants: {
      // The only filled action color in Midnight.
      primary: {
        bg: "accent.primary",
        color: "accentFg.primary",
        border: "1px solid transparent",
        boxShadow: "none",
        _hover: {
          bg: "accent.primary",
          opacity: 0.9,
          _disabled: {
            bg: "accent.primary",
            color: "accentFg.primary",
            ...disabled,
          },
        },
        _active: pressActive,
        _disabled: {
          bg: "accent.primary",
          color: "accentFg.primary",
          ...disabled,
        },
      },
      // Neutral tonal action, subordinate to primary.
      secondary: {
        bg: "surface.raisedHover",
        color: "fg.primary",
        border: "1px solid transparent",
        boxShadow: "none",
        _hover: {
          bg: "surface.raised",
          _disabled: {
            bg: "surface.raisedHover",
            color: "fg.muted",
            ...disabled,
          },
        },
        _active: pressActive,
        _disabled: {
          bg: "surface.raisedHover",
          color: "fg.muted",
          ...disabled,
        },
      },
      ghost: {
        color: "fg.primary",
        bg: "transparent",
        border: "1px solid transparent",
        boxShadow: "none",
        _hover: {
          bg: "bg.muted",
          _disabled: {
            bg: "transparent",
            color: "fg.muted",
            ...disabled,
          },
        },
        _active: pressActive,
        _disabled: {
          bg: "transparent",
          color: "fg.muted",
          ...disabled,
        },
      },
      outline: {
        bg: "transparent",
        border: t.borders.thin,
        borderColor: "border.default",
        color: "fg.primary",
        boxShadow: "none",
        _hover: {
          bg: "bg.muted",
          _disabled: {
            bg: "transparent",
            borderColor: "border.subtle",
            color: "fg.muted",
            ...disabled,
          },
        },
        _active: pressActive,
        _disabled: {
          bg: "transparent",
          borderColor: "border.subtle",
          color: "fg.muted",
          ...disabled,
        },
      },
      // Legacy primary-action alias. Existing confirmation surfaces use the
      // historical Bauhaus "highlight" button for Confirm/Send/Save. Midnight
      // maps that action rank to the same blue fill as `primary`; amber remains
      // available through accent/status tokens for non-action emphasis.
      highlight: {
        bg: "accent.primary",
        color: "accentFg.primary",
        border: "1px solid transparent",
        boxShadow: "none",
        _hover: {
          bg: "accent.primary",
          opacity: 0.9,
          _disabled: {
            bg: "accent.primary",
            color: "accentFg.primary",
            ...disabled,
          },
        },
        _active: pressActive,
        _disabled: {
          bg: "accent.primary",
          color: "accentFg.primary",
          ...disabled,
        },
      },
      // Warm Midnight commitment action. Amber marks product-entry, mascot-led
      // brand moments, explicit saved-state commitments, and final decisions.
      brand: {
        bg: "accent.highlight",
        color: "accentFg.highlight",
        border: "1px solid transparent",
        boxShadow: "none",
        _hover: {
          bg: "accent.highlight",
          opacity: 0.9,
          _disabled: {
            bg: "accent.highlight",
            color: "accentFg.highlight",
            ...disabled,
          },
        },
        _active: pressActive,
        _disabled: {
          bg: "accent.highlight",
          color: "accentFg.highlight",
          ...disabled,
        },
      },
      // Destructive actions stay quiet until a dedicated confirmation surface.
      danger: {
        bg: "transparent",
        color: "status.error.emphasis",
        border: t.borders.thin,
        borderColor: "status.error.border",
        boxShadow: "none",
        _hover: {
          bg: "status.error.bg",
          color: "status.error.fg",
          _disabled: {
            bg: "transparent",
            borderColor: "border.subtle",
            color: "fg.muted",
            ...disabled,
          },
        },
        _active: {
          ...pressActive,
          bg: "status.error.bg",
          color: "status.error.fg",
        },
        _disabled: {
          bg: "transparent",
          borderColor: "border.subtle",
          color: "fg.muted",
          ...disabled,
        },
      },
      link: {
        minH: "auto",
        h: "auto",
        p: 0,
        bg: "transparent",
        color: "accent.secondary",
        border: "none",
        boxShadow: "none",
        textDecoration: "none",
        _hover: {
          color: "accent.secondary",
          textDecoration: "underline",
          _disabled: {
            color: "fg.muted",
            textDecoration: "none",
            ...disabled,
          },
        },
        _active: {
          transform: "none",
          boxShadow: "none",
        },
        _disabled: {
          color: "fg.muted",
          textDecoration: "none",
          ...disabled,
        },
      },
    },
    sizes: {
      xs: { minH: "32px", h: "32px", px: 3, fontSize: "xs" },
      sm: { minH: "40px", h: "40px", px: 4, fontSize: "sm" },
      md: { minH: "44px", h: "44px", px: 5, fontSize: "sm" },
      lg: { minH: "48px", h: "48px", px: 6, fontSize: "md" },
      xl: { minH: "52px", h: "52px", px: 7, fontSize: "lg" },
    },
    defaultProps: {
      variant: "secondary",
      size: "md",
    },
  };
}

/**
 * Explicit icon-only control recipe. Register as `IconButton` beside Button
 * in `createTheme.ts`; it reuses the same hierarchy and focus treatment while
 * keeping every size square.
 */
export function buildIconButton(t: ThemeTokens) {
  const button = buildButton(t);

  if (t.id !== "midnight") {
    return {
      baseStyle: {
        ...button.baseStyle,
        p: 0,
      },
      variants: button.variants,
      defaultProps: button.defaultProps,
    };
  }

  return {
    baseStyle: {
      ...button.baseStyle,
      p: 0,
      flexShrink: 0,
    },
    variants: button.variants,
    sizes: {
      xs: { minW: "32px", w: "32px", h: "32px", p: 0, fontSize: "xs" },
      sm: { minW: "40px", w: "40px", h: "40px", p: 0, fontSize: "sm" },
      md: { minW: "44px", w: "44px", h: "44px", p: 0, fontSize: "md" },
      lg: { minW: "48px", w: "48px", h: "48px", p: 0, fontSize: "lg" },
      xl: { minW: "52px", w: "52px", h: "52px", p: 0, fontSize: "xl" },
    },
    defaultProps: {
      variant: "ghost",
      size: "md",
    },
  };
}

function buildBauhausButton(t: ThemeTokens) {
  const pressActive = {
    transform: t.motion.press.transform,
    ...(t.motion.press.shadowOverride !== null
      ? { boxShadow: t.motion.press.shadowOverride }
      : {}),
  };

  return {
    baseStyle: {
      fontWeight: 700,
      borderRadius: t.radii.button,
      textTransform: t.labelStyle.transform,
      letterSpacing: t.labelStyle.tracking,
      transition: t.motion.transitionBase,
      _focusVisible: {
        outline: "none",
        boxShadow: t.shadows.focus,
      },
    },
    variants: {
      // Primary CTA — accent.primary background
      primary: {
        bg: "accent.primary",
        color: "accentFg.primary",
        border: t.borders.thin,
        borderColor: "border.default",
        boxShadow: t.shadows.button,
        _hover: {
          bg: "accent.primary",
          opacity: 0.9,
          _disabled: {
            bg: "accent.primary",
            opacity: 0.6,
          },
        },
        _active: pressActive,
      },
      // Default safe button — surface.raised background
      secondary: {
        bg: "surface.raised",
        color: "fg.primary",
        border: t.borders.thin,
        borderColor: "border.default",
        boxShadow: t.shadows.button,
        _hover: {
          bg: "surface.raisedHover",
        },
        _active: pressActive,
      },
      ghost: {
        color: "fg.primary",
        border: "none",
        _hover: {
          bg: "bg.muted",
        },
      },
      outline: {
        bg: "transparent",
        border: t.borders.thin,
        borderColor: "border.default",
        color: "fg.primary",
        _hover: {
          bg: "bg.muted",
        },
        _active: {
          transform: t.motion.press.transform,
        },
      },
      // Highlight (renamed from "yellow") — accent.highlight background
      highlight: {
        bg: "accent.highlight",
        color: "accentFg.highlight",
        border: t.borders.thin,
        borderColor: "border.default",
        boxShadow: t.shadows.button,
        _hover: {
          bg: "accent.highlight",
          opacity: 0.9,
          // Chakra's default `_disabled` drops opacity to 0.4; combined with
          // our amber bg + dark text in Midnight, the whole button (including
          // its label) collapses into the background and reads as an empty
          // void. Pin the disabled bg + color explicitly and use a softer
          // opacity so the button stays legible while still clearly showing
          // it's not actionable.
          _disabled: {
            bg: "accent.highlight",
            color: "accentFg.highlight",
            opacity: 0.65,
          },
        },
        _disabled: {
          bg: "accent.highlight",
          color: "accentFg.highlight",
          opacity: 0.65,
        },
        _active: pressActive,
      },
      // Brand entry action — visually matches Bauhaus yellow while giving
      // Midnight a deliberate amber exception to its blue action family.
      brand: {
        bg: "accent.highlight",
        color: "accentFg.highlight",
        border: t.borders.thin,
        borderColor: "border.default",
        boxShadow: t.shadows.button,
        _hover: {
          bg: "accent.highlight",
          opacity: 0.9,
          _disabled: {
            bg: "accent.highlight",
            color: "accentFg.highlight",
            opacity: 0.65,
          },
        },
        _disabled: {
          bg: "accent.highlight",
          color: "accentFg.highlight",
          opacity: 0.65,
        },
        _active: pressActive,
      },
      // Danger — destructive actions, status.error palette
      danger: {
        bg: "status.error.bg",
        color: "status.error.fg",
        border: t.borders.thin,
        borderColor: "border.default",
        boxShadow: t.shadows.button,
        _hover: {
          bg: "status.error.bg",
          opacity: 0.9,
        },
        _active: pressActive,
      },
    },
    defaultProps: {
      variant: "secondary",
    },
  };
}
