import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createServer, type ViteDevServer } from "vite";
import { buildSafeTransactionTypedData } from "../../src/chrome/safe/transactionHash";

test("the centralized Ledger EIP-712 path accepts and recovers Safe transactions", async () => {
  const privateKey = `0x${"11".repeat(32)}` as const;
  const signer = privateKeyToAccount(privateKey);
  const typedData = buildSafeTransactionTypedData({
    chainId: 8453,
    safeAddress: "0x1111111111111111111111111111111111111111",
    safeVersion: "1.4.1",
    transaction: {
      to: "0x2222222222222222222222222222222222222222",
      value: "1",
      data: "0x1234",
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 7,
    },
  });
  const signed = parseSignature(await signer.signTypedData(typedData));
  Object.assign(globalThis, {
    __walletchanSafeLedgerSignature: {
      r: signed.r,
      s: signed.s,
      v: Number(signed.yParity),
    },
  });

  let server: ViteDevServer | null = null;
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    server = await createServer({
      root,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { port: 22_000 + (process.pid % 8_000) },
      },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(root, "src") } },
      plugins: [{
        name: "safe-ledger-typed-data",
        enforce: "pre",
        resolveId(source, importer) {
          if (
            importer?.split("?", 1)[0].endsWith("/chrome/ledger/signing.ts") &&
            source === "./offscreenBridge"
          ) {
            return "\0safe-ledger-offscreen";
          }
          return null;
        },
        load(id) {
          if (id !== "\0safe-ledger-offscreen") return null;
          return `
            export const signLedgerTypedData = async () =>
              globalThis.__walletchanSafeLedgerSignature;
            export const signLedgerMessage = async () => {
              throw new Error("unexpected message signing");
            };
            export const signLedgerTransaction = async () => {
              throw new Error("unexpected transaction signing");
            };
          `;
        },
      }],
    });
    const ledgerSigning = await server.ssrLoadModule(
      "/src/chrome/ledger/signing.ts",
    );
    const account = {
      id: "ledger-owner",
      type: "ledger",
      address: signer.address,
      deviceId: signer.address.toLowerCase(),
      hdPath: "m/44'/60'/0'/0/0",
      hdIndex: 0,
      createdAt: 1,
    };

    const signature = await ledgerSigning.signLedgerTypedDataForAccount({
      opId: "safe-approval",
      account,
      typedData,
      chainId: 8453,
    });
    assert.match(signature, /^0x[0-9a-f]{130}$/i);

    await assert.rejects(
      ledgerSigning.signLedgerTypedDataForAccount({
        opId: "safe-approval-wrong-chain",
        account,
        typedData,
        chainId: 1,
      }),
      /must match the active chainId/,
    );
    await assert.rejects(
      ledgerSigning.signLedgerTypedDataForAccount({
        opId: "safe-approval-wrong-account",
        account: {
          ...account,
          address: "0x3333333333333333333333333333333333333333",
        },
        typedData,
        chainId: 8453,
      }),
      /Ledger signed with a different account/,
    );
  } finally {
    await server?.close();
    delete (globalThis as any).__walletchanSafeLedgerSignature;
  }
});
