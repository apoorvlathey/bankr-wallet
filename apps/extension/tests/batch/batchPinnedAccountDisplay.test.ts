import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("batch confirmation renders and simulates the account pinned with the stored request", async () => {
  const [appSource, confirmationSource] = await Promise.all([
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../src/components/BatchConfirmation/BatchTransactionConfirmation.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  const viewStart = appSource.indexOf(
    'if (view === "batchTxConfirm" && selectedBatchRequest)',
  );
  const viewEnd = appSource.indexOf(
    "// Cross-dapp batch confirmation view",
    viewStart,
  );
  const batchView = appSource.slice(viewStart, viewEnd);

  assert.ok(viewStart >= 0);
  assert.match(
    batchView,
    /const storedBatchAccount = selectedBatchRequest\.accountId[\s\S]*accounts\.find\(\(account\) => account\.id === selectedBatchRequest\.accountId\)/,
    "an account id from a compatibility record must resolve before consulting the active account",
  );
  assert.match(
    batchView,
    /selectedBatchRequest\.accountAddress \?\?[\s\S]*storedBatchAccount\?\.address \?\?[\s\S]*\(selectedBatchRequest\.accountId \? "" : address\)/,
  );
  assert.match(
    batchView,
    /selectedBatchRequest\.accountType \?\?[\s\S]*toLegacyAccountType\(storedBatchAccount\?\.type\) \?\?[\s\S]*toLegacyAccountType\(activeAccount\?\.type\)/,
    "a Safe account must never fall through the legacy EOA/API batch renderer",
  );
  assert.match(batchView, /accountAddress=\{batchAccountAddress\}/);
  assert.match(batchView, /accountType=\{batchAccountType\}/);
  assert.doesNotMatch(
    batchView,
    /selectedBatchRequest\.accountId[\s\S]{0,120}\? address/,
    "a stale/missing pinned id must fail closed instead of silently switching accounts",
  );
  assert.match(
    confirmationSource,
    /const fromAddress = params\.from \|\| accountAddress;/,
    "the same pinned prop must drive omitted-from batch simulation and display",
  );
});
