import assert from "node:assert/strict";
import test from "node:test";

import { loadInitialApprovalRequestsWith } from "../../src/app/initialApprovalRequests";
import {
  applyInitialApprovalRoute,
  resolveHintedInitialApprovalRoute,
} from "../../src/app/initialApprovalRoute";

function immediateDependencies() {
  let now = 0;
  return {
    now: () => now,
    delay: async (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

test("cold approval bootstrap loads every request family once without a hint", async () => {
  const calls = [0, 0, 0, 0, 0];
  const lists = await loadInitialApprovalRequestsWith(
    null,
    [0, 1, 2, 3, 4].map(
      (index) => async () => {
        calls[index] += 1;
        return [{ index }];
      },
    ) as any,
    immediateDependencies(),
  );

  assert.deepEqual(calls, [1, 1, 1, 1, 1]);
  assert.deepEqual(lists.map((list) => list[0]), [
    { index: 0 },
    { index: 1 },
    { index: 2 },
    { index: 3 },
    { index: 4 },
  ]);
});

test("hinted approval keeps loading until the matching queue is populated", async () => {
  const calls = [0, 0, 0, 0, 0];
  const loaders = [0, 1, 2, 3, 4].map(
    (index) => async () => {
      calls[index] += 1;
      if (index === 1 && calls[index] === 2) return [{ id: "sig-1" }];
      return [];
    },
  ) as any;

  const lists = await loadInitialApprovalRequestsWith(
    { requestType: "i_signatureRequest", createdAt: 0 },
    loaders,
    immediateDependencies(),
  );

  assert.deepEqual(calls, [1, 2, 1, 1, 1]);
  assert.deepEqual(lists[1], [{ id: "sig-1" }]);
});

test("hinted approval does not poll when the initial queue read already finds it", async () => {
  const calls = [0, 0, 0, 0, 0];
  const loaders = [0, 1, 2, 3, 4].map(
    (index) => async () => {
      calls[index] += 1;
      return index === 3 ? [{ id: "batch-1" }] : [];
    },
  ) as any;

  const lists = await loadInitialApprovalRequestsWith(
    { requestType: "i_walletSendCalls", createdAt: 0 },
    loaders,
    immediateDependencies(),
  );

  assert.deepEqual(calls, [1, 1, 1, 1, 1]);
  assert.deepEqual(lists[3], [{ id: "batch-1" }]);
});

test("hinted connection waits for the durable dapp request", async () => {
  const calls = [0, 0, 0, 0, 0];
  const loaders = [0, 1, 2, 3, 4].map(
    (index) => async () => {
      calls[index] += 1;
      if (index === 4 && calls[index] === 2) return [{ id: "connect-1" }];
      return [];
    },
  ) as any;

  const lists = await loadInitialApprovalRequestsWith(
    { requestType: "i_dappAccounts", createdAt: 0 },
    loaders,
    immediateDependencies(),
  );

  assert.deepEqual(calls, [1, 1, 1, 1, 2]);
  assert.deepEqual(lists[4], [{ id: "connect-1" }]);
});

test("hinted approval routing selects the newest request from every family", () => {
  const lists = [
    [{ id: "tx-old" }, { id: "tx-new" }],
    [{ id: "sig-old" }, { id: "sig-new" }],
    [{ id: "permission-old" }, { id: "permission-new" }],
    [{ id: "batch-old" }, { id: "batch-new" }],
    [{ id: "connect-old" }, { id: "connect-new" }],
  ] as any;
  const cases = [
    ["i_sendTransaction", "transaction", "tx-new"],
    ["i_signatureRequest", "signature", "sig-new"],
    ["i_walletExecutionPermissions", "permission", "permission-new"],
    ["i_walletSendCalls", "batch", "batch-new"],
    ["i_dappAccounts", "dappConnection", "connect-new"],
  ] as const;

  for (const [requestType, kind, id] of cases) {
    const route = resolveHintedInitialApprovalRoute(
      { requestType, createdAt: 0 },
      lists,
    );
    assert.equal(route?.kind, kind);
    assert.equal(route?.request.id, id);
  }
});

test("every hinted family opens its matching confirmation view", () => {
  const selected: string[] = [];
  const views: string[] = [];
  const setters = {
    setTransaction: (request: any) => selected.push(`tx:${request.id}`),
    setSignature: (request: any) => selected.push(`sig:${request.id}`),
    setPermission: (request: any) => selected.push(`permission:${request.id}`),
    setBatch: (request: any) => selected.push(`batch:${request.id}`),
    setDappConnection: (request: any) => selected.push(`connect:${request.id}`),
    setView: (view: any) => views.push(view),
  };
  const routes = [
    { kind: "transaction", request: { id: "tx" } },
    { kind: "signature", request: { id: "sig" } },
    { kind: "permission", request: { id: "permission" } },
    { kind: "batch", request: { id: "batch" } },
    { kind: "dappConnection", request: { id: "connect" } },
  ] as any[];

  for (const route of routes) applyInitialApprovalRoute(route, setters);

  assert.deepEqual(selected, [
    "tx:tx",
    "sig:sig",
    "permission:permission",
    "batch:batch",
    "connect:connect",
  ]);
  assert.deepEqual(views, [
    "txConfirm",
    "signatureConfirm",
    "erc7715PermissionConfirm",
    "batchTxConfirm",
    "dappConnectionConfirm",
  ]);
});
