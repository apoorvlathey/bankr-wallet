import type { ThemeTokens } from "../tokens";

function buildMidnightField(t: ThemeTokens) {
  return {
    bg: "surface.sunken",
    border: t.borders.thin,
    borderColor: "border.default",
    borderRadius: t.radii.input,
    color: "fg.primary",
    fontSize: "16px",
    minH: "44px",
    _placeholder: {
      color: "fg.muted",
    },
    _hover: {
      bg: "surface.sunken",
      borderColor: "border.strong",
    },
    _focus: {
      bg: "surface.sunken",
      borderColor: "border.focus",
      boxShadow: "none",
    },
    _focusVisible: {
      bg: "surface.sunken",
      borderColor: "border.focus",
      boxShadow: t.shadows.focus,
    },
    _invalid: {
      borderColor: "status.error.border",
      boxShadow: t.shadows.errorFocus,
      _focus: {
        borderColor: "status.error.border",
        boxShadow: t.shadows.errorFocus,
      },
      _focusVisible: {
        borderColor: "status.error.border",
        boxShadow: t.shadows.errorFocus,
      },
    },
    _disabled: {
      bg: "surface.sunken",
      borderColor: "border.subtle",
      color: "fg.muted",
      cursor: "not-allowed",
      opacity: 1,
      boxShadow: "none",
      _hover: {
        borderColor: "border.subtle",
      },
    },
    _readOnly: {
      bg: "surface.sunken",
      borderColor: "border.subtle",
      color: "fg.secondary",
      cursor: "default",
      _hover: {
        borderColor: "border.subtle",
      },
    },
  };
}

function buildBauhausField(t: ThemeTokens) {
  return {
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
      borderColor: "accent.primary",
      boxShadow: t.shadows.errorFocus,
    },
  };
}

export function buildInput(t: ThemeTokens) {
  const field =
    t.colorMode === "dark" ? buildMidnightField(t) : buildBauhausField(t);

  return {
    variants: {
      filled: { field },
      outline: { field },
    },
    defaultProps: {
      variant: "outline",
    },
  };
}

export function buildTextarea(t: ThemeTokens) {
  // Textarea previously used Chakra's defaults in Bauhaus. Keep that theme
  // unchanged while giving Midnight the same recessed field language as Input.
  if (t.colorMode !== "dark") return {};

  const field = {
    ...buildMidnightField(t),
    minH: "96px",
    py: 2.5,
    resize: "vertical",
  };

  return {
    variants: {
      filled: field,
      outline: field,
    },
    defaultProps: {
      variant: "outline",
    },
  };
}

export function buildSelect(t: ThemeTokens) {
  const isMidnight = t.colorMode === "dark";
  const field = isMidnight
    ? buildMidnightField(t)
    : {
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
      };
  const fieldWithOptions = {
    ...field,
    "> option, > optgroup": {
      bg: "surface.raised",
      color: "fg.primary",
    },
  };
  const variant = {
    field: fieldWithOptions,
    icon: {
      color: isMidnight ? "fg.secondary" : "fg.primary",
      _disabled: {
        color: "fg.muted",
      },
    },
  };

  return {
    variants: {
      filled: variant,
      ...(isMidnight ? { outline: variant } : {}),
    },
    defaultProps: {
      variant: "filled",
    },
  };
}

export function buildCheckbox(t: ThemeTokens) {
  const commitmentVariant = {
    control: {
      _checked: {
        bg: "accent.highlight",
        borderColor: "accent.highlight",
        color: "accentFg.highlight",
        _hover: {
          bg: "accent.highlight",
          borderColor: "accent.highlight",
        },
      },
      _indeterminate: {
        bg: "accent.highlight",
        borderColor: "accent.highlight",
        color: "accentFg.highlight",
      },
    },
  };

  // Preserve Chakra's existing Bauhaus checkbox treatment.
  if (t.colorMode !== "dark") {
    return { variants: { commitment: commitmentVariant } };
  }

  return {
    baseStyle: {
      container: {
        alignItems: "center",
        minH: "44px",
        _disabled: {
          cursor: "not-allowed",
          opacity: 1,
        },
      },
      control: {
        bg: "surface.sunken",
        border: t.borders.thin,
        borderColor: "border.default",
        borderRadius: t.radii.badge,
        color: "accentFg.primary",
        _hover: {
          borderColor: "border.strong",
        },
        _focusVisible: {
          borderColor: "border.focus",
          boxShadow: t.shadows.focus,
        },
        _checked: {
          bg: "accent.primary",
          borderColor: "accent.primary",
          color: "accentFg.primary",
          _hover: {
            bg: "accent.primary",
            borderColor: "accent.primary",
          },
          _disabled: {
            bg: "surface.raised",
            borderColor: "border.subtle",
            color: "fg.muted",
          },
        },
        _indeterminate: {
          bg: "accent.primary",
          borderColor: "accent.primary",
          color: "accentFg.primary",
        },
        _invalid: {
          borderColor: "status.error.border",
          boxShadow: t.shadows.errorFocus,
        },
        _disabled: {
          bg: "surface.sunken",
          borderColor: "border.subtle",
          boxShadow: "none",
          color: "fg.muted",
          opacity: 1,
        },
        _readOnly: {
          bg: "surface.sunken",
          borderColor: "border.subtle",
          color: "fg.secondary",
        },
      },
      label: {
        color: "fg.primary",
        fontSize: "16px",
        lineHeight: "1.5",
        _disabled: {
          color: "fg.muted",
          opacity: 1,
        },
      },
    },
    defaultProps: {
      size: "md",
    },
    variants: {
      commitment: commitmentVariant,
    },
  };
}

export function buildFormLabel(t: ThemeTokens) {
  return {
    baseStyle: {
      color: t.colorMode === "dark" ? "fg.secondary" : "fg.primary",
      fontSize: t.colorMode === "dark" ? "14px" : "sm",
      fontWeight: t.labelStyle.weight,
      textTransform: t.labelStyle.transform,
      letterSpacing: t.labelStyle.tracking,
      ...(t.colorMode === "dark"
        ? {
            lineHeight: "1.45",
            mb: 1.5,
            _disabled: {
              color: "fg.muted",
              opacity: 1,
            },
          }
        : {}),
    },
  };
}

export function buildFormHelperText(t: ThemeTokens) {
  // FormHelperText reads the `Form` multipart recipe's `helperText` slot.
  if (t.colorMode !== "dark") return {};

  return {
    baseStyle: {
      helperText: {
        color: "fg.muted",
        fontSize: "14px",
        lineHeight: "1.45",
        mt: 1.5,
      },
    },
  };
}

export function buildFormError(t: ThemeTokens) {
  if (t.colorMode !== "dark") return {};

  return {
    baseStyle: {
      text: {
        color: "status.error.fg",
        fontSize: "14px",
        fontWeight: 500,
        lineHeight: "1.45",
        mt: 1.5,
      },
      icon: {
        color: "status.error.fg",
        marginEnd: "0.5em",
      },
    },
  };
}
