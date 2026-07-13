import assert from "node:assert/strict";
import test from "node:test";

import { WALLET_SECRET_OPERATION_LOCK_KEY } from "../../src/chrome/storageLock";
import { buildDelegationRequest } from "../../src/chrome/delegation/requestConstruction";
import { createDelegationRequestQueue } from "../../src/chrome/delegation/requestQueue";

const ACCOUNT = {
  id: "account-1",
  type: "privateKey" as const,
  address: "0xAa00000000000000000000000000000000000001",
  createdAt: 1,
};
const TARGET = "0xBb00000000000000000000000000000000000002" as const;

test("delegation request construction pins exact self-call and display fields", () => {
  const request = buildDelegationRequest(ACCOUNT, {
    id: "setDelegate7702:account-1:8453:100",
    chainId: 8453,
    chainName: "Base",
    targetDelegate: TARGET,
    kind: "setDelegate",
    timestamp: 200,
  });
  assert.deepEqual(request, {
    id: "setDelegate7702:account-1:8453:100",
    tx: {
      from: ACCOUNT.address,
      to: ACCOUNT.address,
      data: "0x",
      value: "0x0",
      chainId: 8453,
      gas: "0xC350",
    },
    origin: "WalletChan",
    favicon: null,
    chainName: "Base",
    timestamp: 200,
    trustedInternal: true,
    delegation7702Meta: {
      targetDelegate: TARGET,
      kind: "setDelegate",
    },
    accountId: ACCOUNT.id,
    accountAddress: ACCOUNT.address.toLowerCase(),
    accountType: ACCOUNT.type,
  });
});

test("custom request queue rechecks epoch under the operation lock before notification", async () => {
  const request = buildDelegationRequest(ACCOUNT, {
    id: "request-1",
    chainId: 1,
    chainName: "Ethereum",
    targetDelegate: TARGET,
    kind: "setDelegate",
    timestamp: 1,
  });
  const events: unknown[] = [];
  const queue = createDelegationRequestQueue({
    savePendingTxRequest: (async (saved, epoch) => {
      events.push(["save", saved.id, epoch]);
    }) as never,
    withStorageLock: (async (key, operation) => {
      events.push(["lock:start", key]);
      const result = await operation();
      events.push(["lock:end", key]);
      return result;
    }) as never,
    notifyPendingRequest: (saved) => {
      events.push(["notify", saved.id]);
    },
  });
  await queue(request, "auth-epoch-1");
  assert.deepEqual(events, [
    ["lock:start", WALLET_SECRET_OPERATION_LOCK_KEY],
    ["save", "request-1", "auth-epoch-1"],
    ["lock:end", WALLET_SECRET_OPERATION_LOCK_KEY],
    ["notify", "request-1"],
  ]);
});

test("routine queue skips the master lock and failed persistence never notifies", async () => {
  const request = buildDelegationRequest(ACCOUNT, {
    id: "request-2",
    chainId: 1,
    chainName: "Ethereum",
    targetDelegate: TARGET,
    kind: "revoke",
    timestamp: 1,
  });
  let notified = false;
  const queue = createDelegationRequestQueue({
    savePendingTxRequest: (async () => {
      throw new Error("storage failed");
    }) as never,
    withStorageLock: (async () => {
      throw new Error("routine queue must not lock master authority");
    }) as never,
    notifyPendingRequest: () => {
      notified = true;
    },
  });
  await assert.rejects(queue(request), /storage failed/);
  assert.equal(notified, false);
});
