import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

type StorageRecord = Record<string, unknown>;
type SigningHook = {
  local: () => Promise<string>;
  bankr: () => Promise<{ signature: string }>;
  prepared: unknown;
  privateKey: string | null;
  apiKey: string | null;
};

const clone = <T>(value: T): T => structuredClone(value);

function storageArea(storage: StorageRecord) {
  return {
    async get(keys?: string | string[] | StorageRecord | null) {
      if (keys == null) return clone(storage);
      if (typeof keys === "string") return { [keys]: clone(storage[keys]) };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, clone(storage[key])]));
      }
      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [
          key,
          clone(storage[key] ?? fallback),
        ]),
      );
    },
    async set(values: StorageRecord) {
      Object.assign(storage, clone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  };
}

test("confirmation preserves all wallet authorities and final release races", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {
    encryptedApiKeyVault: {
      ciphertext: Buffer.alloc(32, 0x22).toString("base64"),
      iv: Buffer.alloc(12, 0x11).toString("base64"),
      salt: "",
    },
  };
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};
  let viteServer: ViteDevServer | null = null;

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        async sendMessage() {},
      },
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
    },
  });

  const hooks: SigningHook = {
    async local() {
      return `0x${"aa".repeat(65)}`;
    },
    async bankr() {
      return { signature: `0x${"bb".repeat(65)}` };
    },
    prepared: null,
    privateKey: null,
    apiKey: null,
  };
  Object.assign(globalThis, { __walletchanSignatureTestHooks: hooks });

  try {
    const extensionRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    viteServer = await createServer({
      root: extensionRoot,
      configFile: false,
      server: {
        middlewareMode: true,
        hmr: { port: 20_000 + (process.pid % 10_000) },
        watch: { ignored: ["**/build/**", "**/build-firefox/**"] },
      },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { "@": path.join(extensionRoot, "src") } },
      plugins: [
        {
          name: "signature-confirmation-signers",
          enforce: "pre",
          resolveId(source, importer) {
            if (
              !importer
                ?.split("?", 1)[0]
                .endsWith("/chrome/signatures/confirmationHandlers.ts")
            ) return null;
            return ({
              "../localSigner": "\0signature-confirmation-local-signer",
              "../bankr/signing": "\0signature-confirmation-bankr-signer",
              "./confirmationPolicy": "\0signature-confirmation-policy",
              "../sessionCache": "\0signature-confirmation-session",
            } as Record<string, string>)[source] ?? null;
          },
          load(id) {
            if (id === "\0signature-confirmation-local-signer") {
              return `export const handleSignatureRequest = (...args) => globalThis.__walletchanSignatureTestHooks.local(...args);`;
            }
            if (id === "\0signature-confirmation-bankr-signer") {
              return `export const signMessageViaApi = (...args) => globalThis.__walletchanSignatureTestHooks.bankr(...args);`;
            }
            if (id === "\0signature-confirmation-policy") {
              return `export const prepareSignatureConfirmation = async () => ({ ok: true, value: globalThis.__walletchanSignatureTestHooks.prepared });`;
            }
            if (id === "\0signature-confirmation-session") {
              return `
                export const getAutoLockTimeout = async () => 60000;
                export const getCachedApiKey = () => globalThis.__walletchanSignatureTestHooks.apiKey;
                export const getCachedPassword = () => "test-password";
                export const getCachedVaultKey = () => null;
                export const getPrivateKeyFromCache = () => globalThis.__walletchanSignatureTestHooks.privateKey;
                export const setCachedApiKey = (value) => { globalThis.__walletchanSignatureTestHooks.apiKey = value; };
                export const setCachedVault = () => {};
                export const tryRestoreSession = async () => false;
              `;
            }
            return null;
          },
        },
      ],
    });

    const handlers = await viteServer.ssrLoadModule(
      "/src/chrome/signatures/confirmationHandlers.ts",
    );
    const pendingStorage = await viteServer.ssrLoadModule(
      "/src/chrome/requests/pendingSignatureStorage.ts",
    );
    const confirmationPolicy = await viteServer.ssrLoadModule(
      "/src/chrome/signatures/confirmationPolicy.ts",
    );
    const pinnedRequest = await viteServer.ssrLoadModule(
      "/src/chrome/requests/pinnedRequest.ts",
    );
    const address = "0x1111111111111111111111111111111111111111";
    const privateKey = `0x${"01".repeat(32)}`;

    const reset = () => {
      local.pendingSignatureRequests = [];
      hooks.local = async () => `0x${"aa".repeat(65)}`;
      hooks.bankr = async () => ({ signature: `0x${"bb".repeat(65)}` });
      hooks.prepared = null;
      hooks.privateKey = null;
      hooks.apiKey = null;
    };

    const queue = async (
      type: "bankr" | "privateKey" | "seedPhrase",
      id: string,
      options: {
        signature?: {
          method:
            | "personal_sign"
            | "eth_sign"
            | "eth_signTypedData"
            | "eth_signTypedData_v3"
            | "eth_signTypedData_v4";
          params: unknown[];
          chainId: number;
        };
        origin?: string;
        senderOrigin?: string;
      } = {},
    ) => {
      const account = {
        id: `${type}-account`,
        type,
        address,
        createdAt: 1,
        ...(type === "seedPhrase"
          ? { seedGroupId: "seed-group", derivationIndex: 0 }
          : {}),
      };
      local.accounts = [account];
      const pending = pinnedRequest.pinnedSignatureRequest(account, {
        id,
        signature: options.signature ?? {
          method: "personal_sign",
          params: ["0x1234", address],
          chainId: 1,
        },
        origin: options.origin ?? "WalletChan",
        ...(options.senderOrigin ? { senderOrigin: options.senderOrigin } : {}),
        favicon: null,
        chainName: "Ethereum",
        timestamp: Date.now(),
        trustedInternal: true,
      });
      await pendingStorage.savePendingSignatureRequest(pending);
      return { account, pending };
    };

    for (const [type, authority] of [
      ["privateKey", "master"],
      ["seedPhrase", "agent"],
      ["bankr", "master"],
    ] as const) {
      await t.test(`${type} signing remains available to ${authority}`, async () => {
        reset();
        const { account } = await queue(type, `${type}-success`);
        if (type === "bankr") {
          hooks.apiKey = "bankr-api-key";
        } else {
          hooks.privateKey = privateKey;
        }

        const preflight = await confirmationPolicy.prepareSignatureConfirmation(
          `${type}-success`,
        );
        assert.equal(preflight.ok, true, JSON.stringify(preflight));
        hooks.prepared = preflight.value;

        const result = type === "bankr"
          ? await handlers.handleConfirmSignatureRequestBankr(
              `${type}-success`,
              "master-password",
            )
          : await handlers.handleConfirmSignatureRequest(
              `${type}-success`,
              "master-password",
            );

        assert.equal(result.success, true, JSON.stringify(result));
        assert.match(result.signature, /^0x[0-9a-f]+$/);
        assert.equal(
          await pendingStorage.getPendingSignatureRequestById(
            `${type}-success`,
          ),
          null,
        );
      });
    }

    await t.test(
      "shared preflight preserves eth_sign and typed-data signer positions",
      async () => {
        for (const signature of [
          {
            method: "eth_sign" as const,
            params: [address, `0x${"12".repeat(32)}`],
            chainId: 1,
          },
          {
            method: "eth_signTypedData_v4" as const,
            params: [
              address,
              {
                types: { EIP712Domain: [] },
                primaryType: "EIP712Domain",
                domain: {},
                message: {},
              },
            ],
            chainId: 1,
          },
        ]) {
          reset();
          const id = `policy-${signature.method}`;
          await queue("privateKey", id, { signature });
          const result =
            await confirmationPolicy.prepareSignatureConfirmation(id);
          assert.equal(result.ok, true, JSON.stringify(result));
        }

        reset();
        await queue("privateKey", "policy-eth-sign-mismatch", {
          signature: {
            method: "eth_sign",
            params: [`0x${"22".repeat(20)}`, `0x${"12".repeat(32)}`],
            chainId: 1,
          },
        });
        const mismatch =
          await confirmationPolicy.prepareSignatureConfirmation(
            "policy-eth-sign-mismatch",
          );
        assert.equal(mismatch.ok, false);
        assert.equal(
          mismatch.result.error,
          "Signer address does not match active account",
        );
      },
    );

    await t.test(
      "shared preflight blocks cross-origin SIWE unless explicitly overridden",
      async () => {
        reset();
        const siweMessage = [
          "malicious.example wants you to sign in with your Ethereum account:",
          address,
          "",
          "Sign in to continue.",
          "",
          "URI: https://malicious.example/login",
          "Version: 1",
          "Chain ID: 1",
          "Nonce: abcdef12",
          `Issued At: ${new Date().toISOString()}`,
        ].join("\n");
        await queue("privateKey", "siwe-origin-mismatch", {
          signature: {
            method: "personal_sign",
            params: [siweMessage, address],
            chainId: 1,
          },
          origin: "app.example",
          senderOrigin: "https://app.example",
        });

        const blocked =
          await confirmationPolicy.prepareSignatureConfirmation(
            "siwe-origin-mismatch",
          );
        assert.equal(blocked.ok, false);
        assert.match(blocked.result.error ?? "", /SIWE validation failed/);

        const overridden =
          await confirmationPolicy.prepareSignatureConfirmation(
            "siwe-origin-mismatch",
            true,
          );
        assert.equal(overridden.ok, true, JSON.stringify(overridden));
      },
    );

    await t.test("account replacement during signing suppresses release", async () => {
      reset();
      const { account, pending } = await queue("privateKey", "local-race");
      hooks.privateKey = privateKey;
      hooks.prepared = { pending, account };

      let beginSigning!: () => void;
      let releaseSigning!: () => void;
      const signingStarted = new Promise<void>((resolve) => {
        beginSigning = resolve;
      });
      const signingGate = new Promise<void>((resolve) => {
        releaseSigning = resolve;
      });
      hooks.local = async () => {
        beginSigning();
        await signingGate;
        return `0x${"cc".repeat(65)}`;
      };

      const confirmation = handlers.handleConfirmSignatureRequest(
        "local-race",
        "master-password",
      );
      await signingStarted;
      local.accounts = [{ ...account, address: `0x${"22".repeat(20)}` }];
      releaseSigning();

      const result = await confirmation;
      assert.equal(result.success, false);
      assert.equal(result.signature, undefined);
      assert.equal(result.error, "Pending request is no longer valid");
    });
  } finally {
    await viteServer?.close();
    Reflect.deleteProperty(globalThis, "__walletchanSignatureTestHooks");
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      delete (globalThis as { chrome?: unknown }).chrome;
    }
  }
});
