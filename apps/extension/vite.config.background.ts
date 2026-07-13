import { defineConfig } from "vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";
import { sharedConfig, sharedBuildConfig, buildDir } from "./vite.config";

const isFirefox = process.env.BROWSER === "firefox";

export default defineConfig({
  ...sharedConfig,
  resolve: {
    ...sharedConfig.resolve,
    alias: {
      ...sharedConfig.resolve.alias,
      // WalletKit imports its optional Pay client unconditionally. The
      // upstream Pay browser bundle contains dynamic-code/WebAssembly loaders
      // that violate the extension's strict MV3 CSP. WalletChan does not expose
      // Pay, so keep WalletConnect sessions/signing and disable only that
      // optional feature at the background-bundle boundary.
      "@walletconnect/pay": path.resolve(
        __dirname,
        "src/chrome/walletConnect/payUnavailable.ts",
      ),
    },
  },
  plugins: [
    tsconfigPaths(),
    nodePolyfills({
      exclude: ["console"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
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
