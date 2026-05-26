import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { ThemeProvider } from "@/theme";
import "./index.css";
import { NetworksProvider } from "@/contexts/NetworksContext";
import { bootstrapThemeAttribute } from "@/theme/bootstrap";
import { preloadAvatarCache } from "@/lib/avatarCacheClient";

// Resolve and apply the active theme to <html data-theme=...> BEFORE React
// renders so the very first paint matches the user's selection (no flash).
bootstrapThemeAttribute();
void preloadAvatarCache().catch(() => {});

ReactDOM.render(
  <ThemeProvider>
    <NetworksProvider>
      <App />
    </NetworksProvider>
  </ThemeProvider>,
  document.getElementById("root"),
);
