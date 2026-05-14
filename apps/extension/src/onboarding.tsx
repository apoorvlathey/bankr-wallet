import React from "react";
import ReactDOM from "react-dom";
import { ThemeProvider } from "@/theme";
import { bootstrapThemeAttribute, LOCALSTORAGE_THEME_KEY } from "@/theme/bootstrap";
import { SELECTED_THEME_STORAGE_KEY } from "@/theme/useThemeSelection";
import type { ThemeId } from "@/theme/tokens";
import "./onboarding.css";
import Onboarding from "./pages/Onboarding";

// For fresh installs, detect system light/dark preference and set the theme
// before bootstrap so the onboarding page renders with the right theme from
// the first paint. Existing users never see onboarding.tsx on update, so they
// keep their current theme (bauhaus default).
if (!window.localStorage.getItem(LOCALSTORAGE_THEME_KEY)) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const detectedTheme: ThemeId = prefersDark ? "midnight" : "bauhaus";
  window.localStorage.setItem(LOCALSTORAGE_THEME_KEY, detectedTheme);
  chrome.storage.local.set({ [SELECTED_THEME_STORAGE_KEY]: detectedTheme });
}

// Resolve and apply the active theme to <html data-theme=...> BEFORE React
// renders so the very first paint matches the user's selection (no flash).
bootstrapThemeAttribute();

ReactDOM.render(
  <ThemeProvider>
    <Onboarding
      onComplete={() => {
        // Tab will be closed when user opens the extension popup
      }}
    />
  </ThemeProvider>,
  document.getElementById("onboarding-root"),
);
