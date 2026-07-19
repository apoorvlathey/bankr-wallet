import { defineConfig } from "vite";
import path from "path";
import { sharedConfig, sharedBuildConfig, buildDir } from "./vite.config";

export default defineConfig({
  ...sharedConfig,
  plugins: [],
  build: {
    ...sharedBuildConfig,
    outDir: `${buildDir}/static/js`,
    emptyOutDir: false,
    lib: {
      formats: ["es"],
      entry: path.resolve(__dirname, "src/offscreen/offscreen.ts"),
    },
    rollupOptions: {
      output: { entryFileNames: "offscreen.js", inlineDynamicImports: true },
    },
  },
  publicDir: false,
});
