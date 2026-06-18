/**
 * ThemeProvider — wraps the app in a theme-aware ChakraProvider.
 *
 * Responsibilities:
 *   1. Resolve the active `ThemeId` (from bootstrap attribute, then storage)
 *   2. Build the corresponding Chakra theme via `createChakraTheme`
 *   3. Expose the active theme tokens + a setter through React context
 *   4. Memoize the Chakra theme so we only rebuild when the active ID changes
 *
 * Components needing access to the raw tokens (not just Chakra style props)
 * can call `useTheme()` to get the active `ThemeTokens` object.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ChakraProvider } from "@chakra-ui/react";
import { createChakraTheme } from "./createTheme";
import { DEFAULT_THEME_ID, type ThemeId, type ThemeTokens } from "./tokens";
import { bauhausTokens } from "./themes/bauhaus";
import { midnightTokens } from "./themes/midnight";
import { useThemeSelection } from "./useThemeSelection";

// ─────────────────────────────────────────────────────────────────────────────
// Theme registry
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const themes: Record<ThemeId, ThemeTokens> = {
  bauhaus: bauhausTokens,
  midnight: midnightTokens,
};

/** Ordered list for theme picker UIs */
// eslint-disable-next-line react-refresh/only-export-components
export const themeList: ThemeTokens[] = [
  midnightTokens,
  bauhausTokens,
];

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  themeId: ThemeId;
  tokens: ThemeTokens;
  setThemeId: (id: ThemeId) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Hook for components that need the raw active `ThemeTokens` object — e.g.,
 * to use a chart series color or render a theme-supplied decorator.
 *
 * For most UI components, prefer Chakra style props (`bg="surface.raised"`)
 * over reading tokens directly. Use this only when you need a value Chakra
 * can't express (e.g., a hex passed to a third-party chart lib).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { themeId, setThemeId } = useThemeSelection();

  const tokens = themes[themeId] ?? themes[DEFAULT_THEME_ID];

  // Rebuild the Chakra theme only when the active theme ID changes.
  // The factory output is large; memoizing keeps switching cheap.
  const chakraTheme = useMemo(() => createChakraTheme(tokens), [tokens]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({ themeId, tokens, setThemeId }),
    [themeId, tokens, setThemeId],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <ChakraProvider theme={chakraTheme}>{children}</ChakraProvider>
    </ThemeContext.Provider>
  );
}
