import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared signer identity uses the Ledger mark when ENS has no avatar", async () => {
  const source = await readFile(
    new URL("../../src/components/FromAccountDisplay.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /import \{ LedgerAvatar \} from "@\/components\/Ledger\/LedgerAvatar"/,
  );
  assert.match(
    source,
    /ens\?\.avatar[\s\S]*?fromAccount\?\.type === "bankr"[\s\S]*?fromAccount\?\.type === "ledger"[\s\S]*?<LedgerAvatar size=\{20\} \/>[\s\S]*?blo\(/,
  );
});

test("transaction and signature decision rows share the central signer identity", async () => {
  const sources = await Promise.all(
    [
      "../../src/components/TransactionConfirmation/TransactionDecisionSummary.tsx",
      "../../src/components/SignatureConfirmation/SignatureDecisionSummary.tsx",
      "../../src/components/BatchConfirmation/BatchDecisionSummary.tsx",
      "../../src/components/Swap/SwapDecisionSummary.tsx",
      "../../src/components/Erc7715PermissionConfirmation/PermissionDecisionSummary.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const source of sources) {
    assert.match(source, /<FromAccountDisplay /);
  }
});
