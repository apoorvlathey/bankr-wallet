import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canPrepareTransactionReplacement } from "../../src/components/TransactionDetails/transactionReplacementModel";

const pending = (accountType: string) => ({
  id: "tx",
  status: "pending",
  txHash: `0x${"ab".repeat(32)}`,
  tx: { from: "0x1111111111111111111111111111111111111111", to: null, chainId: 1 },
  origin: "WalletChan",
  favicon: null,
  chainName: "Ethereum",
  chainId: 1,
  createdAt: 1,
  accountType,
}) as any;

test("pending replacement actions are visible only for local and Ledger signers", () => {
  for (const type of ["privateKey", "seedPhrase", "ledger"]) {
    assert.equal(canPrepareTransactionReplacement(pending(type)), true, type);
  }
  for (const type of ["bankr", "impersonator"]) {
    assert.equal(canPrepareTransactionReplacement(pending(type)), false, type);
  }
  assert.equal(canPrepareTransactionReplacement({ ...pending("privateKey"), status: "success" }), false);
  assert.equal(canPrepareTransactionReplacement({ ...pending("ledger"), feePaymentToken: "USDC" }), false);
  assert.equal(canPrepareTransactionReplacement({ ...pending("ledger"), replacedByTxId: "new" }), false);
});

test("speed-up review retains normal transaction content while cancel stays quiet", async () => {
  const [confirmation, context, notice] = await Promise.all([
    readFile(
      new URL(
        "../../src/components/TransactionConfirmation/TransactionConfirmation.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/TransactionConfirmation/TransactionContext.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/TransactionConfirmation/ReplacementNotice.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(confirmation, /Speed up pending transaction/);
  assert.match(context, /replacement\?\.kind === "speedUp"/);
  assert.doesNotMatch(notice, /Sends 0 wei/);
  assert.match(notice, /Resubmits the pending transaction/);
});

test("pending replacement actions stay compact and use the amber commitment", async () => {
  const actions = await readFile(
    new URL(
      "../../src/components/TransactionDetails/PendingTransactionActions.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(actions, /justify="center"/);
  assert.match(actions, /variant="brand"/);
  assert.match(actions, /size="xs"/);
  assert.match(actions, /minH="32px"/);
  assert.doesNotMatch(actions, /variant="primary"/);
  assert.doesNotMatch(actions, /flex=\{1\}/);
});

test("pending details and replacement exits return to Activity", async () => {
  const [app, portfolio] = await Promise.all([
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../../src/components/PortfolioTabs.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.equal(app.match(/returnToActivity\(\)/g)?.length, 3);
  assert.match(
    app,
    /selectedTxRequest\?\.replacement[\s\S]*?preNavigatedRef\.current = true;[\s\S]*?returnToActivity\(\)/,
  );
  assert.match(app, /selectedTxRequest\.replacement[\s\S]*?returnToActivity\(\)/);
  assert.match(app, /wasUserRejected && !selectedTxRequest\.replacement/);
  assert.match(portfolio, /activityTabTrigger > holdingsTabTrigger/);
  assert.match(portfolio, /holdingsTabTrigger > activityTabTrigger/);
});
