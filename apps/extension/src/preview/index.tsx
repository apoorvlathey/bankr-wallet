import React from "react";
import ReactDOM from "react-dom";
import { ColorModeScript } from "@chakra-ui/react";
import { ThemeProvider } from "@/theme";
import { NetworksProvider } from "@/contexts/NetworksContext";
import { bootstrapThemeAttribute } from "@/theme/bootstrap";
import { installPreviewChrome } from "./previewChrome";
import PreviewApp from "./PreviewApp";
import "../index.css";
import "./preview.css";

installPreviewChrome();
bootstrapThemeAttribute();

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider>
      <NetworksProvider>
        <ColorModeScript />
        <PreviewApp />
      </NetworksProvider>
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById("preview-root"),
);
