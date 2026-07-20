import assert from "node:assert/strict";
import test from "node:test";
import type { CompletedTransaction } from "../../src/chrome/txHistoryStorage";
import {
  formatActivityAmount,
  formatActivityFunctionName,
  getActivityPresentation,
  getActivityStatusModel,
  groupActivityByDate,
  isShieldActivityTransaction,
} from "../../src/components/Activity/activityModel";
import { buildActivityAddressLabels } from "../../src/components/Activity/activityIdentityModel";

const transaction = (
  overrides: Partial<CompletedTransaction>,
): CompletedTransaction =>
  ({
    id: "tx",
    createdAt: 0,
    origin: "https://app.example.com",
    chainId: 8453,
    chainName: "Base",
    status: "success",
    tx: { from: "0x0000000000000000000000000000000000000001" },
    ...overrides,
  }) as CompletedTransaction;

test("activity amount formatting stays compact without losing ordinary precision", () => {
  assert.equal(formatActivityAmount("1234.5000009"), "1,234.5");
  assert.equal(formatActivityAmount("0.0000001234"), "0.0000001234");
  assert.equal(formatActivityAmount("0.0000001234", true), "0.0₆1234");
  assert.equal(formatActivityAmount("0.000000001337"), "0.000000001337");
  assert.equal(formatActivityAmount("0.000000001337", true), "0.0₈1337");
  assert.equal(formatActivityAmount("25.00000000000000001"), "25");
  assert.equal(formatActivityAmount("10000000000"), "10.00B");
  assert.equal(formatActivityAmount("12300000000000"), "1.23e13");
});

test("activity uses wei only for exact five-digit-or-smaller 18-decimal amounts", () => {
  const oneWei = getActivityPresentation(
    transaction({
      chainId: 8453,
      transferMeta: {
        recipient: "0x1111111111111111111111111111111111111111",
        amount: "0.000000000000000001",
        symbol: "ETH",
        tokenLogo: null,
      },
    }),
  );
  assert.equal(oneWei.value, "−1 wei");

  const maxWei = getActivityPresentation(
    transaction({
      chainId: 8453,
      transferMeta: {
        recipient: "0x1111111111111111111111111111111111111111",
        amount: "0.000000000000099999",
        symbol: "ETH",
        tokenLogo: null,
      },
    }),
  );
  assert.equal(maxWei.value, "−99,999 wei");

  const aboveWeiCutoff = getActivityPresentation(
    transaction({
      chainId: 8453,
      transferMeta: {
        recipient: "0x1111111111111111111111111111111111111111",
        amount: "0.0000000000001",
        symbol: "ETH",
        tokenLogo: null,
      },
    }),
  );
  assert.equal(aboveWeiCutoff.value, "−0.0000000000001 ETH");
  assert.equal(aboveWeiCutoff.compactValue, "−0.0₁₂1 ETH");
});

test("activity function labels use readable sentence case", () => {
  assert.equal(formatActivityFunctionName("setPrimaryName"), "Set primary name");
  assert.equal(formatActivityFunctionName("multicall"), "Multicall");
});

test("activity grouping labels today, yesterday, and older dates", () => {
  const today = new Date(2026, 6, 13, 12);
  const groups = groupActivityByDate(
    [
      transaction({ id: "today", createdAt: new Date(2026, 6, 13, 8).getTime() }),
      transaction({ id: "yesterday", createdAt: new Date(2026, 6, 12, 8).getTime() }),
      transaction({ id: "older", createdAt: new Date(2026, 6, 1, 8).getTime() }),
    ],
    today,
  );

  assert.deepEqual(groups.slice(0, 2).map((group) => group.label), [
    "Today",
    "Yesterday",
  ]);
  assert.equal(groups[2]?.txs[0]?.id, "older");
});

test("bridge and force-inclusion status remain independently represented", () => {
  const model = getActivityStatusModel(
    transaction({
      status: "pending",
      forceInclusionMeta: { l2Confirmed: false },
      bridge: { bungeeStatusCode: 3 },
    } as Partial<CompletedTransaction>),
  );

  assert.equal(model.isForcePendingL2, true);
  assert.equal(model.isBridge, true);
  assert.equal(model.bridgeFulfilled, true);
});

test("send presentation keeps intent, counterparty context, and signed value", () => {
  const presentation = getActivityPresentation(
    transaction({
      transferMeta: {
        amount: "1.25",
        symbol: "USDC",
      },
      clearSignedMeta: {
        kind: "transfer",
        tokenSymbol: "USDC",
        amount: "1.25",
        counterparty: "0x1111111111111111111111111111111111111111",
      },
    } as Partial<CompletedTransaction>),
  );

  assert.equal(presentation.intent, "Send USDC");
  assert.match(presentation.context, /To 0x1111\.\.\.1111/);
  assert.equal(presentation.value, "−1.25 USDC");
});

test("activity address labels rebuild from wallet names and live contacts", () => {
  const recipient = "0x1111111111111111111111111111111111111111";
  const account = {
    id: "recipient",
    type: "privateKey" as const,
    address: recipient,
    displayName: "Savings wallet",
    createdAt: 0,
  };
  const tx = transaction({
    transferMeta: {
      recipient,
      amount: "1.25",
      symbol: "USDC",
      tokenLogo: null,
    },
    clearSignedMeta: {
      kind: "transfer",
      tokenSymbol: "USDC",
      amount: "1.25",
      counterparty: recipient,
      counterpartyLabel: "Historical label",
    },
  });

  const accountLabels = buildActivityAddressLabels([account], []);
  assert.equal(
    getActivityPresentation(tx, accountLabels).context,
    "To Savings wallet · app.example.com",
  );

  const contactLabels = buildActivityAddressLabels([account], [
    { address: recipient, label: "Treasury contact" },
  ]);
  assert.equal(
    getActivityPresentation(tx, contactLabels).context,
    "To Treasury contact · app.example.com",
  );

  const editedLabels = buildActivityAddressLabels(
    [{ ...account, displayName: "Renamed wallet" }],
    [{ address: recipient, label: "Operations contact" }],
  );
  assert.equal(
    getActivityPresentation(tx, editedLabels).context,
    "To Operations contact · app.example.com",
  );
});

test("transfer-only history resolves its recipient from current identities", () => {
  const recipient = "0x2222222222222222222222222222222222222222";
  const tx = transaction({
    origin: "WalletChan",
    transferMeta: {
      recipient,
      amount: "0.5",
      symbol: "ETH",
      tokenLogo: null,
    },
  });
  const before = getActivityPresentation(tx);
  assert.equal(before.context, "To 0x2222...2222");

  const after = getActivityPresentation(
    tx,
    buildActivityAddressLabels(
      [
        {
          id: "new-account",
          type: "seedPhrase",
          address: recipient,
          displayName: "Newly added account",
          seedGroupId: "seed",
          derivationIndex: 1,
          createdAt: 0,
        },
      ],
      [],
    ),
  );
  assert.equal(after.context, "To Newly added account");
});

test("Shield activity presents amount and durable Privacy Pools progress", () => {
  const tx = transaction({
    id: "shield-operation",
    origin: "WalletChan Shield",
    chainId: 11_155_111,
    chainName: "Sepolia",
    privacyShieldMeta: {
      version: 1,
      operationId: "shield-operation",
      state: "awaiting_asp",
      updatedAt: 10,
      amountWei: "3000000000000000",
      shieldedAmountWei: "2970000000000000",
    },
  });

  assert.deepEqual(getActivityPresentation(tx), {
    originHostname: null,
    intent: "Shield ETH",
    context: "Waiting for eligibility",
    value: "−0.003 ETH",
    compactValue: "−0.003 ETH",
  });
  assert.deepEqual(getActivityStatusModel(tx).privacyShield, {
    context: "Waiting for eligibility",
    statusLabel: "Step 4 of 4",
    tone: "warning",
    pending: true,
  });

  const ready = {
    ...tx,
    privacyShieldMeta: {
      ...tx.privacyShieldMeta!,
      state: "private_ready" as const,
      updatedAt: 20,
    },
  };
  assert.equal(getActivityPresentation(ready).context, "Ready to Unshield");
  assert.equal(getActivityStatusModel(ready).privacyShield?.statusLabel, "Ready");

  const withdrawn = {
    ...tx,
    privacyShieldMeta: {
      ...tx.privacyShieldMeta!,
      state: "ragequit_recovered" as const,
      updatedAt: 30,
    },
  };
  assert.equal(getActivityPresentation(withdrawn).context, "Withdrawn publicly");
  assert.equal(
    getActivityStatusModel(withdrawn).privacyShield?.statusLabel,
    "Withdrawn",
  );
});

test("Shield recovery keeps the shared private activity identity", () => {
  const recovery = transaction({
    origin: "WalletChan Shield Recovery",
    chainId: 11_155_111,
    chainName: "Sepolia",
    functionName: "Recover Shield balance",
  });

  assert.equal(isShieldActivityTransaction(recovery), true);
  assert.equal(isShieldActivityTransaction(transaction({ origin: "WalletChan Shield" })), true);
  assert.equal(isShieldActivityTransaction(transaction({})), false);
  assert.deepEqual(getActivityPresentation(recovery), {
    originHostname: null,
    intent: "Shield Recovery",
    context: "Recover Shield balance",
    value: null,
    compactValue: null,
  });
});
