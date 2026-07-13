import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("EIP-712 parsing delegates to a focused pure audit domain", async () => {
  const [facade, validator, policy, schema, sanitization, types] =
    await Promise.all([
      readChromeModule("eip712Validator.ts"),
      readChromeModule("signatures/eip712/validator.ts"),
      readChromeModule("signatures/eip712/delegationPolicy.ts"),
      readChromeModule("signatures/eip712/schemaValidation.ts"),
      readChromeModule("signatures/eip712/sanitization.ts"),
      readChromeModule("signatures/eip712/types.ts"),
    ]);

  assert.match(facade, /from ["'].\/signatures\/eip712\/validator["']/);
  assert.match(facade, /from ["'].\/signatures\/eip712\/types["']/);
  assert.doesNotMatch(facade, /function |const MAX_|JSON\./);
  assert.match(validator, /from ["'].\/delegationPolicy["']/);
  assert.match(validator, /from ["'].\/schemaValidation["']/);
  assert.match(validator, /from ["'].\/sanitization["']/);
  for (const moduleSource of [validator, policy, schema, sanitization, types]) {
    assert.doesNotMatch(
      moduleSource,
      /chrome\.|fetch\(|sessionCache|accountStorage|localSigner|bankr(?:Api|\/)/,
    );
    assert.ok(moduleSource.split("\n").length <= 400);
  }
});

test("EIP-712 facade preserves implementation export identities", async () => {
  const [facade, validator, policy] = await Promise.all([
    import("../../src/chrome/eip712Validator"),
    import("../../src/chrome/signatures/eip712/validator"),
    import("../../src/chrome/signatures/eip712/delegationPolicy"),
  ]);
  assert.equal(
    facade.RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
    policy.RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
  );
  assert.equal(
    facade.isRawErc7710DelegationSignatureRequest,
    policy.isRawErc7710DelegationSignatureRequest,
  );
  assert.equal(facade.validateEIP712TypedData, validator.validateEIP712TypedData);
});

test("legacy root implementation files do not reappear", async () => {
  for (const path of [
    "eip712DelegationPolicy.ts",
    "eip712SchemaValidation.ts",
    "eip712Sanitization.ts",
    "eip712ValidationTypes.ts",
  ]) {
    await assert.rejects(readChromeModule(path), /ENOENT/);
  }
});
