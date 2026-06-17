/**
 * Theme factory — converts a `ThemeTokens` object into a Chakra `extendTheme`
 * configuration.
 *
 * The factory's job is to:
 *   1. Translate intent tokens (`accent.primary`, `surface.raised`, etc.) into
 *      Chakra's `colors` map.
 *   2. Re-emit legacy aliases (`bauhaus.*`, `bg.*`, `text.*`, etc.) so existing
 *      component code keeps rendering correctly during the migration.
 *   3. Build component variants (Button, Input, Modal, Menu, etc.) that read
 *      from tokens — same shape as the original `theme.ts` but parameterized.
 *   4. Apply optional `componentOverrides` from the theme as a final escape
 *      hatch.
 *
 * The output of `createChakraTheme(bauhausTokens)` MUST be functionally
 * equivalent to the original `apps/extension/src/theme.ts` so the Bauhaus
 * theme renders identically post-refactor.
 */

import { extendTheme, type ThemeConfig } from "@chakra-ui/react";
import type { ThemeTokens } from "./tokens";

/**
 * Build a Chakra theme from a `ThemeTokens` object.
 */
export function createChakraTheme(tokens: ThemeTokens) {
  const config: ThemeConfig = {
    initialColorMode: tokens.colorMode,
    useSystemColorMode: false,
  };

  return extendTheme({
    config,
    colors: buildColors(tokens),
    fonts: tokens.fonts,
    radii: buildRadii(tokens),
    shadows: buildShadows(tokens),
    styles: {
      global: {
        body: {
          bg: "surface.base",
          color: "fg.primary",
        },
      },
    },
    components: {
      Button: buildButton(tokens),
      Input: buildInput(tokens),
      Select: buildSelect(tokens),
      Badge: buildBadge(tokens),
      Alert: buildAlert(tokens),
      Divider: buildDivider(tokens),
      Code: buildCode(tokens),
      Heading: buildHeading(tokens),
      FormLabel: buildFormLabel(tokens),
      Switch: buildSwitch(tokens),
      Radio: buildRadio(tokens),
      Spinner: buildSpinner(),
      Modal: buildModal(tokens),
      Menu: buildMenu(tokens),
      Popover: buildPopover(tokens),
      Slider: buildSlider(tokens),
      Tooltip: buildTooltip(tokens),
      ...(tokens.componentOverrides ?? {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────────────────────

function buildColors(t: ThemeTokens) {
  return {
    // Intent tokens (new — preferred for new code)
    surface: t.colors.surface,
    fg: t.colors.fg,
    accent: t.colors.accent,
    accentFg: t.colors.accentFg,
    status: t.colors.status,
    chart: t.colors.chart,

    // Legacy aliases — preserved during migration. The `border` namespace is
    // shared between the legacy block and the intent block; legacy wins for
    // the keys it defines (subtle/default/strong), and the intent token
    // contributes `focus`.
    bauhaus: t.legacy.bauhaus,
    bg: t.legacy.bg,
    text: t.legacy.text,
    primary: t.legacy.primary,
    success: t.legacy.success,
    warning: t.legacy.warning,
    error: t.legacy.error,
    info: t.legacy.info,
    border: {
      ...t.legacy.border,
      focus: t.colors.border.focus,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Radii / shadows
// ─────────────────────────────────────────────────────────────────────────────

function buildRadii(t: ThemeTokens) {
  return {
    none: "0",
    sm: t.radii.badge,
    md: t.radii.button,
    lg: t.radii.card,
    xl: t.radii.modal,
    full: t.radii.pill,
  };
}

function buildShadows(t: ThemeTokens) {
  return {
    card: t.shadows.card,
    cardHover: t.shadows.cardHover,
    modal: t.shadows.modal,
    focus: t.shadows.focus,
    button: t.shadows.button,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component configs — these mirror the original theme.ts structure 1:1 but
// pull values from `tokens` so they swap with the active theme.
// ─────────────────────────────────────────────────────────────────────────────

function buildButton(t: ThemeTokens) {
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

function buildInput(t: ThemeTokens) {
  const fieldBase = {
    bg: "surface.raised",
    border: t.borders.thin,
    borderColor: "border.default",
    borderRadius: t.radii.input,
    color: "fg.primary",
    _placeholder: {
      color: "fg.muted",
    },
    _hover: {
      bg: "surface.raised",
      borderColor: "border.default",
    },
    _focus: {
      bg: "surface.raised",
      borderColor: "border.focus",
      boxShadow: t.shadows.focus,
    },
    _invalid: {
      borderColor: t.colorMode === "dark" ? "status.error.border" : "accent.primary",
      boxShadow:
        t.colorMode === "dark"
          ? t.shadows.focus
          : `3px 3px 0px 0px ${t.colors.accent.primary}`,
    },
  };

  return {
    variants: {
      filled: { field: fieldBase },
      outline: { field: fieldBase },
    },
    defaultProps: {
      variant: "outline",
    },
  };
}

function buildSelect(t: ThemeTokens) {
  return {
    variants: {
      filled: {
        field: {
          bg: "surface.raised",
          border: t.borders.thin,
          borderColor: "border.default",
          borderRadius: t.radii.input,
          color: "fg.primary",
          _hover: {
            bg: "surface.raised",
            borderColor: "border.default",
          },
          _focus: {
            bg: "surface.raised",
            borderColor: "border.focus",
          },
          "> option, > optgroup": {
            bg: "surface.raised",
            color: "fg.primary",
          },
        },
        icon: {
          color: "fg.primary",
        },
      },
    },
    defaultProps: {
      variant: "filled",
    },
  };
}

function buildBadge(t: ThemeTokens) {
  return {
    baseStyle: {
      borderRadius: t.radii.badge,
      fontWeight: 700,
      textTransform: t.labelStyle.transform,
      letterSpacing: t.labelStyle.tracking,
    },
    variants: {
      success: {
        bg: "status.success.bg",
        color: "status.success.fg",
        border: t.borders.thin,
        borderColor: "status.success.border",
      },
      warning: {
        bg: "status.warning.bg",
        color: "status.warning.fg",
        border: t.borders.thin,
        borderColor: "status.warning.border",
      },
      error: {
        bg: "status.error.bg",
        color: "status.error.fg",
        border: t.borders.thin,
        borderColor: "status.error.border",
      },
      info: {
        bg: "status.info.bg",
        color: "status.info.fg",
        border: t.borders.thin,
        borderColor: "status.info.border",
      },
      // Intent variants — preferred
      highlight: {
        bg: "accent.highlight",
        color: "accentFg.highlight",
        border: t.borders.thin,
        borderColor: "border.default",
      },
      danger: {
        bg: "accent.primary",
        color: "accentFg.primary",
        border: t.borders.thin,
        borderColor: "border.default",
      },
      // Color-named legacy aliases — kept so existing usages don't break.
      // Will be removed once all components migrate to intent variants.
      blue: {
        bg: "accent.secondary",
        color: "accentFg.secondary",
        border: t.borders.thin,
        borderColor: "border.default",
      },
      red: {
        bg: "accent.primary",
        color: "accentFg.primary",
        border: t.borders.thin,
        borderColor: "border.default",
      },
      yellow: {
        bg: "accent.highlight",
        color: "accentFg.highlight",
        border: t.borders.thin,
        borderColor: "border.default",
      },
    },
  };
}

function buildAlert(t: ThemeTokens) {
  type AlertStatus = "info" | "warning" | "error" | "success";

  return {
    variants: {
      subtle: (props: { status: string }) => {
        const status = (props.status || "info") as AlertStatus;
        const statusToken = t.colors.status[status] ?? t.colors.status.info;
        return {
          container: {
            bg: statusToken.bg,
            border: t.borders.thin,
            borderColor: statusToken.border,
            borderRadius: t.radii.card,
          },
          icon: {
            color: statusToken.fg,
          },
          title: {
            color: statusToken.fg,
            fontWeight: 700,
          },
          description: {
            color: statusToken.fg,
          },
        };
      },
    },
    defaultProps: {
      variant: "subtle",
    },
  };
}

function buildDivider(t: ThemeTokens) {
  return {
    baseStyle: {
      borderColor: "border.default",
      borderWidth: t.decorators?.dividerStyle === "solid-thin" ? "1px" : "2px",
    },
  };
}

function buildCode(t: ThemeTokens) {
  return {
    baseStyle: {
      bg: "surface.raised",
      color: "fg.primary",
      fontFamily: "mono",
      borderRadius: t.radii.input,
      border: t.borders.hairline,
      borderColor: "border.default",
    },
  };
}

function buildHeading(t: ThemeTokens) {
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

function buildFormLabel(t: ThemeTokens) {
  return {
    baseStyle: {
      color: "fg.primary",
      fontSize: "sm",
      fontWeight: t.labelStyle.weight,
      textTransform: t.labelStyle.transform,
      letterSpacing: t.labelStyle.tracking,
    },
  };
}

function buildSwitch(t: ThemeTokens) {
  return {
    baseStyle: {
      track: {
        bg: "bg.muted",
        border: t.borders.thin,
        borderColor: "border.default",
        _checked: {
          bg: "accent.secondary",
        },
      },
      thumb: {
        bg: "surface.raised",
        border: t.borders.thin,
        borderColor: "border.default",
      },
    },
  };
}

function buildRadio(t: ThemeTokens) {
  // Force the radio control to read on stark light backgrounds (Bauhaus) by
  // giving it a thick `border.default` outline + matching dot color. Without
  // this, Chakra's default thin gray ring disappears against WHITE cards.
  return {
    baseStyle: {
      control: {
        bg: "surface.raised",
        border: t.borders.thin,
        borderColor: "border.default",
        _checked: {
          bg: "surface.raised",
          borderColor: "border.default",
          color: "fg.primary",
          _hover: {
            bg: "surface.raised",
            borderColor: "border.default",
          },
        },
      },
    },
  };
}

function buildSpinner() {
  return {
    baseStyle: {
      color: "accent.secondary",
    },
  };
}

function buildModal(t: ThemeTokens) {
  return {
    baseStyle: {
      dialog: {
        bg: "surface.raised",
        border: t.borders.thick,
        borderColor: "border.default",
        borderRadius: t.radii.modal,
        boxShadow: t.shadows.modal,
      },
      header: {
        fontWeight: 700,
        textTransform: t.labelStyle.transform,
        letterSpacing: t.labelStyle.tracking,
      },
    },
  };
}

function buildMenu(t: ThemeTokens) {
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
        boxShadow: t.shadows.card,
      },
      item: {
        bg: "surface.raised",
        _hover: {
          bg: hoverBg,
          color: hoverColor,
        },
        _focus: {
          bg: hoverBg,
          color: hoverColor,
        },
      },
    },
  };
}

function buildSlider(t: ThemeTokens) {
  // Track and thumb borderRadius come from `radii.button` so Bauhaus paints
  // both as squares (button radius = 0) while Midnight paints them as soft
  // pills (button radius ≈ pill for the track and rounded for the thumb).
  return {
    baseStyle: {
      track: {
        borderRadius: t.radii.button,
      },
      filledTrack: {
        borderRadius: t.radii.button,
      },
      thumb: {
        borderRadius: t.radii.button,
      },
    },
  };
}

function buildPopover(t: ThemeTokens) {
  return {
    baseStyle: {
      content: {
        bg: "surface.raised",
        border: t.borders.thin,
        borderColor: "border.default",
        borderRadius: t.radii.card,
        boxShadow: t.shadows.card,
        _focus: {
          boxShadow: t.shadows.card,
          outline: "none",
        },
        _focusVisible: {
          boxShadow: t.shadows.card,
        },
      },
      header: {
        borderColor: "border.default",
        fontWeight: 700,
      },
      footer: {
        borderColor: "border.default",
      },
    },
  };
}

function buildTooltip(t: ThemeTokens) {
  return {
    baseStyle: {
      bg: "fg.primary",
      color: "surface.raised",
      borderRadius: t.radii.badge,
      fontWeight: 500,
    },
  };
}
