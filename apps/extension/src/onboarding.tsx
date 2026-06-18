import React from "react";
import ReactDOM from "react-dom";
import { ThemeProvider } from "@/theme";
import { bootstrapThemeAttribute, LOCALSTORAGE_THEME_KEY } from "@/theme/bootstrap";
import { FRESH_INSTALL_THEME_ID, SELECTED_THEME_STORAGE_KEY } from "@/theme/tokens";
import "./onboarding.css";
import Onboarding from "./pages/Onboarding";

// For fresh installs, pin the onboarding theme before bootstrap so the first
// paint is deterministic and does not follow the user's system light/dark mode.
if (!window.localStorage.getItem(LOCALSTORAGE_THEME_KEY)) {
  window.localStorage.setItem(LOCALSTORAGE_THEME_KEY, FRESH_INSTALL_THEME_ID);
  chrome.storage.local.set({ [SELECTED_THEME_STORAGE_KEY]: FRESH_INSTALL_THEME_ID });
}

// Resolve and apply the active theme to <html data-theme=...> BEFORE React
// renders so the very first paint matches the user's selection (no flash).
bootstrapThemeAttribute();

ReactDOM.render(
  <ThemeProvider>
    <Onboarding />
  </ThemeProvider>,
  document.getElementById("onboarding-root"),
);
