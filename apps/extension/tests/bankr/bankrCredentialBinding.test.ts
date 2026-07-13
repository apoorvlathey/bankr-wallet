import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

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
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete store[key];
          }
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

const binding = await import("../../src/chrome/bankr/credentialBinding");
const txStorage = await import("../../src/chrome/requests/pendingTxStorage");
const signatureStorage = await import("../../src/chrome/requests/pendingSignatureStorage");
const batchStorage = await import("../../src/chrome/requests/pendingBatchTxStorage");
const lifecycle = await import("../../src/chrome/requests/pendingRequestLifecycle");

const credentialA = {
  ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
  iv: "AAAAAAAAAAAAAAAA",
  salt: "",
};
const credentialB = {
  ciphertext: "AQAAAAAAAAAAAAAAAAAAAA==",
  iv: "AQAAAAAAAAAAAAAA",
  salt: "",
};
const legacyCredential = {
  ciphertext: "AgAAAAAAAAAAAAAAAAAAAA==",
  iv: "AgAAAAAAAAAAAAAA",
  salt: "AAAAAAAAAAAAAAAAAAAAAA==",
};

function base(id: string) {
  return {
    id,
    origin: "internal:security-test",
    favicon: null,
    chainName: "Ethereum",
    timestamp: Date.now(),
    accountId: "bankr-1",
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountType: "bankr" as const,
    trustedInternal: true as const,
  };
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  store.encryptedApiKeyVault = structuredClone(credentialA);
});

test("all Bankr signer prompt families bind to the persisted credential generation", async () => {
  await txStorage.savePendingTxRequest({
    ...base("tx-bound"),
    tx: {
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
      value: "0x0",
      data: "0x",
      chainId: 1,
    },
  });
  await signatureStorage.savePendingSignatureRequest({
    ...base("sig-bound"),
    signature: { method: "personal_sign", params: [], chainId: 1 },
  });
  await batchStorage.savePendingBatchTxRequest({
    ...base("batch-bound"),
    chainId: 1,
    params: { version: "2.0.0", chainId: "0x1", calls: [] },
  });

  const pending = [
    store.pendingTxRequests[0],
    store.pendingSignatureRequests[0],
    store.pendingBatchTxRequests[0],
  ];
  const originalTag = await binding.getCurrentBankrCredentialTag();
  assert.match(originalTag ?? "", /^[0-9a-f]{64}$/);
  assert.deepEqual(
    pending.map((request) => request.bankrCredentialTag),
    [originalTag, originalTag, originalTag],
  );

  for (const [index, request] of pending.entries()) {
    const kind =
      index === 0
        ? "transaction"
        : index === 1
          ? "signature"
          : "batchTransaction";
    assert.deepEqual(
      await lifecycle.validatePendingRequestAuthorization(kind, request),
      { authorized: true },
    );
  }

  // Simulate a successful credential rotation. The plaintext is deliberately
  // irrelevant: a fresh AES-GCM IV creates a new security generation.
  store.encryptedApiKeyVault = structuredClone(credentialB);
  assert.notEqual(await binding.getCurrentBankrCredentialTag(), originalTag);
  for (const [index, request] of pending.entries()) {
    const kind =
      index === 0
        ? "transaction"
        : index === 1
          ? "signature"
          : "batchTransaction";
    const result = await lifecycle.validatePendingRequestAuthorization(
      kind,
      request,
    );
    assert.equal(result.authorized, false);
    if (!result.authorized) assert.match(result.error, /credential changed/i);
  }
});

test("legacy and malformed credential states fail safely", async () => {
  const oldPending = { ...base("pre-upgrade") };
  const oldResult = await lifecycle.validatePendingRequestAuthorization(
    "transaction",
    oldPending,
  );
  assert.equal(oldResult.authorized, false);

  // A malformed vault-form record is authoritative; a stale legacy record
  // must never be accepted as fallback after migration.
  store.encryptedApiKeyVault = { ...credentialA, iv: "not-base64" };
  store.encryptedApiKey = structuredClone(legacyCredential);
  assert.equal(await binding.getCurrentBankrCredentialTag(), null);
  await assert.rejects(
    txStorage.savePendingTxRequest({
      ...base("malformed"),
      tx: {
        from: "0x0000000000000000000000000000000000000001",
        to: "0x0000000000000000000000000000000000000002",
        value: "0x0",
        data: "0x",
        chainId: 1,
      },
    }),
    /credential is unavailable/i,
  );

  delete store.encryptedApiKeyVault;
  const legacyTag = await binding.getCurrentBankrCredentialTag();
  assert.match(legacyTag ?? "", /^[0-9a-f]{64}$/);
});

test("caller-supplied tags cannot override the current credential binding", async () => {
  await txStorage.savePendingTxRequest({
    ...base("overwrite-untrusted-tag"),
    bankrCredentialTag: "f".repeat(64),
    tx: {
      from: "0x0000000000000000000000000000000000000001",
      to: "0x0000000000000000000000000000000000000002",
      value: "0x0",
      data: "0x",
      chainId: 1,
    },
  });
  assert.equal(
    store.pendingTxRequests[0].bankrCredentialTag,
    await binding.getCurrentBankrCredentialTag(),
  );
  assert.notEqual(store.pendingTxRequests[0].bankrCredentialTag, "f".repeat(64));
});
