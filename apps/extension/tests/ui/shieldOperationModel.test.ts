import assert from "node:assert/strict";
import test from "node:test";

import {
  parseShieldOperationListResponse,
  parseShieldOperationResponse,
} from "../../src/components/Shield/model/shieldOperation";
import {
  getPublicWithdrawalCopy,
  getPublicWithdrawalOffer,
  parsePublicRecoveryPreviewsResponse,
} from "../../src/components/Shield/model/recovery";

const account = {
  id: "pk-1",
  type: "privateKey" as const,
  address: "0x1111111111111111111111111111111111111111",
};

function operation() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    revision: 0,
    state: "awaiting_wallet_confirmation",
    createdAt: 1,
    chainId: 11_155_111,
    accountId: account.id,
    accountAddress: account.address,
    accountType: account.type,
    amountWei: "100000000000000000",
    protocolFeeWei: "1000000000000000",
    shieldedAmountWei: "99000000000000000",
    gasReserveWei: "200000000000000",
    totalRequiredWei: "100200000000000000",
    destinationAddress: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
    poolAddress: "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
    txHash: null,
    blockNumber: null,
    errorCode: null,
  };
}

function portfolio() {
  return {
    status: "ready",
    confirmedBalanceWei: "99000000000000000",
    readyBalanceWei: "99000000000000000",
    maxPrivateSendWei: "99000000000000000",
    pendingBalanceWei: "0",
    recoverableBalanceWei: "0",
    attentionCount: 0,
    lastUpdatedAt: 2,
  };
}

function series() {
  return {
    priceUsd: 3400,
    totalValueUsd: 336.6,
    snapshots: [
      { timestamp: 1, totalValueUsd: 330 },
      { timestamp: 2, totalValueUsd: 336.6 },
    ],
  };
}

test("Shield operation response accepts only the pinned account and amount", () => {
  const response = {
    success: true,
    status: "awaiting_wallet_confirmation",
    operation: operation(),
  };
  const parsed = parseShieldOperationResponse(
    response,
    account,
    99_000_000_000_000_000n,
  );
  assert.ok(parsed);
  assert.equal(parsed.state, "awaiting_wallet_confirmation");

  response.operation.amountWei = "100000000000000001";
  assert.equal(
    parseShieldOperationResponse(
      response,
      account,
      99_000_000_000_000_000n,
    ),
    null,
  );
});

test("Shield activity accepts only aggregate private balance and public operations", () => {
  const recovery = {
    id: "00000000-0000-4000-8000-000000000004",
    state: "awaiting_wallet_confirmation",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    chainId: 11_155_111,
    amountWei: "1000",
    accountAddress: account.address,
    txHash: null,
    blockNumber: null,
    errorCode: null,
  };
  const valid = { success: true, operations: [operation()], portfolio: portfolio(), series: series(), withdrawals: [], recoveries: [recovery] };
  const parsed = parseShieldOperationListResponse(valid);
  assert.equal(parsed?.operations.length, 1);
  assert.equal(parsed?.recoveries.length, 1);
  assert.equal(parsed?.portfolio.confirmedBalanceWei, 99_000_000_000_000_000n);
  assert.equal(parsed?.portfolio.readyBalanceWei, 99_000_000_000_000_000n);

  const secret = operation() as any;
  secret.callData = "0xsecret";
  assert.equal(
    parseShieldOperationListResponse({
      success: true,
      operations: [secret],
      portfolio: portfolio(),
      series: series(),
      withdrawals: [],
      recoveries: [],
    }),
    null,
  );

  const mismatched = operation();
  mismatched.shieldedAmountWei = "1";
  assert.equal(
    parseShieldOperationListResponse({
      success: true,
      operations: [mismatched],
      portfolio: portfolio(),
      series: series(),
      withdrawals: [],
      recoveries: [],
    }),
    null,
  );
  assert.equal(
    parseShieldOperationListResponse({
      success: true,
      operations: [operation()],
      portfolio: { ...portfolio(), commitment: "123" },
      series: series(),
      withdrawals: [],
      recoveries: [],
    }),
    null,
  );
});

test("ASP-pending funds offer a plain-language public withdrawal", () => {
  assert.deepEqual(getPublicWithdrawalCopy(true), {
    title: "Need it now?",
    action: "Withdraw publicly",
  });
  assert.equal(
    getPublicWithdrawalCopy(false).title,
    "Public exit available",
  );
});

test("an indexed pending operation keeps public withdrawal visible before materialization", () => {
  const pending = {
    ...operation(),
    state: "awaiting_asp",
    shieldedAmountWei: 99_000_000_000_000_000n,
  };
  assert.deepEqual(getPublicWithdrawalOffer({
    account,
    recoverableBalanceWei: 0n,
    operations: [pending],
  }), {
    amountWei: pending.shieldedAmountWei,
    accountId: account.id,
    accountAddress: account.address,
    accountType: "privateKey",
    activeAccountMatches: true,
    sourceOperationId: pending.id,
  });
  assert.deepEqual(getPublicWithdrawalOffer({
    account: { ...account, id: "pk-2" },
    recoverableBalanceWei: 0n,
    operations: [pending],
  }), {
    amountWei: pending.shieldedAmountWei,
    accountId: account.id,
    accountAddress: account.address,
    accountType: "privateKey",
    activeAccountMatches: false,
    sourceOperationId: pending.id,
  });
  assert.deepEqual(getPublicWithdrawalOffer({
    account: { ...account, type: "bankr" },
    recoverableBalanceWei: pending.shieldedAmountWei,
    operations: [pending],
  }), {
    amountWei: pending.shieldedAmountWei,
    accountId: account.id,
    accountAddress: account.address,
    accountType: "privateKey",
    activeAccountMatches: false,
    sourceOperationId: pending.id,
  });
});

test("a ready commitment offers public withdrawal only after a relay fee-cap failure", () => {
  const ready = {
    ...operation(),
    state: "private_ready",
    shieldedAmountWei: 5_000_000_000_000_000n,
  };
  assert.equal(getPublicWithdrawalOffer({
    account,
    recoverableBalanceWei: 0n,
    operations: [ready],
  }), null);
  assert.deepEqual(getPublicWithdrawalOffer({
    account,
    recoverableBalanceWei: 0n,
    operations: [ready],
    allowPrivateReady: true,
  }), {
    amountWei: ready.shieldedAmountWei,
    accountId: account.id,
    accountAddress: account.address,
    accountType: "privateKey",
    activeAccountMatches: true,
    sourceOperationId: ready.id,
  });
});

test("ASP retry and Proof of Association states keep the exact deposit recoverable", () => {
  for (const state of ["asp_unavailable", "asp_poi_required"] as const) {
    const recoverable = {
      ...operation(),
      state,
      shieldedAmountWei: 99_000_000_000_000_000n,
    };
    assert.deepEqual(getPublicWithdrawalOffer({
      account,
      recoverableBalanceWei: 0n,
      operations: [recoverable],
    }), {
      amountWei: recoverable.shieldedAmountWei,
      accountId: account.id,
      accountAddress: account.address,
      accountType: "privateKey",
      activeAccountMatches: true,
      sourceOperationId: recoverable.id,
    });
  }
});

test("transaction-detail recovery selects only the clicked Shield operation", () => {
  const first = {
    ...operation(),
    state: "awaiting_asp",
    shieldedAmountWei: 3n,
    createdAt: 10,
  };
  const second = {
    ...first,
    id: "00000000-0000-4000-8000-000000000002",
    shieldedAmountWei: 2n,
    createdAt: 20,
  };
  assert.deepEqual(getPublicWithdrawalOffer({
    account,
    recoverableBalanceWei: 5n,
    operations: [first, second],
    preferredOperationId: second.id,
  }), {
    amountWei: 2n,
    accountId: account.id,
    accountAddress: account.address,
    accountType: "privateKey",
    activeAccountMatches: true,
    sourceOperationId: second.id,
  });
  assert.equal(getPublicWithdrawalOffer({
    account,
    recoverableBalanceWei: 5n,
    operations: [first],
    preferredOperationId: second.id,
  }), null);
});

test("public withdrawal amounts stay scoped to one depositing account", () => {
  const first = {
    ...operation(),
    state: "awaiting_asp",
    shieldedAmountWei: 3n,
    createdAt: 10,
  };
  const second = {
    ...operation(),
    id: "315c4871-4208-48de-b9ce-315b233a7301",
    accountId: "seed-2",
    accountAddress: "0x2222222222222222222222222222222222222222",
    accountType: "seedPhrase",
    state: "awaiting_asp",
    shieldedAmountWei: 2n,
    createdAt: 20,
  };
  assert.deepEqual(getPublicWithdrawalOffer({
    account: null,
    recoverableBalanceWei: 0n,
    operations: [first, second],
  }), {
    amountWei: 3n,
    accountId: first.accountId,
    accountAddress: first.accountAddress,
    accountType: "privateKey",
    activeAccountMatches: false,
    sourceOperationId: first.id,
  });
  assert.deepEqual(getPublicWithdrawalOffer({
    account: {
      id: second.accountId,
      address: second.accountAddress,
      type: second.accountType,
    },
    recoverableBalanceWei: second.shieldedAmountWei,
    operations: [first, second],
  }), {
    amountWei: 2n,
    accountId: second.accountId,
    accountAddress: second.accountAddress,
    accountType: "seedPhrase",
    activeAccountMatches: true,
    sourceOperationId: second.id,
  });
});

test("public exit offers one whole deposit instead of aggregating an account", () => {
  const first = {
    ...operation(),
    state: "awaiting_asp",
    shieldedAmountWei: 3n,
    createdAt: 10,
  };
  const second = {
    ...first,
    id: "00000000-0000-4000-8000-000000000002",
    shieldedAmountWei: 2n,
    createdAt: 20,
  };

  assert.deepEqual(getPublicWithdrawalOffer({
    account,
    recoverableBalanceWei: 5n,
    operations: [first, second],
  }), {
    amountWei: 3n,
    accountId: account.id,
    accountAddress: account.address,
    accountType: "privateKey",
    activeAccountMatches: true,
    sourceOperationId: first.id,
  });
});

test("public recovery preview accepts every bounded whole-commitment projection", () => {
  const response = {
    success: true,
    previews: [{
      commitmentId: "00000000-0000-4000-8000-000000000011",
      createdAt: 20,
      accountId: account.id,
      accountAddress: account.address,
      accountType: account.type,
      amountWei: "5000000000000000",
      originalAmountWei: "6000000000000000",
      withdrawnAmountWei: "1000000000000000",
      withdrawalCount: 1,
      sourceOperationId: "00000000-0000-4000-8000-000000000001",
    }, {
      commitmentId: "00000000-0000-4000-8000-000000000012",
      createdAt: 10,
      accountId: account.id,
      accountAddress: account.address,
      accountType: account.type,
      amountWei: "2000000000000000",
      originalAmountWei: "2000000000000000",
      withdrawnAmountWei: "0",
      withdrawalCount: 0,
      sourceOperationId: "00000000-0000-4000-8000-000000000002",
    }],
  };

  assert.deepEqual(parsePublicRecoveryPreviewsResponse(response), [
    {
      ...response.previews[0],
      amountWei: 5_000_000_000_000_000n,
      originalAmountWei: 6_000_000_000_000_000n,
      withdrawnAmountWei: 1_000_000_000_000_000n,
    },
    {
      ...response.previews[1],
      amountWei: 2_000_000_000_000_000n,
      originalAmountWei: 2_000_000_000_000_000n,
      withdrawnAmountWei: 0n,
    },
  ]);
  assert.equal(parsePublicRecoveryPreviewsResponse({
    ...response,
    previews: [{ ...response.previews[0], commitment: "secret" }],
  }), null);
  assert.equal(parsePublicRecoveryPreviewsResponse({
    ...response,
    previews: [{ ...response.previews[0], amountWei: "0" }],
  }), null);
  assert.equal(parsePublicRecoveryPreviewsResponse({
    ...response,
    previews: [response.previews[0], response.previews[0]],
  }), null);
  assert.deepEqual(parsePublicRecoveryPreviewsResponse({
    success: true,
    previews: [],
  }), []);
});
