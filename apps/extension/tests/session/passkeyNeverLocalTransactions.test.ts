import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const MASTER_PASSWORD = "passkey-never-local-transaction-master";
const PRIVATE_KEYS = {
  privateKey: `0x${"61".repeat(32)}` as `0x${string}`,
  seedPhrase: `0x${"62".repeat(32)}` as `0x${string}`,
};

function clearRecord(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) delete record[key];
}

test("cold passkey Never restoration reaches pinned local transaction confirmation", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 0 },
  });
  const executionCalls: unknown[][] = [];
  Object.assign(globalThis, {
    __walletchanPasskeyNeverLocalTx: { executionCalls },
  });
  let server: ViteDevServer | null = null;

  try {
    const extensionRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    server = await createServer({
      root: extensionRoot,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { port: 24_000 + (process.pid % 6_000) },
      },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(extensionRoot, "src") } },
      plugins: [
        {
          name: "passkey-never-local-transaction-effect-boundary",
          enforce: "pre",
          resolveId(source, importer) {
            if (
              source === "./localExecution" &&
              importer
                ?.split("?", 1)[0]
                .endsWith("/chrome/transactions/localConfirmation.ts")
            ) {
              return "\0passkey-never-local-execution";
            }
            return null;
          },
          load(id) {
            if (id !== "\0passkey-never-local-execution") return null;
            return `
              export const processLocalTransactionInBackground = (...args) => {
                globalThis.__walletchanPasskeyNeverLocalTx.executionCalls.push(args);
                args[6]?.release();
              };
            `;
          },
        },
      ],
    });

    const authTransition = await server.ssrLoadModule(
      "/src/chrome/authTransition.ts",
    );
    const cryptoModule = await server.ssrLoadModule("/src/chrome/crypto.ts");
    const localConfirmation = await server.ssrLoadModule(
      "/src/chrome/transactions/localConfirmation.ts",
    );
    const pendingTransactions = await server.ssrLoadModule(
      "/src/chrome/requests/pendingTxStorage.ts",
    );
    const passkey = await server.ssrLoadModule(
      "/src/chrome/passkeyUnlock.ts",
    );
    const passkeyCrypto = await server.ssrLoadModule(
      "/src/chrome/passkeyUnlockCrypto.ts",
    );
    const pinnedRequests = await server.ssrLoadModule(
      "/src/chrome/requests/pinnedRequest.ts",
    );
    const runtime = await server.ssrLoadModule(
      "/src/chrome/transactions/runtime.ts",
    );
    const session = await server.ssrLoadModule("/src/chrome/sessionCache.ts");
    const signer = await server.ssrLoadModule("/src/chrome/localSigner.ts");
    const vault = await server.ssrLoadModule("/src/chrome/vaultCrypto.ts");

    for (const walletType of ["privateKey", "seedPhrase"] as const) {
      await t.test(walletType, async () => {
        await session.clearAllAuthState();
        clearRecord(chromeHarness.stores.local);
        clearRecord(chromeHarness.stores.sync);
        clearRecord(chromeHarness.stores.session);
        chromeHarness.stores.sync.autoLockTimeout = 0;
        session.updateCachedAutoLockTimeout(0);
        executionCalls.length = 0;

        const privateKey = PRIVATE_KEYS[walletType];
        const account = {
          id: `${walletType}-cold-tx-account`,
          type: walletType,
          address: signer.deriveAddress(privateKey),
          createdAt: 1,
          ...(walletType === "seedPhrase"
            ? { seedGroupId: "cold-seed-group", derivationIndex: 0 }
            : {}),
        };
        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        chromeHarness.stores.local.accounts = [account];
        chromeHarness.stores.local.encryptedVaultKeyMaster =
          await cryptoModule.encryptVaultKey(vaultKeyBytes, MASTER_PASSWORD);
        chromeHarness.stores.local.pkVault = {
          version: 1,
          entries: [
            {
              id: account.id,
              keystore: await vault.encryptPrivateKeyWithVaultKey(
                privateKey,
                vaultKey,
              ),
            },
          ],
        };
        const payload = {
          credentialId: Buffer.alloc(64, 0x71).toString("base64url"),
          prfSalt: Buffer.alloc(32, 0x72).toString("base64url"),
          prfKeyMaterial: Buffer.alloc(32, 0x73).toString("base64url"),
          authCeremonyEpoch: authTransition.getAuthCeremonyEpoch(),
        };
        const built = await passkeyCrypto.buildPasskeyRecord(
          payload,
          vaultKeyBytes,
        );
        assert.ok(built.record);
        chromeHarness.stores.local.passkeyUnlock = built.record;
        assert.deepEqual(await passkey.handleUnlockWithPasskey(payload), {
          success: true,
        });

        const txId = `${walletType}-cold-transaction`;
        const pending = pinnedRequests.pinnedTxRequest(account, {
          id: txId,
          tx: {
            from: account.address,
            to: "0x3333333333333333333333333333333333333333",
            value: "0x2",
            data: "0x",
            chainId: 1,
          },
          origin: "WalletChan",
          favicon: null,
          chainName: "Ethereum",
          timestamp: Date.now(),
          trustedInternal: true,
        });
        await pendingTransactions.savePendingTxRequest(pending);
        session.clearInMemoryAuthCache();

        assert.deepEqual(
          await localConfirmation.handleConfirmTransactionAsyncPK(
            txId,
            "intentionally-wrong-password",
          ),
          { success: true },
        );
        assert.equal(executionCalls.length, 1);
        const [capturedId, capturedPending, capturedAccount, capturedKey] =
          executionCalls[0];
        assert.equal(capturedId, txId);
        assert.deepEqual(capturedPending, pending);
        assert.deepEqual(capturedAccount, account);
        assert.equal(capturedKey, privateKey);
        assert.equal(
          await pendingTransactions.getPendingTxRequestById(txId),
          null,
        );
        assert.equal(session.getCachedPassword(), null);
        assert.equal(session.getPasswordType(), "master");
        runtime.processingTxIds.delete(txId);
      });
    }
  } finally {
    await server?.close();
    Reflect.deleteProperty(globalThis, "__walletchanPasskeyNeverLocalTx");
    chromeHarness.restore();
  }
});
