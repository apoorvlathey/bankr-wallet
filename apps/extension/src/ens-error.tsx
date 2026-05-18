import React from "react";
import ReactDOM from "react-dom";
import { ThemeProvider } from "@/theme";
import { bootstrapThemeAttribute } from "@/theme/bootstrap";
import "./onboarding.css";
import EnsError from "./pages/EnsError";

bootstrapThemeAttribute();

ReactDOM.render(
  <ThemeProvider>
    <EnsError />
  </ThemeProvider>,
  document.getElementById("ens-error-root"),
);
