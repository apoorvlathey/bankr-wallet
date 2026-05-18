import React from "react";
import ReactDOM from "react-dom";
import { ThemeProvider } from "@/theme";
import { bootstrapThemeAttribute } from "@/theme/bootstrap";
import "./onboarding.css";
import EnsSetupKubo from "./pages/EnsSetupKubo";

bootstrapThemeAttribute();

ReactDOM.render(
  <ThemeProvider>
    <EnsSetupKubo />
  </ThemeProvider>,
  document.getElementById("ens-setup-kubo-root"),
);
