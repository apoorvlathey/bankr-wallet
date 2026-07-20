import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { CompletedTransaction } from "../../src/chrome/txHistoryStorage";
import {
  formatActivityAmount,
  formatActivityFunctionName,
  getActivityPresentation,
  getActivityStatusModel,
  groupActivityByDate,
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

test("cancellation activity uses the wallet action without redundant context", () => {
  const presentation = getActivityPresentation(
    transaction({
      origin: "WalletChan",
      functionName: "Cancel Transaction",
      replacement: {
        kind: "cancel",
        originalTxId: "original",
        originalTxHash: `0x${"ab".repeat(32)}`,
        nonce: 7,
        minimumMaxFeePerGas: "100",
        minimumMaxPriorityFeePerGas: "10",
      },
    }),
  );

  assert.equal(presentation.intent, "Cancel Transaction");
  assert.equal(presentation.context, "");
  assert.equal(presentation.value, null);
});

test("context-free activity rows vertically center their title with the mark", async () => {
  const source = await readFile(
    new URL(
      "../../src/components/Activity/ActivityItem.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /gridRow=\{!presentation\.context \? "1 \/ span 2" : undefined\}/,
  );
  assert.match(source, /minH=\{!presentation\.context \? "40px" : undefined\}/);
});
