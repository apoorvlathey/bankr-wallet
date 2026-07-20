import assert from "node:assert/strict";
import test from "node:test";

import {
  getPrivateWithdrawalCopy,
  parseUnshieldResponse,
  validateUnshieldInput,
} from "../../src/components/Shield/model/unshield";

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

test("Unshield and private Send expose one consistent intent-copy contract", () => {
  assert.deepEqual(getPrivateWithdrawalCopy("unshield"), {
    title: "Unshield",
    recipientLabel: "Receive at",
    recipientPickerTitle: "Choose address",
    recipientChooserLabel: "Choose address",
    reviewLabel: "Review unshield",
    sourceAmountLabel: "From private balance",
    outcomeAmountLabel: "You receive",
    availableBalanceLabel: "Available to unshield",
    confirmLabel: "Unshield",
    recipientContextLabel: "unshield recipient",
  });
  assert.deepEqual(getPrivateWithdrawalCopy("send"), {
    title: "Send privately",
    recipientLabel: "Recipient",
    recipientPickerTitle: "My contacts",
    recipientChooserLabel: "My contacts",
    reviewLabel: "Review private send",
    sourceAmountLabel: "From private balance",
    outcomeAmountLabel: "Recipient receives",
    availableBalanceLabel: "Available to send privately",
    confirmLabel: "Send privately",
    recipientContextLabel: "private-send recipient",
  });
  assert.equal(Object.isFrozen(getPrivateWithdrawalCopy("unshield")), true);
  assert.equal(Object.isFrozen(getPrivateWithdrawalCopy("send")), true);
});

test("renderer accepts only the public Unshield projection", () => {
  assert.ok(parseUnshieldResponse({ success: true, operation: operation() }));
  assert.equal(
    parseUnshieldResponse({
      success: true,
      operation: { ...operation(), expectedSpentNullifier: "secret-link" },
    }),
    null,
  );
});
