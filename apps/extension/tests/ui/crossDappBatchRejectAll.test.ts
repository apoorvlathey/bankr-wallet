import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cross-dapp Reject all reaches the global queue rejection handler", async () => {
  const [app, adapter] = await Promise.all([
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../../src/components/CrossDappBatchConfirmation.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(app, /<CrossDappBatchConfirmation[\s\S]*?onRejectAll=\{handleRejectAll\}/);
  assert.match(adapter, /onRejectAll:\s*\(\)\s*=>\s*void/);
  assert.match(adapter, /<BatchTransactionConfirmation[\s\S]*?onRejectAll=\{onRejectAll\}/);
  assert.doesNotMatch(adapter, /onRejectAll=\{onRejected\}/);
});
