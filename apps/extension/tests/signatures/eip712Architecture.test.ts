import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("EIP-712 parsing delegates to pure policy, schema, and sanitization layers", async () => {
  const [validator, policy, schema, sanitization] = await Promise.all([
    readChromeModule("eip712Validator.ts"),
    readChromeModule("eip712DelegationPolicy.ts"),
    readChromeModule("eip712SchemaValidation.ts"),
    readChromeModule("eip712Sanitization.ts"),
  ]);

  assert.match(validator, /from ["'].\/eip712DelegationPolicy["']/);
  assert.match(validator, /from ["'].\/eip712SchemaValidation["']/);
  assert.match(validator, /from ["'].\/eip712Sanitization["']/);
  for (const source of [policy, schema, sanitization]) {
    assert.doesNotMatch(
      source,
      /chrome\.|fetch\(|from ["'].\/(?:sessionCache|accountStorage|localSigner|bankrApi)["']/,
    );
  }
  assert.doesNotMatch(policy, /eip712Validator/);
  assert.doesNotMatch(schema, /eip712Validator/);
  assert.doesNotMatch(sanitization, /eip712Validator/);
});

test("EIP-712 facade preserves delegation-policy export identities", async () => {
  const [validator, policy] = await Promise.all([
    import("../../src/chrome/eip712Validator"),
    import("../../src/chrome/eip712DelegationPolicy"),
  ]);
  assert.equal(
    validator.RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
    policy.RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
  );
  assert.equal(
    validator.isRawErc7710DelegationSignatureRequest,
    policy.isRawErc7710DelegationSignatureRequest,
  );
});
