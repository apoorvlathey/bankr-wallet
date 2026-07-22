import assert from "node:assert/strict";
import test from "node:test";

import {
  formatRelayFeePercentage,
  getUnshieldPrefillAmount,
  getUnshieldCopy,
  parseUnshieldRelayFeeWarning,
  parseUnshieldResponse,
  validateUnshieldAmount,
  validateUnshieldInput,
} from "../../src/components/Shield/model/unshield";

test("transaction-detail Unshield entry preserves the exact shielded amount", () => {
  assert.equal(getUnshieldPrefillAmount({
    operationId: "00000000-0000-4000-8000-000000000001",
    shieldedAmountWei: "10000000000000001",
  }), "0.010000000000000001");
  assert.equal(getUnshieldPrefillAmount({
    operationId: "not-an-operation",
    shieldedAmountWei: "10000000000000001",
  }), "");
  assert.equal(getUnshieldPrefillAmount({
    operationId: "00000000-0000-4000-8000-000000000001",
    shieldedAmountWei: "0",
  }), "");
});

function operation() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    state: "quote_ready",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    chainId: 11_155_111,
    amountWei: "100000000000000000",
    netRecipientAmountWei: "99900000000000000",
    relayFeeWei: "100000000000000",
    feeBPS: "10",
    recipient: "0x2222222222222222222222222222222222222222",
    relayerName: "Testnet Relay",
    expiresAt: 60_001,
    recipientMatchesDepositor: false,
    txHash: null,
    blockNumber: null,
    errorCode: null,
  };
}

test("Unshield input accepts exact ETH and checksum-normalizes the recipient", () => {
  const result = validateUnshieldInput(
    "0.1",
    "0x2222222222222222222222222222222222222222",
    1_000_000_000_000_000_000n,
  );
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.amountWei, 100_000_000_000_000_000n);
  assert.equal(validateUnshieldInput("1.1", "0x2222222222222222222222222222222222222222", 1_000_000_000_000_000_000n).valid, false);
});

test("Unshield amount validation stays independent from the empty recipient", () => {
  const availableWei = 5_000_000_000_000_000n;
  const amount = validateUnshieldAmount("0.0025", availableWei);

  assert.equal(amount.valid, true);
  if (amount.valid) assert.equal(amount.amountWei, 2_500_000_000_000_000n);
  assert.equal(validateUnshieldInput("0.0025", "", availableWei).valid, false);
  assert.equal(validateUnshieldAmount("0.0051", availableWei).valid, false);
});

test("Unshield exposes one consistent route-copy contract", () => {
  assert.deepEqual(getUnshieldCopy(), {
    title: "Unshield",
    recipientLabel: "Receive at",
    recipientPickerTitle: "Choose address",
    recipientChooserLabel: "Address",
    reviewLabel: "Review unshield",
    sourceAmountLabel: "From private balance",
    outcomeAmountLabel: "Receiver amount",
    availableBalanceLabel: "Available to unshield",
    confirmLabel: "Unshield",
    recipientContextLabel: "unshield recipient",
  });
  assert.equal(Object.isFrozen(getUnshieldCopy()), true);
});

test("renderer accepts only the public Unshield projection", () => {
  assert.equal(
    parseUnshieldResponse({ success: true, operation: operation() })?.method,
    "relay",
  );
  assert.equal(
    parseUnshieldResponse({
      success: true,
      operation: { ...operation(), expectedSpentNullifier: "secret-link" },
    }),
    null,
  );
});

test("renderer accepts the bounded receiver-paid Unshield projection", () => {
  const direct = {
    ...operation(),
    method: "direct",
    state: "awaiting_wallet_confirmation",
    netRecipientAmountWei: "100000000000000000",
    relayFeeWei: "0",
    feeBPS: "0",
    relayerName: "None",
    accountId: "seed-1",
    accountAddress: "0x2222222222222222222222222222222222222222",
    accountType: "seedPhrase",
    gasLimit: "300000",
    maxFeePerGas: "1000000000",
    gasFeeEstimateWei: "300000000000000",
  };
  const parsed = parseUnshieldResponse({ success: true, operation: direct });
  assert.equal(parsed?.method, "direct");
  assert.equal(parsed?.accountType, "seedPhrase");
  assert.equal(parsed?.gasFeeEstimateWei, 300_000_000_000_000n);
  assert.equal(parseUnshieldResponse({
    success: true,
    operation: { ...direct, callData: "must-not-render" },
  }), null);
});

test("over-cap relay quotes become bounded warnings with exact percentages", () => {
  const response = {
    success: false,
    code: "relay-fee-cap-exceeded",
    warning: {
      kind: "relay-fee-cap-exceeded",
      relayerName: "Testnet Relay",
      quotedFeeBPS: "2788",
      maxFeeBPS: "100",
    },
  };
  assert.deepEqual(parseUnshieldRelayFeeWarning(response), {
    kind: "relay-fee-cap-exceeded",
    relayerName: "Testnet Relay",
    quotedFeeBPS: 2788n,
    maxFeeBPS: 100n,
  });
  assert.equal(formatRelayFeePercentage(2788n), "27.88%");
  assert.equal(formatRelayFeePercentage(100n), "1%");
  assert.equal(formatRelayFeePercentage(10n), "0.1%");
  assert.deepEqual(parseUnshieldRelayFeeWarning({
    ...response,
    warning: { ...response.warning, quotedFeeBPS: "10750" },
  }), {
    kind: "relay-fee-cap-exceeded",
    relayerName: "Testnet Relay",
    quotedFeeBPS: 10_750n,
    maxFeeBPS: 100n,
  });
  assert.equal(parseUnshieldRelayFeeWarning({
    ...response,
    error: "No valid relayer quote",
  }), null);
  assert.equal(parseUnshieldRelayFeeWarning({
    ...response,
    warning: { ...response.warning, relayerName: "Unpinned Relay" },
  }), null);
});
