/**
 * Public API for the theme engine.
 *
 * Component code should import from `@/theme` rather than reaching into
 * specific files. The factory, individual theme files, and internal hooks
 * are not part of the public surface.
 *
 * See _docs/THEMING_PRD.md for the architecture overview.
 */

export { ThemeProvider, useTheme, themes, themeList } from "./ThemeProvider";
export {
  useThemeSelection,
  loadSelectedThemeId,
  saveSelectedThemeId,
  readBootstrapThemeId,
  SELECTED_THEME_STORAGE_KEY,
  DEFAULT_THEME_ID,
} from "./useThemeSelection";
export { useStripTokens } from "./useStripTokens";
export type { StripTokens, StripVariant } from "./useStripTokens";
export { useChainBadgeStyle, resolveChainBadgeStyle } from "./useChainBadgeStyle";
export type { ChainBadgeStyle } from "./useChainBadgeStyle";
export { useIconChipBg } from "./useIconChipBg";

// Phase 2 primitives — see _docs/THEMING_PRD.md
export {
  ThemedCard,
  ThemedPanel,
  ThemedField,
  IconBox,
  Decorator,
} from "./primitives";
export type {
  ThemedCardProps,
  ThemedCardVariant,
  ThemedCardWeight,
  ThemedPanelProps,
  ThemedFieldProps,
  IconBoxProps,
  DecoratorProps,
  DecoratorPosition,
  DecoratorAccent,
} from "./primitives";
export type {
  ThemeId,
  ThemeTokens,
  ThemeColors,
  SurfaceColors,
  ForegroundColors,
  BorderColors,
  AccentColors,
  AccentForegrounds,
  StatusColors,
  StatusColor,
  ChartColors,
  ThemeFonts,
  HeadingStyle,
  LabelStyle,
  ThemeRadii,
  ThemeBorders,
  ThemeShadows,
  ThemeMotion,
  MotionStyle,
  ThemeDecorators,
  ThemePreview,
} from "./tokens";
