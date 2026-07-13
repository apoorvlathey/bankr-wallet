import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { EIP_7702_DEFAULT_DELEGATE } from "../../src/constants/chainRegistry";
import {
  assertAutomaticEip7702AuthorizationAllowed,
  CUSTOM_DELEGATE_REAUTHORIZATION_ERROR,
} from "../../src/chrome/delegatedAuthorityPolicy";

test("automatic EIP-7702 repair is canonical-default-only", () => {
  assert.doesNotThrow(() =>
    assertAutomaticEip7702AuthorizationAllowed(EIP_7702_DEFAULT_DELEGATE),
  );
  assert.throws(
    () =>
      assertAutomaticEip7702AuthorizationAllowed(
        "0x1111111111111111111111111111111111111111",
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === CUSTOM_DELEGATE_REAUTHORIZATION_ERROR,
  );
});

test("regular atomic paths gate every authorization tuple", async () => {
  const source = await readFile(
    new URL(
      "../../src/chrome/batch/batchAtomic7702Execution.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const signAt = source.indexOf("const auth = await signEip7702Authorization");
  const guardAt = source.lastIndexOf(
    "assertAutomaticEip7702AuthorizationAllowed",
    signAt,
  );
  const branchAt = source.lastIndexOf("if (needsAuthorization)", signAt);
  assert.ok(signAt > 0, "regular path must sign an authorization");
  assert.ok(
    branchAt >= 0 && guardAt > branchAt && guardAt < signAt,
    "regular path must reject custom reauthorization before signing",
  );
});
