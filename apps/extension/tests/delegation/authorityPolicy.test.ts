import assert from "node:assert/strict";
import test from "node:test";

import { EIP_7702_DEFAULT_DELEGATE } from "../../src/constants/chainRegistry";
import {
  assertAutomaticEip7702AuthorizationAllowed,
  captureEip7702DelegationAuthorization,
  CUSTOM_DELEGATE_REAUTHORIZATION_ERROR,
  requiresMasterForEip7702Delegation,
} from "../../src/chrome/delegatedAuthorityPolicy";

const CUSTOM = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";

test("only custom Set expands authority to the master-only policy", async () => {
  assert.equal(
    requiresMasterForEip7702Delegation({
      targetDelegate: CUSTOM,
      kind: "setDelegate",
    }),
    true,
  );
  assert.equal(
    requiresMasterForEip7702Delegation({
      targetDelegate: EIP_7702_DEFAULT_DELEGATE,
      kind: "setDelegate",
    }),
    false,
  );
  assert.equal(
    requiresMasterForEip7702Delegation({
      targetDelegate: ZERO,
      kind: "revoke",
    }),
    false,
  );
  assert.equal(
    await captureEip7702DelegationAuthorization({
      targetDelegate: EIP_7702_DEFAULT_DELEGATE,
      kind: "setDelegate",
    }),
    undefined,
  );
  assert.equal(
    await captureEip7702DelegationAuthorization({
      targetDelegate: ZERO,
      kind: "revoke",
    }),
    undefined,
  );
});

test("automatic repair remains canonical-default-only", () => {
  assert.doesNotThrow(() =>
    assertAutomaticEip7702AuthorizationAllowed(EIP_7702_DEFAULT_DELEGATE),
  );
  assert.throws(
    () => assertAutomaticEip7702AuthorizationAllowed(CUSTOM),
    (error: unknown) =>
      error instanceof Error &&
      error.message === CUSTOM_DELEGATE_REAUTHORIZATION_ERROR,
  );
});
