import { defineConfig, type Plugin } from "vite";
import path from "path";
import { sharedConfig } from "./vite.config";

const previewRoutesPlugin: Plugin = {
  name: "walletchan-preview-routes",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (!req.url) {
        next();
        return;
      }

      const queryIndex = req.url.indexOf("?");
      const pathname = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
      const search = queryIndex === -1 ? "" : req.url.slice(queryIndex);

      if (pathname === "/preview" || pathname.startsWith("/preview/")) {
        req.url = `/preview.html${search}`;
      }

      next();
    });
  },
};

export default defineConfig({
  ...sharedConfig,
  plugins: [...sharedConfig.plugins, previewRoutesPlugin],
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
