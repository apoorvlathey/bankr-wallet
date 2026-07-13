import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { commitErc7715GrantForPinnedAccount } from "../../src/chrome/erc7715/grantBoundary";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../src/chrome/storageLock";
import type { Account } from "../../src/chrome/types";

function privateKeyAccount(): Account {
  return {
    id: "account-1",
    type: "privateKey",
    address: "0x1111111111111111111111111111111111111111",
    displayName: "Signer",
    createdAt: Date.now(),
  } as Account;
}

const pinned = {
  accountId: "account-1",
  accountAddress: "0x1111111111111111111111111111111111111111",
  accountType: "privateKey" as const,
};

test("account removal that wins the wallet-secret lock blocks a signed grant commit", async () => {
  let account: Account | null = privateKeyAccount();
  let committed = false;
  let removalStarted!: () => void;
  let releaseRemoval!: () => void;
  const started = new Promise<void>((resolve) => {
    removalStarted = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseRemoval = resolve;
  });

  const removal = withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    removalStarted();
    await held;
    account = null;
  });
  await started;

  const approval = commitErc7715GrantForPinnedAccount({
    pinned,
    loadAccount: async () => account,
    commit: async () => {
      committed = true;
    },
  });
  releaseRemoval();
  await removal;

  await assert.rejects(approval, /account is no longer valid/i);
  assert.equal(committed, false);
});

test("account conversion or replacement cannot inherit an already-signed grant", async () => {
  for (const replacement of [
    { ...privateKeyAccount(), type: "seedPhrase" },
    {
      ...privateKeyAccount(),
      address: "0x2222222222222222222222222222222222222222",
    },
  ] as Account[]) {
    let committed = false;
    await assert.rejects(
      commitErc7715GrantForPinnedAccount({
        pinned,
        loadAccount: async () => replacement,
        commit: async () => {
          committed = true;
        },
      }),
      /account is no longer valid/i,
    );
    assert.equal(committed, false);
  }
});

test("production ERC-7715 approval uses the account-bound commit helper", async () => {
  const source = await readFile(
    new URL("../../src/chrome/erc7715/confirmation.ts", import.meta.url),
    "utf8",
  );
  const confirmStart = source.indexOf(
    "export async function handleConfirmErc7715PermissionRequest",
  );
  const rejectStart = source.indexOf(
    "export async function handleRejectErc7715PermissionRequest",
    confirmStart,
  );
  const confirm = source.slice(confirmStart, rejectStart);
  assert.match(confirm, /commitErc7715GrantForPinnedAccount/);
  assert.match(confirm, /accountId: pending\.accountId/);
  assert.match(confirm, /accountAddress: pending\.accountAddress/);
  assert.match(confirm, /accountType: pending\.accountType/);
});
