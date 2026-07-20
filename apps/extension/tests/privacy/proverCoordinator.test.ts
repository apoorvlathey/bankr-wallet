import assert from "node:assert/strict";
import test from "node:test";

import {
  createPrivacyProverCoordinator,
  type PrivacyProverCoordinatorDependencies,
  type PrivacyProverDiagnosticEvent,
} from "../../src/chrome/privacy/prover/coordinator";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const REQUEST_ID = "00000000-0000-4000-8000-000000000000";
const NONCE = "11111111-1111-4111-8111-111111111111";

function createHarness(options: { fail?: boolean; stale?: boolean } = {}) {
  let creates = 0;
  let closes = 0;
  let messages = 0;
  let uuids = 0;
  let createdUrl = "";
  const dependencies: PrivacyProverCoordinatorDependencies = {
    getUrl: (path) => `chrome-extension://${EXTENSION_ID}/${path}`,
    available: () => true,
    listOffscreenDocumentUrls: async () =>
      options.stale
        ? [
            `chrome-extension://${EXTENSION_ID}/privacy-prover-offscreen.html?nonce=22222222-2222-4222-8222-222222222222`,
          ]
        : [],
    createOffscreenDocument: async (url) => {
      creates += 1;
      createdUrl = url;
    },
    closeOffscreenDocument: async () => {
      closes += 1;
    },
    sendRuntimeMessage: async (message) => {
      messages += 1;
      const envelope = message as {
        nonce?: string;
        request?: { id?: string };
      };
      assert.equal(envelope.nonce, NONCE);
      assert.equal(envelope.request?.id, REQUEST_ID);
      return options.fail
        ? {
            version: 1,
            id: REQUEST_ID,
            kind: "result",
            ok: false,
            code: "commitment-proof-failed",
          }
        : {
            version: 1,
            id: REQUEST_ID,
            kind: "result",
            ok: true,
            commitmentMs: 10,
            withdrawalMs: 20,
            totalMs: 30,
          };
    },
    randomUuid: () => (uuids++ === 0 ? NONCE : REQUEST_ID),
  };
  return {
    coordinator: createPrivacyProverCoordinator(dependencies),
    state: () => ({ creates, closes, messages, createdUrl }),
  };
}

test("coordinator uses one exact nonce-bound offscreen request", async () => {
  const harness = createHarness();
  const first = harness.coordinator.runFixedSelfTest();
  const second = harness.coordinator.runFixedSelfTest();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.deepEqual(firstResult, secondResult);
  assert.deepEqual(harness.state(), {
    creates: 1,
    closes: 1,
    messages: 1,
    createdUrl: `privacy-prover-offscreen.html?nonce=${NONCE}`,
  });
});

test("coordinator replaces a stale owned document before proving", async () => {
  const harness = createHarness({ stale: true });
  await harness.coordinator.runFixedSelfTest();
  assert.deepEqual(harness.state(), {
    creates: 1,
    closes: 2,
    messages: 1,
    createdUrl: `privacy-prover-offscreen.html?nonce=${NONCE}`,
  });
});

test("coordinator rejects a worker failure and closes the document", async () => {
  const harness = createHarness({ fail: true });
  await assert.rejects(
    harness.coordinator.runFixedSelfTest(),
    /commitment-proof-failed/,
  );
  assert.equal(harness.state().closes, 1);
});

test("coordinator carries one validated commitment input through a nonce-bound worker", async () => {
  let uuids = 0;
  let observedInput: unknown;
  const coordinator = createPrivacyProverCoordinator({
    getUrl: (path) => `chrome-extension://${EXTENSION_ID}/${path}`,
    available: () => true,
    listOffscreenDocumentUrls: async () => [],
    createOffscreenDocument: async () => {},
    closeOffscreenDocument: async () => {},
    sendRuntimeMessage: async (message) => {
      const request = (message as any).request;
      observedInput = request.input;
      return {
        version: 1,
        id: REQUEST_ID,
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
    },
    randomUuid: () => (uuids++ === 0 ? NONCE : REQUEST_ID),
  });
  const input = { value: "12", label: "34", nullifier: "56", secret: "78" };
  const result = await coordinator.proveCommitment(input);
  assert.equal(result.action, "prove-commitment");
  assert.deepEqual(observedInput, input);
  await assert.rejects(() => coordinator.proveCommitment({ ...input, secret: "0" }));
});

test("a requested proof gets one clean offscreen retry", async () => {
  let requests = 0;
  let closes = 0;
  let uuids = 0;
  const diagnostics: PrivacyProverDiagnosticEvent[] = [];
  const ids = [
    NONCE,
    REQUEST_ID,
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const coordinator = createPrivacyProverCoordinator({
    getUrl: (path) => `chrome-extension://${EXTENSION_ID}/${path}`,
    available: () => true,
    listOffscreenDocumentUrls: async () => [],
    createOffscreenDocument: async () => {},
    closeOffscreenDocument: async () => {
      closes += 1;
    },
    sendRuntimeMessage: async () => {
      requests += 1;
      const id = ids[requests === 1 ? 1 : 3];
      if (requests === 1) {
        return {
          version: 1,
          id,
          kind: "result",
          action: "prove-commitment",
          ok: false,
          code: "worker-launch-failed",
        };
      }
      return {
        version: 1,
        id,
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
        publicSignals: ["1", "2", "12", "34"],
        totalMs: 10,
      };
    },
    randomUuid: () => ids[uuids++],
    onDiagnostic: (event) => diagnostics.push(event),
  });

  const result = await coordinator.proveCommitment({
    value: "12",
    label: "34",
    nullifier: "56",
    secret: "78",
  });
  assert.equal(result.ok, true);
  assert.equal(requests, 2);
  assert.equal(closes, 2);
  assert.deepEqual(diagnostics, [
    { stage: "request-started", action: "prove-commitment", attempt: 1 },
    {
      stage: "request-failed",
      action: "prove-commitment",
      attempt: 1,
      code: "worker-launch-failed",
    },
    {
      stage: "request-retrying",
      action: "prove-commitment",
      attempt: 2,
      code: "worker-launch-failed",
    },
    { stage: "request-succeeded", action: "prove-commitment", attempt: 2 },
  ]);
});

test("worker timeout closes the offscreen document and leaves the queue retryable", async () => {
  let requests = 0;
  let closes = 0;
  let uuids = 0;
  const ids = [
    NONCE,
    REQUEST_ID,
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const coordinator = createPrivacyProverCoordinator({
    getUrl: (path) => `chrome-extension://${EXTENSION_ID}/${path}`,
    available: () => true,
    listOffscreenDocumentUrls: async () => [],
    createOffscreenDocument: async () => {},
    closeOffscreenDocument: async () => {
      closes += 1;
    },
    sendRuntimeMessage: async () => {
      requests += 1;
      if (requests === 1) return new Promise(() => {});
      return {
        version: 1,
        id: ids[3],
        kind: "result",
        ok: true,
        commitmentMs: 10,
        withdrawalMs: 20,
        totalMs: 30,
      };
    },
    randomUuid: () => ids[uuids++],
    timeoutMs: 5,
  });

  await assert.rejects(coordinator.runFixedSelfTest(), /bridge-timeout/);
  assert.equal(closes, 1);
  assert.equal((await coordinator.runFixedSelfTest()).totalMs, 30);
  assert.equal(requests, 2);
  assert.equal(closes, 2);
});
