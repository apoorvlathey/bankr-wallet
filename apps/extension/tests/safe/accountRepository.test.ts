import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  decodeSafeAccountsEnvelope,
  getSafeAccountRecords,
  importVerifiedSafeAccount,
  removeSafeAccountRecord,
} from "../../src/chrome/safe/accountRepository";
import type { SafeChainSnapshot } from "../../src/chrome/safe/types";
import { installNativeSessionStorage } from "../session/testStorage";

const installed: Array<ReturnType<typeof installNativeSessionStorage>> = [];
afterEach(() => installed.pop()?.restore());

function snapshot(chainId: number): SafeChainSnapshot {
  return {
    chainId,
    verifiedAtBlock: "123",
    configEpoch: `0x${"ab".repeat(32)}`,
    singleton: "0x1111111111111111111111111111111111111111",
    version: "1.4.1",
    owners: ["0x2222222222222222222222222222222222222222"],
    contractOwners: [],
    threshold: 1,
    nonce: "4",
    modules: [],
    guard: "0x0000000000000000000000000000000000000000",
    fallbackHandler: "0x3333333333333333333333333333333333333333",
    transactionService: "supported",
    capability: "approve",
  };
}

test("Safe import atomically creates one account and merges verified chains", async () => {
  const storage = installNativeSessionStorage({ local: { accounts: [] } });
  installed.push(storage);
  const address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  const first = await importVerifiedSafeAccount({
    address,
    importedBy: "manual",
    snapshots: [snapshot(1)],
  });
  const second = await importVerifiedSafeAccount({
    address,
    importedBy: "manual",
    snapshots: [snapshot(8453)],
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.account.id, first.account.id);
  assert.deepEqual(Object.keys(second.record.chains).sort(), ["1", "8453"]);
  assert.equal((storage.local.accounts as unknown[]).length, 1);
  assert.equal((await getSafeAccountRecords()).length, 1);
});

test("Safe storage decoder rejects malformed and duplicate authority state", () => {
  assert.throws(() => decodeSafeAccountsEnvelope({ version: 1, records: {} }));
  assert.throws(() =>
    decodeSafeAccountsEnvelope({
      version: 1,
      records: [{
        version: 1,
        accountId: "safe-1",
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        importedBy: "manual",
        chains: {
          "1": { ...snapshot(1), owners: [snapshot(1).owners[0], snapshot(1).owners[0]] },
        },
      }],
    }),
  );
});

test("removing a Safe removes only the Safe account and metadata", async () => {
  const owner = {
    id: "owner-1",
    type: "privateKey",
    address: "0x2222222222222222222222222222222222222222",
    createdAt: 1,
  } as const;
  const storage = installNativeSessionStorage({ local: { accounts: [owner] } });
  installed.push(storage);
  const imported = await importVerifiedSafeAccount({
    address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    importedBy: "manual",
    snapshots: [snapshot(1)],
  });
  await removeSafeAccountRecord(imported.account.id);

  assert.deepEqual(storage.local.accounts, [owner]);
  assert.deepEqual(await getSafeAccountRecords(), []);
});
