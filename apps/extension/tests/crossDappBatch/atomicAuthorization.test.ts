import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cross-dapp atomic paths gate every authorization tuple", async () => {
  const source = await readFile(
    new URL("../../src/chrome/crossDappBatch/local.ts", import.meta.url),
    "utf8",
  );
  const signAt = source.indexOf("const auth = await signEip7702Authorization");
  const guardAt = source.lastIndexOf(
    "assertAutomaticEip7702AuthorizationAllowed",
    signAt,
  );
  const branchAt = source.lastIndexOf("if (needsAuthorization)", signAt);
  assert.ok(signAt > 0, "cross-dapp path must sign an authorization");
  assert.ok(
    branchAt >= 0 && guardAt > branchAt && guardAt < signAt,
    "cross-dapp path must reject custom reauthorization before signing",
  );
});
