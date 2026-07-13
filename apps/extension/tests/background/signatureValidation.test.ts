import assert from "node:assert/strict";
import test from "node:test";

import { createEnqueueAuthorizedSignatureRequest } from "../../src/chrome/background/signatureValidation";

const sender = {
  tab: { id: 4, windowId: 8 },
  frameId: 0,
} as chrome.runtime.MessageSender;

function createHarness(validation: any = { valid: true }) {
  const writes: unknown[][] = [];
  const handled: unknown[][] = [];
  const warnings: unknown[][] = [];
  const enqueue = createEnqueueAuthorizedSignatureRequest({
    validateEIP712TypedData: () => validation,
    rawErc7710DelegationSignatureError: "Raw delegation blocked",
    writeResultToStorage: async (...args) => {
      writes.push(args);
    },
    handleSignatureRequest: (...args) => handled.push(args),
    warn: (...args) => warnings.push(args),
  });
  return { enqueue, writes, handled, warnings };
}

test("malformed and deprecated methods publish exact durable errors", async () => {
  for (const [signature, error] of [
    [null, "Invalid signature request"],
    [
      { method: "eth_sign", params: [] },
      "eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4",
    ],
    [
      { method: "eth_signTypedData", params: [] },
      "eth_signTypedData (v1) is deprecated; please use eth_signTypedData_v4",
    ],
  ] as const) {
    const harness = createHarness();
    harness.enqueue({ sigId: "sig-1", signature }, sender, "https://app.example");
    await Promise.resolve();
    assert.deepEqual(harness.writes, [
      ["sigResult:sig-1", { success: false, error }],
    ]);
    assert.deepEqual(harness.handled, []);
  }
});

test("EIP-712 validation preserves raw-delegation and generic errors", async () => {
  const raw = createHarness({ valid: false, error: "Raw delegation blocked" });
  raw.enqueue(
    { sigId: "sig-2", signature: { method: "eth_signTypedData_v4", params: ["0x1", {}] } },
    sender,
    "https://app.example",
  );
  await Promise.resolve();
  assert.deepEqual(raw.writes[0], [
    "sigResult:sig-2",
    { success: false, error: "Raw delegation blocked" },
  ]);

  const invalid = createHarness({ valid: false, error: "unexpected field" });
  invalid.enqueue(
    { sigId: "sig-3", signature: { method: "eth_signTypedData_v3", params: ["0x1", {}] } },
    sender,
    "https://app.example",
  );
  await Promise.resolve();
  assert.deepEqual(invalid.writes[0], [
    "sigResult:sig-3",
    { success: false, error: "Data must conform to EIP-712 schema" },
  ]);
  assert.match(String(invalid.warnings[0][0]), /https:\/\/app\.example/);
});

test("sanitized typed data and exact sender scope reach signature intake", () => {
  const sanitized = { types: { Mail: [] }, primaryType: "Mail" };
  const harness = createHarness({ valid: true, sanitized });
  const message = {
    sigId: "sig-4",
    signature: {
      method: "eth_signTypedData_v4",
      params: ["0xsigner", { extra: true }],
    },
  };
  harness.enqueue(message, sender, "https://canonical.example");
  assert.equal(message.signature.params[1], sanitized);
  assert.deepEqual(harness.handled, [
    [
      message,
      "sig-4",
      8,
      "https://canonical.example",
      4,
      0,
    ],
  ]);
  assert.deepEqual(harness.writes, []);
});
