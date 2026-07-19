import assert from "node:assert/strict";
import test from "node:test";

import { reviewedImpersonatedRpcTransaction } from "../../src/chrome/transactions/impersonatedExecution";
import type { PendingTxRequest } from "../../src/chrome/requests/pendingTxStorage";

const pending = {
  id: "impersonated-request",
  tx: {
    from: "0x1111111111111111111111111111111111111111",
    to: "0x2222222222222222222222222222222222222222",
    chainId: 1,
    data: "0x1234",
    value: "0x5",
    gas: "0x10000",
    gasPrice: "0x7",
  },
  origin: "https://dapp.example",
  favicon: null,
  chainName: "Ethereum",
  timestamp: 1,
  accountId: "view-only",
  accountAddress: "0x1111111111111111111111111111111111111111",
  accountType: "impersonator",
} satisfies PendingTxRequest;

test("impersonated submission uses the standard eth_sendTransaction object", () => {
  assert.deepEqual(reviewedImpersonatedRpcTransaction(pending), {
    from: pending.tx.from,
    to: pending.tx.to,
    data: "0x1234",
    value: "0x5",
    gas: "0x10000",
    gasPrice: "0x7",
  });
  assert.equal(
    "chainId" in reviewedImpersonatedRpcTransaction(pending),
    false,
    "chainId belongs to the selected RPC, not the transaction call object",
  );
});

test("review gas overrides replace legacy fee fields and deployments omit to", () => {
  assert.deepEqual(
    reviewedImpersonatedRpcTransaction(
      { ...pending, tx: { ...pending.tx, to: null } },
      {
        gasLimit: "0x5208",
        maxFeePerGas: "0x10",
        maxPriorityFeePerGas: "0x2",
      },
    ),
    {
      from: pending.tx.from,
      data: "0x1234",
      value: "0x5",
      gas: "0x5208",
      maxFeePerGas: "0x10",
      maxPriorityFeePerGas: "0x2",
    },
  );
});

test("confirmation fails closed when only an inactive RPC is opted in", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: Record<string, unknown> = {
    accounts: [{
      id: "view-only",
      type: "impersonator",
      address: pending.tx.from,
      createdAt: 1,
    }],
    pendingTxRequests: [pending],
    networkRpcUrls: {
      "1": [{
        url: "https://fork-rpc.example",
        allowImpersonatedTransactions: true,
      }],
    },
  };
  const sync: Record<string, unknown> = {
    networksInfo: {
      Ethereum: { chainId: 1, rpcUrl: "https://selected-rpc.example" },
    },
    chainName: "Ethereum",
  };
  const storageArea = (values: Record<string, unknown>) => ({
    async get(keys?: string | string[] | null) {
      if (keys == null) return structuredClone(values);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        list.map((key) => [key, structuredClone(values[key])]),
      );
    },
    async set(next: Record<string, unknown>) {
      Object.assign(values, structuredClone(next));
    },
  });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: { local: storageArea(local), sync: storageArea(sync) },
      runtime: { async sendMessage() {} },
    },
  });

  try {
    const { handleConfirmImpersonatedTransaction } = await import(
      "../../src/chrome/transactions/impersonatedExecution"
    );
    assert.deepEqual(
      await handleConfirmImpersonatedTransaction(pending.id),
      {
        success: false,
        error: "Enable impersonated transactions for the selected RPC first",
      },
    );
    assert.equal(
      (local.pendingTxRequests as PendingTxRequest[]).length,
      1,
      "policy failure keeps the prompt retryable",
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
