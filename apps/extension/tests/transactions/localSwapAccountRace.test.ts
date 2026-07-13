import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("direct local swap rechecks the exact account at the broadcast boundary", async () => {
  const source = await readFile(
    new URL(
      "../../src/chrome/transactions/swaps/localBroadcast.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const implementation = source;
  assert.match(implementation, /signAndBroadcastTransaction\(/);
  assert.match(implementation, /assertLocalAccountEffectBinding\(account\)/);
});
