import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_PRIVACY_RECOVERY_MESSAGE_TYPES,
  createBackgroundPrivacyRecoveryMessageRouter,
} from "../../src/chrome/background/privacyRecoveryRouter";
import { PrivacyRecoveryError } from "../../src/chrome/privacy/recovery/operations";

function capture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { response, sendResponse: resolve };
}

test("privacy recovery router declares only explicit backup and rescan routes", () => {
  assert.deepEqual(BACKGROUND_PRIVACY_RECOVERY_MESSAGE_TYPES, [
    "privacyGetRecoveryStatus",
    "privacyRevealRecovery",
    "privacyRestoreRecovery",
    "privacyRescanRecovery",
  ]);
});

test("recovery status and rescan expose only bounded public state", async () => {
  const statusCapture = capture();
  const rescanCapture = capture();
  const route = createBackgroundPrivacyRecoveryMessageRouter({
    readPrivacyRecoveryStatus: async () => ({
      success: true,
      status: "ready",
      hasMasterRecovery: true,
      backupVerified: true,
    }),
    rescanPrivacyCommitmentsWithActiveIdentity: async () => ({
      status: "current",
      events: 3,
      recovered: 1,
      created: 1,
      scannedIndices: 257,
      nextDepositIndex: 1,
    }),
  });

  route({ type: "privacyGetRecoveryStatus" }, statusCapture.sendResponse);
  assert.deepEqual(await statusCapture.response, {
    success: true,
    status: "ready",
    hasMasterRecovery: true,
    backupVerified: true,
  });
  route({ type: "privacyRescanRecovery" }, rescanCapture.sendResponse);
  const response = await rescanCapture.response as any;
  assert.equal(response.success, true);
  assert.equal(response.result.recovered, 1);
  assert.equal(JSON.stringify(response).includes("phrase"), false);
  assert.equal(JSON.stringify(response).includes("commitment"), false);
});

test("reveal releases a phrase only for the exact dedicated request", async () => {
  const invalidCapture = capture();
  const revealCapture = capture();
  let observedPassword = "";
  const phrase =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const route = createBackgroundPrivacyRecoveryMessageRouter({
    revealPrivacyRecovery: async (password) => {
      observedPassword = password;
      return { phrase, hasMasterRecovery: true };
    },
  });

  route(
    { type: "privacyRevealRecovery", password: "main", extra: true },
    invalidCapture.sendResponse,
  );
  assert.deepEqual(await invalidCapture.response, {
    success: false,
    error: "Invalid request",
  });

  route(
    { type: "privacyRevealRecovery", password: "main" },
    revealCapture.sendResponse,
  );
  assert.deepEqual(await revealCapture.response, {
    success: true,
    phrase,
    hasMasterRecovery: true,
  });
  assert.equal(observedPassword, "main");
});

test("restore validates its exact envelope and bounds domain failures", async () => {
  const invalidCapture = capture();
  const confirmationCapture = capture();
  const route = createBackgroundPrivacyRecoveryMessageRouter({
    restorePrivacyRecovery: async () => {
      throw new PrivacyRecoveryError("replacement-confirmation-required");
    },
  });
  const request = {
    type: "privacyRestoreRecovery",
    requestId: "00000000-0000-4000-8000-000000000101",
    phrase:
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    password: "main",
    replaceExisting: true,
    backupConfirmed: true,
    lossConfirmed: true,
  };
  route({ ...request, extra: true }, invalidCapture.sendResponse);
  assert.deepEqual(await invalidCapture.response, {
    success: false,
    code: "invalid-request",
    error: "Enter a valid 12-word Shield recovery phrase.",
  });

  route(request, confirmationCapture.sendResponse);
  assert.deepEqual(await confirmationCapture.response, {
    success: false,
    code: "replacement-confirmation-required",
    error:
      "Back up the current Shield phrase and confirm both recovery warnings first.",
  });
});
