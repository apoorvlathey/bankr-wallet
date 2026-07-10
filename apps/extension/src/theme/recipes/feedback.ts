import type { ThemeTokens } from "../tokens";

export function buildBadge(t: ThemeTokens) {
  return {
    baseStyle: {
      borderRadius: t.radii.badge,
      fontWeight: t.colorMode === "dark" ? 600 : 700,
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

export function buildAlert(t: ThemeTokens) {
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
            borderRadius: t.radii.input,
          },
          icon: {
            color: statusToken.fg,
          },
          title: {
            color: statusToken.fg,
            fontWeight: t.colorMode === "dark" ? 600 : 700,
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

export function buildSpinner() {
  return {
    baseStyle: {
      color: "accent.primary",
    },
  };
}
