import type { ThemeTokens } from "../tokens";

export function buildSwitch(t: ThemeTokens) {
  // Keep the historic Bauhaus recipe byte-for-byte equivalent. Midnight owns
  // the quieter neutral states below; changing this branch would turn the
  // intentionally graphic alternate theme into a dark-theme compromise.
  if (t.colorMode !== "dark") {
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

  return {
    baseStyle: {
      container: {
        minH: "24px",
        alignItems: "center",
      },
      track: {
        bg: "surface.raisedHover",
        border: t.borders.thin,
        borderColor: "border.default",
        transition: t.motion.transitionBase,
        _hover: {
          bg: "surface.raisedHover",
          borderColor: "border.strong",
        },
        _focusVisible: {
          borderColor: "border.focus",
          boxShadow: t.shadows.focus,
        },
        _checked: {
          bg: "accent.primary",
          borderColor: "accent.primary",
          _hover: {
            bg: "accent.primary",
            borderColor: "accent.primary",
          },
        },
        _disabled: {
          bg: "surface.sunken",
          borderColor: "border.subtle",
          cursor: "not-allowed",
          opacity: 0.5,
          _hover: {
            bg: "surface.sunken",
            borderColor: "border.subtle",
          },
          _checked: {
            bg: "accent.primary",
            borderColor: "accent.primary",
          },
        },
      },
      thumb: {
        bg: "fg.primary",
        border: t.borders.hairline,
        borderColor: "border.subtle",
        _checked: {
          bg: "accentFg.primary",
        },
        _disabled: {
          bg: "fg.muted",
          borderColor: "border.subtle",
        },
      },
      label: {
        color: "fg.primary",
        _disabled: {
          color: "fg.muted",
          cursor: "not-allowed",
        },
      },
    },
  };
}

export function buildRadio(t: ThemeTokens) {
  // Force the radio control to read on stark light backgrounds (Bauhaus) by
  // giving it a thick `border.default` outline + matching dot color. Without
  // this, Chakra's default thin gray ring disappears against WHITE cards.
  if (t.colorMode !== "dark") {
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

  return {
    baseStyle: {
      container: {
        minH: "24px",
        alignItems: "center",
      },
      control: {
        bg: "surface.raised",
        border: t.borders.thin,
        borderColor: "border.default",
        minW: "24px",
        minH: "24px",
        transition: t.motion.transitionBase,
        _hover: {
          bg: "surface.raisedHover",
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
        },
        _disabled: {
          bg: "surface.sunken",
          borderColor: "border.subtle",
          cursor: "not-allowed",
          opacity: 0.5,
          _hover: {
            bg: "surface.sunken",
            borderColor: "border.subtle",
          },
          _checked: {
            bg: "accent.primary",
            borderColor: "accent.primary",
          },
        },
      },
      label: {
        color: "fg.primary",
        _disabled: {
          color: "fg.muted",
          cursor: "not-allowed",
        },
      },
    },
  };
}

export function buildSlider(t: ThemeTokens) {
  // Track and thumb borderRadius come from `radii.button` so Bauhaus paints
  // both as squares (button radius = 0) while Midnight paints them as soft
  // pills (button radius ≈ pill for the track and rounded for the thumb).
  if (t.colorMode !== "dark") {
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

  return {
    baseStyle: {
      container: {
        _disabled: {
          cursor: "not-allowed",
          opacity: 0.5,
        },
      },
      track: {
        bg: "surface.raisedHover",
        border: t.borders.hairline,
        borderColor: "border.subtle",
        borderRadius: t.radii.button,
        _disabled: {
          bg: "surface.sunken",
          borderColor: "border.subtle",
        },
      },
      filledTrack: {
        bg: "accent.primary",
        borderRadius: t.radii.button,
        _disabled: {
          bg: "accent.primary",
        },
      },
      thumb: {
        bg: "fg.primary",
        border: t.borders.hairline,
        borderColor: "accent.primary",
        borderRadius: t.radii.button,
        minW: "24px",
        minH: "24px",
        boxShadow: "none",
        transition: t.motion.transitionBase,
        _focusVisible: {
          borderColor: "border.focus",
          boxShadow: t.shadows.focus,
        },
        _disabled: {
          bg: "fg.muted",
          borderColor: "border.default",
          boxShadow: "none",
        },
      },
      mark: {
        color: "fg.secondary",
        _disabled: {
          color: "fg.muted",
        },
      },
    },
  };
}

export function buildTabs(t: ThemeTokens) {
  // Chakra's stock tabs are part of the established Bauhaus rendering. An
  // empty override preserves those defaults while Midnight gets a semantic
  // recipe that does not depend on Chakra's gray/blue color scales.
  if (t.colorMode !== "dark") return {};

  const tabBase = {
    minH: "44px",
    px: 3,
    color: "fg.secondary",
    fontWeight: 600,
    transition: t.motion.transitionBase,
    _hover: {
      bg: "surface.raisedHover",
      color: "fg.primary",
    },
    _active: {
      bg: "surface.sunken",
    },
    _focusVisible: {
      zIndex: 1,
      borderColor: "border.focus",
      boxShadow: t.shadows.focus,
    },
    _selected: {
      color: "accent.secondary",
    },
    _disabled: {
      bg: "transparent",
      color: "fg.muted",
      cursor: "not-allowed",
      opacity: 0.5,
      _hover: {
        bg: "transparent",
        color: "fg.muted",
      },
      _active: {
        bg: "transparent",
      },
    },
  };

  return {
    baseStyle: {
      tab: tabBase,
      tabpanel: {
        color: "fg.primary",
      },
    },
    variants: {
      line: {
        tablist: {
          borderBottomWidth: "1px",
          borderColor: "border.subtle",
        },
        tab: {
          borderBottomWidth: "1px",
          borderColor: "transparent",
          mb: "-1px",
          _selected: {
            color: "accent.secondary",
            borderColor: "accent.primary",
          },
        },
      },
      enclosed: {
        tablist: {
          borderBottomWidth: "1px",
          borderColor: "border.subtle",
        },
        tab: {
          border: t.borders.hairline,
          borderColor: "transparent",
          borderTopRadius: t.radii.button,
          mb: "-1px",
          _selected: {
            bg: "surface.raised",
            color: "accent.secondary",
            borderColor: "border.default",
            borderBottomColor: "surface.raised",
          },
        },
      },
      "enclosed-colored": {
        tablist: {
          borderBottomWidth: "1px",
          borderColor: "border.subtle",
        },
        tab: {
          bg: "surface.sunken",
          border: t.borders.hairline,
          borderColor: "border.subtle",
          mb: "-1px",
          _selected: {
            bg: "surface.raised",
            color: "accent.secondary",
            borderColor: "border.default",
            borderTopColor: "accent.primary",
            borderBottomColor: "surface.raised",
          },
        },
      },
      "soft-rounded": {
        tab: {
          borderRadius: t.radii.pill,
          _selected: {
            bg: "surface.accentTint",
            color: "accent.secondary",
          },
        },
      },
      "solid-rounded": {
        tab: {
          borderRadius: t.radii.pill,
          _selected: {
            bg: "accent.primary",
            color: "accentFg.primary",
          },
        },
      },
      unstyled: {
        tab: tabBase,
      },
    },
    defaultProps: {
      variant: "line",
    },
  };
}
