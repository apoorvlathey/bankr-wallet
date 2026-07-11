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
import { buildButton, buildIconButton } from "./recipes/actions";
import {
  buildInput,
  buildTextarea,
  buildSelect,
  buildCheckbox,
  buildFormLabel,
  buildFormHelperText,
  buildFormError,
} from "./recipes/fields";
import {
  buildSwitch,
  buildRadio,
  buildSlider,
  buildTabs,
} from "./recipes/selection";
import { buildBadge, buildAlert, buildSpinner } from "./recipes/feedback";
import { buildDivider, buildCode, buildHeading } from "./recipes/content";
import {
  buildModal,
  buildDrawer,
  buildMenu,
  buildPopover,
  buildTooltip,
} from "./recipes/overlays";

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
        "*": {
          scrollbarWidth: "none",
        },
        "*::-webkit-scrollbar": {
          display: "none",
        },
        body: {
          bg: "surface.base",
          color: "fg.primary",
        },
      },
    },
    components: {
      Button: buildButton(tokens),
      IconButton: buildIconButton(tokens),
      Input: buildInput(tokens),
      Textarea: buildTextarea(tokens),
      Select: buildSelect(tokens),
      Checkbox: buildCheckbox(tokens),
      Badge: buildBadge(tokens),
      Alert: buildAlert(tokens),
      Divider: buildDivider(tokens),
      Code: buildCode(tokens),
      Heading: buildHeading(tokens),
      FormLabel: buildFormLabel(tokens),
      Form: buildFormHelperText(tokens),
      FormError: buildFormError(tokens),
      Switch: buildSwitch(tokens),
      Radio: buildRadio(tokens),
      Spinner: buildSpinner(),
      Modal: buildModal(tokens),
      Drawer: buildDrawer(tokens),
      Menu: buildMenu(tokens),
      Popover: buildPopover(tokens),
      Slider: buildSlider(tokens),
      Tabs: buildTabs(tokens),
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
    errorFocus: t.shadows.errorFocus,
    button: t.shadows.button,
  };
}
