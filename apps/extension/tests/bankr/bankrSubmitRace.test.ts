import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

type Store = Record<string, any>;
const store: Store = {};
function getResult(keys: string | string[] | Record<string, unknown> | null) {
  if (keys === null) return { ...store };
  if (typeof keys === "string") return { [keys]: store[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, store[key]]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      store[key] === undefined ? fallback : store[key],
    ]),
  );
}

Object.defineProperty(globalThis, "chrome", {
  configurable: true,
  value: {
    storage: {
      local: {
        async get(keys: string | string[] | Record<string, unknown> | null) {
          return getResult(keys);
        },
        async set(values: Store) {
          Object.assign(store, structuredClone(values));
        },
        async remove(keys: string | string[]) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
        },
      },
    },
    action: {
      async setBadgeText() {},
      async setBadgeBackgroundColor() {},
    },
    runtime: { async sendMessage() {} },
  },
});

const bankr = await import("../../src/chrome/bankrApi");
const binding = await import("../../src/chrome/bankrCredentialBinding");
const authorization = await import("../../src/chrome/bankrPendingAuthorization");
const signatureRelease = await import("../../src/chrome/pendingSignatureRelease");

test("credential rotation during the signer challenge prevents Bankr submit", async () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  store.accounts = [
    {
      id: "bankr-1",
      type: "bankr",
      address: account.address,
      createdAt: 1,
    },
  ];
  store.encryptedApiKeyVault = {
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
    iv: "AAAAAAAAAAAAAAAA",
    salt: "",
  };
  const bankrCredentialTag = await binding.getCurrentBankrCredentialTag();
  assert.match(bankrCredentialTag ?? "", /^[0-9a-f]{64}$/);
  const pending = {
    id: "bankr-race",
    origin: "internal:race-test",
    trustedInternal: true as const,
    accountId: "bankr-1",
    accountAddress: account.address,
    accountType: "bankr" as const,
    bankrCredentialTag: bankrCredentialTag!,
  };

  let releaseChallenge!: () => void;
  let challengeStarted!: () => void;
  const challengeGate = new Promise<void>((resolve) => {
    releaseChallenge = resolve;
  });
  const started = new Promise<void>((resolve) => {
    challengeStarted = resolve;
  });
  let submitCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/wallet/sign")) {
      challengeStarted();
      await challengeGate;
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          success: true,
          signature: await account.signMessage({ message: body.message }),
          signer: account.address,
          signatureType: "personal_sign",
        }),
      );
    }
    submitCalls += 1;
    throw new Error("submit must not be called");
  };

  let effectStarted = false;
  const submission = bankr.submitTransactionDirect(
    "old-api-key",
    {
      from: account.address,
      to: "0x2222222222222222222222222222222222222222",
      chainId: 8453,
    },
    undefined,
    () =>
      authorization.authorizePendingBankrSubmit(
        "transaction",
        pending,
        () => {
          effectStarted = true;
        },
      ),
  );
  await started;
  store.encryptedApiKeyVault = {
    ciphertext: "AQAAAAAAAAAAAAAAAAAAAA==",
    iv: "AQAAAAAAAAAAAAAA",
    salt: "",
  };
  releaseChallenge();

  await assert.rejects(submission, /credential changed/i);
  assert.equal(effectStarted, false);
  assert.equal(submitCalls, 0);
});

test("a signature is discarded when credential authority changes while signing", async () => {
  const account = privateKeyToAccount(`0x${"33".repeat(32)}`);
  store.accounts = [
    {
      id: "bankr-signature",
      type: "bankr",
      address: account.address,
      createdAt: 1,
    },
  ];
  store.encryptedApiKeyVault = {
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
    iv: "AAAAAAAAAAAAAAAA",
    salt: "",
  };
  const tag = await binding.getCurrentBankrCredentialTag();
  const pending = {
    id: "signature-race",
    origin: "internal:signature-race",
    trustedInternal: true as const,
    accountId: "bankr-signature",
    accountAddress: account.address,
    accountType: "bankr" as const,
    bankrCredentialTag: tag!,
  };

  // The remote signature completed, but the user rotated credentials before
  // WalletChan released that capability to the requester.
  store.encryptedApiKeyVault = {
    ciphertext: "AQAAAAAAAAAAAAAAAAAAAA==",
    iv: "AQAAAAAAAAAAAAAA",
    salt: "",
  };
  const result =
    await signatureRelease.revalidatePendingSignatureBeforeRelease(
      pending,
      "bankr",
    );
  assert.equal(result.authorized, false);
  if (!result.authorized) assert.match(result.error, /credential changed/i);
});
