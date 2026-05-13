import { BuildOptions, defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";

export const sharedConfig = {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    react(),
    tsconfigPaths(),
    nodePolyfills({
      exclude: ["console"],
    }),
  ],
};

export const sharedBuildConfig: BuildOptions = {
  minify: "terser",
  terserOptions: {
    keep_classnames: true,
    keep_fnames: true,
  },
};

// Per-browser build output. Set BROWSER=firefox to emit a Firefox build into
// build-firefox/ without touching the Chrome build path (build/).
export const buildDir = process.env.BROWSER === "firefox" ? "build-firefox" : "build";

export default defineConfig({
  ...sharedConfig,
  build: {
    ...sharedBuildConfig,
    outDir: buildDir,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
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
          "vendor-ethers": [
            "@ethersproject/address",
            "@ethersproject/bytes",
            "@ethersproject/logger",
            "@ethersproject/providers",
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
    hmr: {
      host: "localhost",
    },
    origin: `http://localhost:3000`,
  },
});
