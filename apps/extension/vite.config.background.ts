import { defineConfig } from "vite";
import path from "path";
import { sharedConfig, sharedBuildConfig } from "./vite.config";

export default defineConfig({
  ...sharedConfig,
  plugins: [],
  build: {
    ...sharedBuildConfig,
    outDir: "build/static/js",
    emptyOutDir: false,
    lib: {
      formats: ["es"], // ES module for service worker
      entry: path.resolve(__dirname, "src/chrome/background.ts"),
      name: "background",
    },
    rollupOptions: {
      output: {
        entryFileNames: "background.js",
        // Service workers disallow dynamic import() — inline everything
        // into a single chunk so no code-splitting occurs.
        inlineDynamicImports: true,
      },
    },
  },
  publicDir: false,
});
