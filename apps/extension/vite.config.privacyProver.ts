import { defineConfig } from "vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";
import { buildDir, sharedBuildConfig } from "./vite.config";

const proverPolyfills = () =>
  nodePolyfills({
    exclude: ["console"],
    globals: {
      Buffer: true,
      global: true,
      process: true,
    },
  });

export default defineConfig({
  plugins: [tsconfigPaths(), proverPolyfills()],
  worker: {
    format: "es",
    plugins: () => [tsconfigPaths(), proverPolyfills()],
  },
  build: {
    ...sharedBuildConfig,
    outDir: buildDir,
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, "privacy-prover-offscreen.html"),
      output: {
        entryFileNames: "static/js/[name].js",
        chunkFileNames: "static/js/[name]-[hash].js",
        assetFileNames: "static/js/[name]-[hash][extname]",
      },
    },
  },
  publicDir: false,
});
