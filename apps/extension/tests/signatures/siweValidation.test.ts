import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSiweMessage } from "../../src/lib/siwe";

const SAFE_HEX_NONCE =
  "803ccb2d9d3aa30b0dd48fed21c0cc15f4120fe1709d9d477a8403c7c9c4e71b4b880abbbd6cbb61f6b9df55bbbd5f02";

function buildMessage(nonce: string): string {
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 10 * 60_000).toISOString();
  return [
    "app.safe.global wants you to sign in with your Ethereum account:",
    "0x1111111111111111111111111111111111111111",
    "",
    "Sign in to Safe",
    "",
    "URI: https://app.safe.global",
    "Version: 1",
    "Chain ID: 8453",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join("\n");
}

function nonceIssueCodes(nonce: string): string[] {
  const analysis = analyzeSiweMessage(buildMessage(nonce), {
    connectedChainId: 8453,
    origin: "https://app.safe.global",
    signerAddress: "0x1111111111111111111111111111111111111111",
  });
  assert.ok(analysis);
  return analysis.issues
    .filter((issue) => issue.field === "nonce")
    .map((issue) => issue.code);
}

test("long random hexadecimal SIWE nonces are not classified as weak", () => {
  assert.deepEqual(nonceIssueCodes(SAFE_HEX_NONCE), []);
});

test("short, patterned, and low-entropy SIWE nonces remain weak", () => {
  for (const nonce of [
    "a1b2c3d4",
    "demoNonce12345",
    "aaaaaaaaaaaa",
    "ab12ab12ab12",
    "0123456789abcdef",
  ]) {
    assert.deepEqual(
      nonceIssueCodes(nonce),
      ["SIWE_NONCE_WEAK"],
      `${nonce} should be classified as weak`,
    );
  }
});
