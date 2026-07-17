import assert from "node:assert/strict";
import test from "node:test";
import { needsLocalAccountBiometricUpgrade } from "../../src/components/AddAccount/model/biometricGateModel";

test("local account setup is blocked for signing-only legacy biometrics", () => {
  assert.equal(
    needsLocalAccountBiometricUpgrade({
      configured: true,
      mnemonicCapable: false,
    }),
    true,
  );
  assert.equal(needsLocalAccountBiometricUpgrade({ configured: true }), true);
});

test("local account setup remains available without biometrics or with full access", () => {
  assert.equal(
    needsLocalAccountBiometricUpgrade({
      configured: true,
      mnemonicCapable: true,
    }),
    false,
  );
  assert.equal(needsLocalAccountBiometricUpgrade({ configured: false }), false);
  assert.equal(needsLocalAccountBiometricUpgrade(undefined), false);
});
