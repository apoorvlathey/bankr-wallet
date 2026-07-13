import assert from "node:assert/strict";
import test from "node:test";
import type { CompletedTransaction } from "../../src/chrome/txHistoryStorage";
import {
  formatActivityAmount,
  getActivityPresentation,
  getActivityStatusModel,
  groupActivityByDate,
} from "../../src/components/Activity/activityModel";

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
  assert.equal(formatActivityAmount("1234.5000009"), "1,234.500000");
  assert.equal(formatActivityAmount("10000000000"), "10.00B");
  assert.equal(formatActivityAmount("12300000000000"), "1.23e13");
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
