import { defineConfig } from "vite";
import path from "path";
import { sharedConfig, sharedBuildConfig, buildDir } from "./vite.config";

export default defineConfig({
  ...sharedConfig,
  build: {
    ...sharedBuildConfig,
    outDir: buildDir,
    emptyOutDir: false, // Don't clear the build directory (other builds output here too)
    rollupOptions: {
      input: {
        onboarding: path.resolve(__dirname, "onboarding.html"),
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
