import assert from "node:assert/strict";
import test from "node:test";

import { validateEIP712TypedData } from "../../src/chrome/eip712Validator";

const base = {
  types: {
    EIP712Domain: [{ name: "chainId", type: "uint256" }],
    Message: [{ name: "contents", type: "string" }],
  },
  domain: { chainId: 1 },
  primaryType: "Message",
  message: { contents: "hello" },
};

test("EIP-712 sanitization preserves a normal schema", () => {
  const result = validateEIP712TypedData("eth_signTypedData_v4", base);
  assert.equal(result.valid, true);
  assert.ok(result.sanitized);
  assert.deepEqual(JSON.parse(result.sanitized!), base);
});

test("EIP-712 schemas cannot use prototype properties as implicit types", () => {
  const result = validateEIP712TypedData("eth_signTypedData_v4", {
    ...base,
    types: {
      EIP712Domain: base.types.EIP712Domain,
      Message: [{ name: "payload", type: "toString" }],
    },
    message: { payload: "hidden" },
  });
  assert.equal(result.valid, false);
  assert.match(result.error || "", /undefined type/i);
});

test("EIP-712 schema and field identifiers are bounded to safe identifiers", () => {
  for (const data of [
    {
      ...base,
      types: {
        ...base.types,
        "bad-name": [{ name: "contents", type: "string" }],
      },
    },
    {
      ...base,
      types: {
        ...base.types,
        Message: [{ name: "bad-name", type: "string" }],
      },
    },
  ]) {
    const result = validateEIP712TypedData("eth_signTypedData_v4", data);
    assert.equal(result.valid, false);
    assert.match(result.error || "", /invalid name/i);
  }
});
