import assert from "node:assert/strict";
import test from "node:test";

import { validateExternalProviderMessage } from "../../src/chrome/externalProviderValidation";
import {
  MAX_HEX_DATA_CHARS,
  MAX_PROVIDER_REQUEST_CHARS,
  validateWalletSendCallsPayload,
} from "../../src/chrome/providerRequestLimits";
import { validateWalletConnectRequestPayload } from "../../src/chrome/walletConnectRequestValidation";

const address = "0x0000000000000000000000000000000000000001";
const validCall = { to: address, data: "0x", value: "0x0" };

function assertValid(value: unknown): void {
  assert.deepEqual(validateWalletSendCallsPayload(value), { valid: true });
}

function assertInvalid(value: unknown, pattern: RegExp): void {
  const result = validateWalletSendCallsPayload(value);
  assert.equal(result.valid, false);
  assert.match(result.error || "", pattern);
}

test("common wallet_sendCalls validation bounds call count and calldata", () => {
  assertValid({
    calls: Array.from({ length: 100 }, () => ({ ...validCall })),
  });
  assertInvalid({ calls: [] }, /call count/i);
  assertInvalid(
    { calls: Array.from({ length: 101 }, () => ({ ...validCall })) },
    /call count/i,
  );

  assertValid({
    calls: [
      {
        ...validCall,
        data: `0x${"ab".repeat((MAX_HEX_DATA_CHARS - 2) / 2)}`,
      },
    ],
  });
  assertInvalid(
    {
      calls: [
        {
          ...validCall,
          data: `0x${"ab".repeat(MAX_HEX_DATA_CHARS / 2)}`,
        },
      ],
    },
    /data.*too large/i,
  );
});

test("common wallet_sendCalls validation enforces the serialized request cap", () => {
  const base = { calls: [validCall], capabilities: { padding: "" } };
  const baseLength = JSON.stringify(base).length;
  const atLimit = {
    ...base,
    capabilities: {
      padding: "x".repeat(MAX_PROVIDER_REQUEST_CHARS - baseLength),
    },
  };

  assert.equal(JSON.stringify(atLimit).length, MAX_PROVIDER_REQUEST_CHARS);
  assertValid(atLimit);
  assertInvalid(
    {
      ...atLimit,
      capabilities: {
        padding: `${atLimit.capabilities.padding}x`,
      },
    },
    /too large/i,
  );
});

test("common wallet_sendCalls validation rejects malformed call fields", () => {
  const malformed: Array<[unknown, RegExp]> = [
    [{ calls: [null] }, /batch transaction data/i],
    [{ calls: [{ ...validCall, to: 1 }] }, /to.*address/i],
    [{ calls: [{ ...validCall, to: "0x1234" }] }, /to.*address/i],
    [{ calls: [{ ...validCall, data: null }] }, /data/i],
    [{ calls: [{ ...validCall, data: 1 }] }, /data/i],
    [{ calls: [{ ...validCall, data: "0x0" }] }, /data/i],
    [{ calls: [{ ...validCall, data: "0xzz" }] }, /data/i],
    [{ calls: [{ ...validCall, value: 1 }] }, /hex quantity/i],
    [{ calls: [{ ...validCall, value: "1" }] }, /hex quantity/i],
    [{ calls: [{ ...validCall, value: "0x" }] }, /hex quantity/i],
    [{ calls: [{ ...validCall, value: `0x${"f".repeat(65)}` }] }, /hex quantity/i],
    [{ calls: [{ ...validCall, from: "0x1234" }] }, /from.*address/i],
    [{ from: 1, calls: [validCall] }, /from.*address/i],
  ];

  for (const [value, pattern] of malformed) assertInvalid(value, pattern);
  assertValid({
    from: address,
    calls: [
      { ...validCall, from: address, value: "0x00" },
      { ...validCall, from: address, value: `0x${"f".repeat(64)}` },
    ],
  });
});

test("injected and WalletConnect ingress use the same batch validation", () => {
  const validParams = {
    version: "2.0.0",
    chainId: "0x1",
    calls: [validCall],
  };
  assert.deepEqual(
    validateExternalProviderMessage({
      type: "walletSendCalls",
      bundleId: "bundle_1",
      providerChainId: 1,
      params: validParams,
    }),
    { valid: true },
  );
  assert.deepEqual(
    validateWalletConnectRequestPayload("wallet_sendCalls", [validParams]),
    { valid: true },
  );

  const invalidParams = {
    ...validParams,
    calls: [{ ...validCall, value: 5 }],
  };
  const injected = validateExternalProviderMessage({
    type: "walletSendCalls",
    bundleId: "bundle_1",
    providerChainId: 1,
    params: invalidParams,
  });
  const walletConnect = validateWalletConnectRequestPayload(
    "wallet_sendCalls",
    [invalidParams],
  );
  assert.equal(injected.valid, false);
  assert.deepEqual(walletConnect, injected);
});
