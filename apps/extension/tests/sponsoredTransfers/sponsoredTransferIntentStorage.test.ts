import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

function selectValues(
  state: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return structuredClone(state);
  if (typeof keys === "string") return { [keys]: state[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, state[key]]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      state[key] === undefined ? fallback : state[key],
    ]),
  );
}

test("sponsored transfer recovery stores only an encrypted one-time authorization and reuses unresolved semantics", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(keys?: string | string[] | StorageRecord | null) {
            return selectValues(local, keys);
          },
          async set(values: StorageRecord) {
            Object.assign(local, structuredClone(values));
          },
          async remove(keys: string | string[]) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete local[key];
            }
          },
        },
      },
    },
  });

  try {
    const [cryptoModule, storage] = await Promise.all([
      import("../../src/chrome/crypto"),
      import("../../src/chrome/sponsoredTransfers/intentStorage"),
    ]);
    const vaultKey = await cryptoModule.importVaultKey(
      new Uint8Array(32).fill(7),
    );
    const signature = `0x${"ab".repeat(65)}`;
    const payload = {
      from: `0x${"11".repeat(20)}`,
      to: `0x${"22".repeat(20)}`,
      value: "1000000",
      validAfter: "0",
      validBefore: String(Math.floor(Date.now() / 1_000) + 3_600),
      nonce: `0x${"33".repeat(32)}`,
      signature,
    };
    const encryptedPayload = await cryptoModule.encryptWithVaultKey(
      vaultKey,
      JSON.stringify(payload),
    );
    const record = {
      version: 1 as const,
      id: "intent-original",
      txId: "history-original",
      accountId: "account-1",
      accountAddress: payload.from,
      accountType: "privateKey" as const,
      to: payload.to,
      value: payload.value,
      amount: "1",
      createdAt: Date.now(),
      validBefore: Number(payload.validBefore),
      state: "prepared" as const,
      encryptedPayload,
      attempts: 0,
    };

    await storage.saveSponsoredTransferIntent(record);

    const serializedStorage = JSON.stringify(local);
    assert.doesNotMatch(serializedStorage, new RegExp(signature.slice(2)));
    assert.doesNotMatch(serializedStorage, /"nonce"|"signature"/);
    assert.match(serializedStorage, /"encryptedPayload"/);
    assert.deepEqual(
      JSON.parse(
        (await cryptoModule.decryptWithVaultKey(
          vaultKey,
          record.encryptedPayload,
        ))!,
      ),
      payload,
    );

    await assert.rejects(
      storage.findSponsoredTransferIntent({
        id: record.id,
        accountId: record.accountId,
        accountAddress: record.accountAddress,
        to: `0x${"99".repeat(20)}`,
        value: record.value,
      }),
      /does not match the reviewed transfer/i,
      "reusing an exact renderer intent id for different reviewed fields must fail closed",
    );

    const originalNow = Date.now;
    Date.now = () => (record.validBefore + 3_600) * 1_000;
    const semanticRetry = await storage
      .findSponsoredTransferIntent({
        id: "fresh-renderer-intent",
        accountId: "replacement-account-metadata-id",
        accountAddress: record.accountAddress.toUpperCase(),
        to: record.to.toUpperCase(),
        value: record.value,
      })
      .finally(() => {
        Date.now = originalNow;
      });
    assert.equal(semanticRetry?.id, record.id);
    assert.equal(semanticRetry?.txId, record.txId);
    assert.deepEqual(semanticRetry?.encryptedPayload, encryptedPayload);
    assert.equal(
      semanticRetry?.accountId,
      record.accountId,
      "semantic recovery follows the signed address, not mutable account metadata",
    );

    assert.equal(
      await storage.acknowledgeSponsoredTransferIntent(
        record.id,
        record.accountAddress,
      ),
      false,
      "a prepared authorization is not safe to acknowledge away",
    );

    const txHash = `0x${"44".repeat(32)}`;
    await storage.updateSponsoredTransferIntent(record.id, {
      state: "submitted",
      attempts: 1,
      txHash,
    });
    const exactSubmittedRetry = await storage.findSponsoredTransferIntent({
      id: record.id,
      accountId: record.accountId,
      accountAddress: record.accountAddress,
      to: record.to,
      value: record.value,
    });
    assert.equal(exactSubmittedRetry?.txHash, txHash);

    Date.now = () => (record.validBefore + 86_400) * 1_000;
    const reopenedSubmitted = await storage
      .findSponsoredTransferIntent({
        id: "new-renderer-uuid-after-lost-success-response",
        accountId: "replacement-account-metadata-id",
        accountAddress: record.accountAddress,
        to: record.to,
        value: record.value,
      })
      .finally(() => {
        Date.now = originalNow;
      });
    assert.equal(reopenedSubmitted?.id, record.id);
    assert.equal(reopenedSubmitted?.txHash, txHash);

    assert.equal(
      await storage.acknowledgeSponsoredTransferIntent(
        record.id,
        `0x${"88".repeat(20)}`,
      ),
      false,
      "terminal acknowledgement must bind to the exact account address",
    );
    await storage.updateSponsoredTransferIntent(record.id, {
      state: "consumed",
      attempts: 1,
      txHash,
    });
    Date.now = () => (record.validBefore + 172_800) * 1_000;
    const retainedConsumed = await storage
      .getSponsoredTransferIntentsForAddress(record.accountAddress)
      .finally(() => {
        Date.now = originalNow;
      });
    assert.equal(retainedConsumed.length, 1);
    assert.equal(retainedConsumed[0]?.state, "consumed");

    assert.equal(
      await storage.acknowledgeSponsoredTransferIntent(
        record.id,
        record.accountAddress.toUpperCase(),
      ),
      true,
    );
    assert.equal(local.sponsoredTransferIntents, undefined);
    assert.equal(
      await storage.findSponsoredTransferIntent({
        id: record.id,
        accountId: record.accountId,
        accountAddress: record.accountAddress,
        to: record.to,
        value: record.value,
      }),
      null,
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("sponsored transfer submission persists the encrypted authorization before the relayer request", async () => {
  const [authorization, handlers, submission] = await Promise.all([
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/authorization.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/handlers.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/sponsoredTransfers/submission.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(authorization, /encryptWithVaultKey\(/);
  const authorizeIndex = handlers.indexOf(
    "createSponsoredTransferAuthorization({",
  );
  const saveIndex = handlers.indexOf("saveSponsoredTransferIntent(record)");
  const submitIndex = handlers.indexOf("submitSponsoredTransfer(");
  assert.ok(authorizeIndex >= 0);
  assert.ok(saveIndex > authorizeIndex);
  assert.ok(submitIndex > saveIndex);
  assert.match(submission, /request = fetchTextBounded\(/);
  assert.match(
    submission,
    /catch \(error\)[\s\S]*updateSponsoredTransferIntent\(record\.id,[\s\S]*state: "ambiguous"[\s\S]*outcomeUncertain: true/,
  );
});
