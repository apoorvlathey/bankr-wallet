import React from "react";
import ReactDOM from "react-dom";
import { ThemeProvider } from "@/theme";
import { bootstrapThemeAttribute } from "@/theme/bootstrap";
import "./onboarding.css";
import Onboarding from "./pages/Onboarding";

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
