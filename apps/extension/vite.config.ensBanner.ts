import { defineConfig } from "vite";
import path from "path";
import { sharedConfig, sharedBuildConfig, buildDir } from "./vite.config";

// Builds the ENS identity banner content script as a self-contained IIFE,
// mirroring vite.config.inject.ts. The banner runs on Kubo's subdomain
// gateway (`*.ipfs.localhost` / `*.ipns.localhost`) so the user can see the
// original ENS name even though the URL bar shows the CID host.
export default defineConfig({
  ...sharedConfig,
  build: {
    ...sharedBuildConfig,
    outDir: `${buildDir}/static/js`,
    emptyOutDir: false,
    lib: {
      formats: ["iife"],
      entry: path.resolve(__dirname, "src/chrome/ensBanner.ts"),
      name: "ensBanner",
    },
    rollupOptions: {
      output: {
        entryFileNames: "ens-banner.js",
      },
    },
  },
  publicDir: false,
});
