import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_SWAP_EXECUTION_MESSAGE_TYPES,
  createBackgroundSwapExecutionMessageRouter,
  type BackgroundSwapExecutionDependencies,
} from "../../src/chrome/background/swapExecutionRouter";

function dispatch(
  deps: BackgroundSwapExecutionDependencies,
  message: Record<string, unknown>,
): Promise<{ response: any; route: any }> {
  return new Promise((resolve) => {
    const router = createBackgroundSwapExecutionMessageRouter(deps);
    let route: any;
    route = router(message, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("swap execution declares one unique route set", () => {
  assert.equal(
    new Set(BACKGROUND_SWAP_EXECUTION_MESSAGE_TYPES).size,
    BACKGROUND_SWAP_EXECUTION_MESSAGE_TYPES.length,
  );
});

test("all swap paths enter the reset barrier before exact account-bound execution", async () => {
  const events: unknown[][] = [];
  const deps: BackgroundSwapExecutionDependencies = {
    runInternalIrreversibleOperation: async (resolve) => {
      events.push(["barrier"]);
      return resolve();
    },
    handleExecuteSwapDirect: async (...args) => {
      events.push(["direct", ...args]);
      return { success: true, kind: "direct" };
    },
    handleExecuteSwapBatch: async (...args) => {
      events.push(["batch", ...args]);
      return { success: true, kind: "batch" };
    },
    handleExecuteSwapAtomicPK: async (input) => {
      events.push(["atomic", input]);
      return { success: true, kind: "atomic" };
    },
  };
  const accountLock = { accountId: "account-1", fromAddress: "0xabc" };

  await dispatch(deps, {
    type: "executeSwapDirect",
    transactions: ["tx-a"],
    chainName: "Base",
    gasEstimates: ["gas-a"],
    ...accountLock,
  });
  await dispatch(deps, {
    type: "executeStakingDirect",
    transactions: ["tx-stake"],
    chainName: "Base",
    ...accountLock,
  });
  await dispatch(deps, {
    type: "executeSwapBatch",
    batchTx: "batch-tx",
    originalTransactions: ["tx-b"],
    chainId: 8453,
    chainName: "Base",
    ...accountLock,
  });
  await dispatch(deps, {
    type: "executeSwapAtomicPK",
    originalTransactions: ["tx-c"],
    chainId: 8453,
    chainName: "Base",
    gasOverrides: { maxFeePerGas: "0x1" },
    ...accountLock,
  });

  assert.deepEqual(events, [
    ["barrier"],
    ["direct", ["tx-a"], "Base", ["gas-a"], accountLock],
    ["barrier"],
    ["direct", ["tx-stake"], "Base", undefined, accountLock, { allowImpersonator: false }],
    ["barrier"],
    ["batch", "batch-tx", ["tx-b"], 8453, "Base", accountLock],
    ["barrier"],
    [
      "atomic",
      {
        originalTransactions: ["tx-c"],
        chainId: 8453,
        chainName: "Base",
        accountLock,
        gasOverrides: { maxFeePerGas: "0x1" },
      },
    ],
  ]);
});

test("a reset-barrier conflict prevents every swap execution path", async () => {
  let executions = 0;
  const deps: BackgroundSwapExecutionDependencies = {
    runInternalIrreversibleOperation: async () => ({
      success: false,
      error: "reset",
    }),
    handleExecuteSwapDirect: async () => {
      executions += 1;
    },
    handleExecuteSwapBatch: async () => {
      executions += 1;
    },
    handleExecuteSwapAtomicPK: async () => {
      executions += 1;
    },
  };

  for (const type of BACKGROUND_SWAP_EXECUTION_MESSAGE_TYPES) {
    const result = await dispatch(deps, { type });
    assert.deepEqual(result.response, { success: false, error: "reset" });
    assert.deepEqual(result.route, { handled: true, keepChannelOpen: true });
  }
  assert.equal(executions, 0);
});
