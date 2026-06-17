import { defineConfig } from "vite";
import path from "path";
import { sharedConfig } from "./vite.config";

export default defineConfig({
  ...sharedConfig,
  server: {
    port: 4317,
    hmr: {
      host: "localhost",
    },
    origin: "http://localhost:4317",
  },
  build: {
    outDir: "preview-build",
    rollupOptions: {
      input: {
        preview: path.resolve(__dirname, "preview.html"),
      },
    },
  },
});
