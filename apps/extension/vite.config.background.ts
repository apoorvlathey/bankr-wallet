import { defineConfig } from "vite";
import path from "path";
import { sharedConfig, sharedBuildConfig, buildDir } from "./vite.config";

const isFirefox = process.env.BROWSER === "firefox";

export default defineConfig({
  ...sharedConfig,
  plugins: [],
  build: {
    ...sharedBuildConfig,
    outDir: `${buildDir}/static/js`,
    emptyOutDir: false,
    lib: {
      // Chrome MV3 uses an ES-module service worker. Firefox MV3 event pages
      // load via background.scripts and must be classic scripts (IIFE).
      formats: [isFirefox ? "iife" : "es"],
      entry: path.resolve(__dirname, "src/chrome/background.ts"),
      name: "background",
    },
    rollupOptions: {
      output: {
        entryFileNames: "background.js",
        // Service workers / event pages disallow dynamic import() — inline
        // everything into a single chunk so no code-splitting occurs.
        inlineDynamicImports: true,
      },
    },
  },
  publicDir: false,
});
