import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProviderChainId,
  resolveProviderActiveChainId,
  validateProviderChainBoundary,
} from "../../src/chrome/provider/chainBoundary";
import { validateExternalProviderMessage } from "../../src/chrome/provider/messageValidation";

const ADDRESS = "0x0000000000000000000000000000000000000001";
const ID = "request_123";

test("provider chain parsing rejects coercion and unsafe integers", () => {
  assert.equal(parseProviderChainId(1), 1);
  assert.equal(parseProviderChainId("0x1"), 1);
  assert.equal(parseProviderChainId("8453"), 8453);
  for (const value of [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "",
    "0",
    "0x",
    "01",
    " 1",
    {},
  ]) {
    assert.equal(parseProviderChainId(value), null);
  }
});

test("active chain resolution only uses the named extension registry entry", () => {
  const networksInfo = {
    Ethereum: { chainId: 1, rpcUrl: "https://rpc.example" },
    Base: { chainId: 8453, rpcUrl: "https://base.example" },
  };
  assert.equal(resolveProviderActiveChainId("Base", networksInfo), 8453);
  assert.equal(resolveProviderActiveChainId("Missing", networksInfo), null);
  assert.equal(resolveProviderActiveChainId("Base", undefined), null);
});

test("state-changing provider messages require an exact content-script chain pin", () => {
  assert.deepEqual(validateProviderChainBoundary("0x2105", 8453), {
    valid: true,
    chainId: 8453,
  });
  assert.match(
    validateProviderChainBoundary(1, 8453).valid
      ? ""
      : validateProviderChainBoundary(1, 8453).error,
    /active chain/i,
  );

  const validMessages = [
    {
      type: "sendTransaction",
      txId: ID,
      providerChainId: 8453,
      tx: { from: ADDRESS, to: ADDRESS, chainId: 8453, data: "0x" },
    },
    {
      type: "signatureRequest",
      sigId: ID,
      providerChainId: 8453,
      signature: { method: "personal_sign", params: ["0x00", ADDRESS], chainId: 8453 },
    },
    {
      type: "walletSendCalls",
      bundleId: ID,
      providerChainId: 8453,
      params: { chainId: "0x2105", calls: [{ to: ADDRESS, data: "0x" }] },
    },
    {
      type: "watchAsset",
      watchAssetId: ID,
      providerChainId: 8453,
      chainId: 8453,
      asset: { address: ADDRESS, symbol: "TEST", decimals: 18 },
    },
    {
      type: "walletExecutionPermissions",
      method: "wallet_getSupportedExecutionPermissions",
      providerChainId: 8453,
      chainId: 8453,
      params: [],
    },
  ];

  for (const message of validMessages) {
    assert.deepEqual(validateExternalProviderMessage(message), { valid: true });
    assert.equal(
      validateExternalProviderMessage({ ...message, providerChainId: 1 }).valid,
      false,
    );
    const { providerChainId: _omitted, ...withoutPin } = message;
    assert.equal(validateExternalProviderMessage(withoutPin).valid, false);
  }
});
