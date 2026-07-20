import { defineConfig, loadEnv, type Plugin } from "vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";
import { sharedConfig, sharedBuildConfig, buildDir } from "./vite.config";

const isFirefox = process.env.BROWSER === "firefox";

const privacySdkServiceWorkerBoundary = (): Plugin => ({
  name: "privacy-sdk-service-worker-boundary",
  enforce: "post",
  generateBundle(_options, bundle) {
    const background = Object.values(bundle).find(
      (entry) => entry.type === "chunk" && entry.fileName === "background.js",
    );
    if (!background || background.type !== "chunk") {
      this.error("Missing background service-worker bundle");
    }
    const forbiddenMarkers = [
      "curve_bn128",
      "URL.createObjectURL(workerBlob)",
      "The nonce must be less than 2 ^ 128",
    ];
    for (const marker of forbiddenMarkers) {
      if (background.code.includes(marker)) {
        this.error(
          `Privacy Pools prover/worker code leaked into background.js: ${marker}`,
        );
      }
    }
  },
});

export default defineConfig(({ mode }) => {
  const extensionEnv = loadEnv(mode, __dirname, "");
  const websiteEnv = loadEnv(
    mode,
    path.resolve(__dirname, "../website"),
    "NEXT_PUBLIC_",
  );
  const defillamaSearchKey =
    process.env.VITE_DEFILLAMA_SEARCH_KEY ||
    process.env.NEXT_PUBLIC_DEFILLAMA_SEARCH_KEY ||
    websiteEnv.NEXT_PUBLIC_DEFILLAMA_SEARCH_KEY ||
    "";
  const theGraphApiKey =
    process.env.VITE_THE_GRAPH_API_KEY ||
    process.env.NEXT_PUBLIC_THE_GRAPH_API_KEY ||
    extensionEnv.VITE_THE_GRAPH_API_KEY ||
    extensionEnv.NEXT_PUBLIC_THE_GRAPH_API_KEY ||
    websiteEnv.NEXT_PUBLIC_THE_GRAPH_API_KEY ||
    "";

  return {
    ...sharedConfig,
    define: {
      "import.meta.env.VITE_DEFILLAMA_SEARCH_KEY": JSON.stringify(
        defillamaSearchKey,
      ),
      "import.meta.env.VITE_THE_GRAPH_API_KEY": JSON.stringify(
        theGraphApiKey,
      ),
    },
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
        // The SDK's published root barrel eagerly bundles snarkjs/ffjavascript.
        // ffjavascript calls URL.createObjectURL at module evaluation time,
        // which is unavailable in a Chrome MV3 service worker. Consume the
        // package's reviewed pure crypto source directly so the background
        // includes the official derivation/hash primitives without prover or
        // worker startup code. The package version and source provenance remain
        // pinned by privacy-pools.protocol.json and the lockfile tests.
        "@0xbow/privacy-pools-core-sdk": path.resolve(
          __dirname,
          "node_modules/@0xbow/privacy-pools-core-sdk/src/crypto.ts",
        ),
        // The SDK's maci-crypto dependency initializes Poseidon constants for
        // every supported width at service-worker startup. Privacy Pools uses
        // only widths 1-3, so bind that exact surface to a vector-checked
        // lightweight implementation and avoid the large eager allocation.
        "maci-crypto/build/ts/hashing.js": path.resolve(
          __dirname,
          "src/chrome/privacy/protocol/poseidonLite.ts",
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
      privacySdkServiceWorkerBoundary(),
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
  };
});
