import React from "react";
import ReactDOM from "react-dom";
import { ThemeProvider } from "@/theme";
import { bootstrapThemeAttribute } from "@/theme/bootstrap";
import "./onboarding.css";
import EnsInterstitial from "./pages/EnsInterstitial";

bootstrapThemeAttribute();

ReactDOM.render(
  <ThemeProvider>
    <EnsInterstitial />
  </ThemeProvider>,
  document.getElementById("ens-interstitial-root"),
);
