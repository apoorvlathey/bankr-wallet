import assert from "node:assert/strict";
import test from "node:test";

import {
  isPrivacyProverBackgroundSender,
  parsePrivacyProverOffscreenRequest,
  parsePrivacyProverSelfTestRequest,
  parsePrivacyProverSelfTestResult,
  parsePrivacyProverProofRequest,
  parsePrivacyProverProofResult,
} from "../../src/chrome/privacy/prover/messages";

const ID = "00000000-0000-4000-8000-000000000000";

test("prover request codec accepts only the fixed action and exact shape", () => {
  const request = {
    version: 1,
    id: ID,
    kind: "request",
    action: "fixed-self-test",
  };
  assert.deepEqual(parsePrivacyProverSelfTestRequest(request), request);
  assert.equal(
    parsePrivacyProverSelfTestRequest({ ...request, input: { secret: "1" } }),
    null,
  );
  assert.equal(
    parsePrivacyProverSelfTestRequest({ ...request, action: "prove" }),
    null,
  );
  assert.equal(
    parsePrivacyProverSelfTestRequest({ ...request, id: "predictable" }),
    null,
  );
});

test("real prover requests accept only bounded circuit inputs", () => {
  const request = {
    version: 1,
    id: ID,
    kind: "request",
    action: "prove-commitment",
    input: { value: "12", label: "34", nullifier: "56", secret: "78" },
  };
  assert.deepEqual(parsePrivacyProverProofRequest(request), request);
  assert.equal(
    parsePrivacyProverProofRequest({
      ...request,
      input: { ...request.input, secret: "0" },
    }),
    null,
  );
  const withdrawal = {
    version: 1,
    id: ID,
    kind: "request",
    action: "prove-withdrawal",
    input: {
      withdrawnValue: "10",
      stateRoot: "1",
      stateTreeDepth: "32",
      ASPRoot: "2",
      ASPTreeDepth: "32",
      context: "3",
      label: "4",
      existingValue: "11",
      existingNullifier: "5",
      existingSecret: "6",
      newNullifier: "7",
      newSecret: "8",
      stateSiblings: Array(32).fill("0"),
      stateIndex: "0",
      ASPSiblings: Array(32).fill("0"),
      ASPIndex: "0",
    },
  };
  assert.ok(parsePrivacyProverProofRequest(withdrawal));
  assert.equal(
    parsePrivacyProverProofRequest({
      ...withdrawal,
      input: { ...withdrawal.input, stateSiblings: Array(31).fill("0") },
    }),
    null,
  );
});

test("real prover results require exact Groth16 shapes and signal counts", () => {
  const result = {
    version: 1,
    id: ID,
    kind: "result",
    action: "prove-commitment",
    ok: true,
    proof: {
      pi_a: ["1", "2", "1"],
      pi_b: [["3", "4"], ["5", "6"], ["1", "0"]],
      pi_c: ["7", "8", "1"],
      protocol: "groth16",
      curve: "bn128",
    },
    publicSignals: ["1", "2", "3", "4"],
    totalMs: 10,
  };
  assert.deepEqual(parsePrivacyProverProofResult(result), result);
  assert.equal(
    parsePrivacyProverProofResult({ ...result, publicSignals: ["1"] }),
    null,
  );
  assert.equal(
    parsePrivacyProverProofResult({
      ...result,
      proof: { ...result.proof, injected: true },
    }),
    null,
  );
});

test("prover result codec bounds timings and rejects mixed failure shapes", () => {
  const success = {
    version: 1,
    id: ID,
    kind: "result",
    ok: true,
    commitmentMs: 10,
    withdrawalMs: 20,
    totalMs: 30,
  };
  assert.deepEqual(parsePrivacyProverSelfTestResult(success), success);
  assert.equal(
    parsePrivacyProverSelfTestResult({ ...success, totalMs: 5 }),
    null,
  );
  assert.equal(
    parsePrivacyProverSelfTestResult({ ...success, proof: {} }),
    null,
  );

  const failure = {
    version: 1,
    id: ID,
    kind: "result",
    ok: false,
    code: "commitment-proof-failed",
  };
  assert.deepEqual(parsePrivacyProverSelfTestResult(failure), failure);
  assert.deepEqual(
    parsePrivacyProverSelfTestResult({ ...failure, code: "worker-timeout" }),
    { ...failure, code: "worker-timeout" },
  );
  assert.deepEqual(
    parsePrivacyProverSelfTestResult({
      ...failure,
      code: "commitment-verification-failed",
    }),
    { ...failure, code: "commitment-verification-failed" },
  );
  assert.equal(
    parsePrivacyProverSelfTestResult({ ...failure, code: "raw-error" }),
    null,
  );
  assert.equal(
    parsePrivacyProverSelfTestResult({ ...failure, error: "detail" }),
    null,
  );
});

test("offscreen envelope requires the per-run nonce and exact request", () => {
  const envelope = {
    target: "walletchan-privacy-prover-offscreen-v1",
    nonce: ID,
    request: {
      version: 1,
      id: ID,
      kind: "request",
      action: "fixed-self-test",
    },
  };
  assert.deepEqual(parsePrivacyProverOffscreenRequest(envelope, ID), envelope);
  assert.equal(
    parsePrivacyProverOffscreenRequest(envelope, "11111111-1111-4111-8111-111111111111"),
    null,
  );
  assert.equal(
    parsePrivacyProverOffscreenRequest({ ...envelope, proof: {} }, ID),
    null,
  );
});

test("offscreen accepts messages only from the exact background worker", () => {
  const runtimeId = "abcdefghijklmnopabcdefghijklmnop";
  const backgroundUrl =
    `chrome-extension://${runtimeId}/static/js/background.js`;
  assert.equal(
    isPrivacyProverBackgroundSender(
      { id: runtimeId, url: backgroundUrl },
      runtimeId,
      backgroundUrl,
    ),
    true,
  );
  assert.equal(
    isPrivacyProverBackgroundSender(
      { id: runtimeId, url: backgroundUrl, tab: {} },
      runtimeId,
      backgroundUrl,
    ),
    false,
  );
  assert.equal(
    isPrivacyProverBackgroundSender(
      { id: runtimeId, url: `chrome-extension://${runtimeId}/index.html` },
      runtimeId,
      backgroundUrl,
    ),
    false,
  );
  assert.equal(
    isPrivacyProverBackgroundSender(
      { id: runtimeId },
      runtimeId,
      backgroundUrl,
    ),
    false,
  );
});
