import { defineConfig } from "vite";
import path from "path";
import { sharedConfig, sharedBuildConfig, buildDir } from "./vite.config";

// Builds the ENS browsing standalone pages (launcher + interstitial + error +
// setup-kubo) in a single rollup pass, mirroring vite.config.onboarding.ts.
// Each page is a separate HTML entry so they can be opened independently from
// the More launcher, DNR redirect, or settings link.
export default defineConfig({
  ...sharedConfig,
  build: {
    ...sharedBuildConfig,
    outDir: buildDir,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        browse: path.resolve(__dirname, "browse.html"),
        interstitial: path.resolve(__dirname, "interstitial.html"),
        "ens-error": path.resolve(__dirname, "ens-error.html"),
        "setup-kubo": path.resolve(__dirname, "setup-kubo.html"),
      },
      output: {
        entryFileNames: "static/js/[name].js",
        chunkFileNames: "static/js/[name]-[hash].js",
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-chakra": [
            "@chakra-ui/react",
            "@chakra-ui/icons",
            "@emotion/react",
            "@emotion/styled",
            "framer-motion",
          ],
        },
      },
    },
  },
});
