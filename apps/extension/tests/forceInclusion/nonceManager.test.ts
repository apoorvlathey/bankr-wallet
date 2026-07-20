import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

test("nonce preview is read-only and exact reservations never move the cache backwards", async () => {
  let server: ViteDevServer | null = null;
  const hooks = { result: "0x5", calls: [] as unknown[][] };
  Object.assign(globalThis, { __walletchanNonceManager: hooks });

  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: { middlewareMode: true, hmr: { port: 25_000 + process.pid % 5_000 } },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "nonce-manager-rpc-boundaries",
        enforce: "pre",
        resolveId(source, importer) {
          if (!importer?.split("?", 1)[0].includes("/forceInclusion/nonce")) {
            return null;
          }
          return ({
            "../transactions/rpcConfig": "\0nonce-manager-config",
            "../network/rpcClient": "\0nonce-manager-rpc",
          } as Record<string, string>)[source] ?? null;
        },
        load(id) {
          if (id === "\0nonce-manager-config") {
            return `export const getRpcUrl = async () => "https://rpc.test";`;
          }
          if (id === "\0nonce-manager-rpc") return `
            export const fetchRpcEnvelope = async (...args) => {
              globalThis.__walletchanNonceManager.calls.push(args);
              return { result: globalThis.__walletchanNonceManager.result };
            };`;
          return null;
        },
      }],
    });

    const manager = await server.ssrLoadModule(
      "/src/chrome/forceInclusion/nonceManager.ts",
    );
    const address = "0x1111111111111111111111111111111111111111";

    assert.equal(await manager.peekNextNonce(address, 1), 5);
    assert.equal(await manager.peekNextNonce(address, 1), 5);
    assert.equal(manager.reserveNonce(address, 1, 7), 7);
    assert.equal(await manager.peekNextNonce(address, 1), 8);
    assert.equal(await manager.getNextNonce(address, 1), 8);
    assert.equal(await manager.peekNextNonce(address, 1), 9);

    assert.equal(manager.reserveNonce(address, 1, 4), 4);
    assert.equal(await manager.peekNextNonce(address, 1), 9);

    manager.resetNonce(address, 1);
    assert.equal(await manager.peekNextNonce(address, 1), 5);
    assert.ok(hooks.calls.every((call) => call[1] === "eth_getTransactionCount"));
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanNonceManager");
  }
});
