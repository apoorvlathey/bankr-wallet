import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getMnemonicAccessRequirement,
  needsLocalAccountBiometricUpgrade,
} from "../../src/components/AddAccount/model/biometricGateModel";
import { ensureMnemonicAccessFromStatus } from "../../src/components/AddAccount/model/mnemonicAccessCoordinator";

test("Add account presents wallet types in the intended setup order", async () => {
  const source = await readFile(
    new URL("../../src/components/AddAccountTypeGrid.tsx", import.meta.url),
    "utf8",
  );
  const positions = [
    'type: "seedPhrase"',
    'type: "privateKey"',
    'type: "impersonator"',
    'type: "ledger"',
    'type: "safe"',
    'type: "bankr"',
  ].map((entry) => source.indexOf(entry));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
});

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

test("cold-restored V2 passkeys require a fresh assertion before seed actions", () => {
  assert.equal(
    getMnemonicAccessRequirement({
      configured: true,
      mnemonicCapable: true,
      mnemonicSessionReady: false,
    }),
    "passkey-step-up-required",
  );
  assert.equal(
    getMnemonicAccessRequirement({
      configured: true,
      mnemonicCapable: true,
      mnemonicSessionReady: true,
    }),
    "ready",
  );
  assert.equal(
    getMnemonicAccessRequirement({ configured: false }),
    "ready",
  );
});

test("unreleased V1 passkeys deliberately require full local-setup upgrade", () => {
  assert.equal(
    getMnemonicAccessRequirement({
      configured: true,
      mnemonicCapable: false,
      mnemonicSessionReady: false,
    }),
    "legacy-upgrade-required",
  );
});

test("cold V2 seed access performs one assertion and proves the live capability", async () => {
  const coldStatus = {
    configured: true,
    mnemonicCapable: true,
    mnemonicSessionReady: false,
    authCeremonyEpoch: "epoch",
    credentialId: "credential",
    prfSalt: "salt",
  };
  let unlockCalls = 0;
  let refreshCalls = 0;
  const result = await ensureMnemonicAccessFromStatus(
    coldStatus,
    async () => {
      refreshCalls++;
      return { ...coldStatus, mnemonicSessionReady: true };
    },
    async (status) => {
      unlockCalls++;
      assert.equal(status, coldStatus);
      return { success: true };
    },
  );

  assert.deepEqual(result, { ready: true });
  assert.equal(unlockCalls, 1);
  assert.equal(refreshCalls, 1);
});

test("seed access fails closed when assertion or capability recheck fails", async () => {
  const coldStatus = {
    configured: true,
    mnemonicCapable: true,
    mnemonicSessionReady: false,
  };
  let refreshCalls = 0;
  const rejected = await ensureMnemonicAccessFromStatus(
    coldStatus,
    async () => {
      refreshCalls++;
      return coldStatus;
    },
    async () => ({ success: false, error: "User cancelled" }),
  );
  assert.deepEqual(rejected, {
    ready: false,
    reason: "authentication-failed",
    failure: "verification",
    error: "User cancelled",
  });
  assert.equal(refreshCalls, 0);

  const missingCapability = await ensureMnemonicAccessFromStatus(
    coldStatus,
    async () => {
      refreshCalls++;
      return coldStatus;
    },
    async () => ({ success: true }),
  );
  assert.deepEqual(missingCapability, {
    ready: false,
    reason: "authentication-failed",
    failure: "capability",
    error:
      "Biometric verification succeeded, but seed phrase protection could not be unlocked.",
  });
  assert.equal(refreshCalls, 1);
});

test("ready and unreleased legacy states never invoke a passkey assertion", async () => {
  let unlockCalls = 0;
  const requestUnlock = async () => {
    unlockCalls++;
    return { success: true };
  };
  const refreshStatus = async () => ({ configured: false });

  assert.deepEqual(
    await ensureMnemonicAccessFromStatus(
      { configured: false },
      refreshStatus,
      requestUnlock,
    ),
    { ready: true },
  );
  assert.deepEqual(
    await ensureMnemonicAccessFromStatus(
      { configured: true, mnemonicCapable: false },
      refreshStatus,
      requestUnlock,
    ),
    { ready: false, reason: "legacy-upgrade-required" },
  );
  assert.equal(unlockCalls, 0);
});
