import assert from "node:assert/strict";
import test from "node:test";

import { validateExternalProviderMessage } from "../../src/chrome/provider/messageValidation";

const validId = "request_123-abc";

function withProviderChainPin(message: unknown): unknown {
  if (!message || typeof message !== "object") return message;
  const candidate = message as Record<string, any>;
  switch (candidate.type) {
    case "sendTransaction":
      return {
        ...candidate,
        providerChainId: candidate.providerChainId ?? candidate.tx?.chainId ?? 1,
      };
    case "signatureRequest":
      return {
        ...candidate,
        providerChainId: candidate.providerChainId ?? 1,
        signature: candidate.signature
          ? { chainId: 1, ...candidate.signature }
          : candidate.signature,
      };
    case "walletSendCalls":
      return {
        ...candidate,
        providerChainId: candidate.providerChainId ?? 1,
        params: candidate.params
          ? { chainId: "0x1", ...candidate.params }
          : candidate.params,
      };
    case "watchAsset":
    case "walletExecutionPermissions":
      return {
        ...candidate,
        chainId: candidate.chainId ?? 1,
        providerChainId: candidate.providerChainId ?? 1,
      };
    default:
      return candidate;
  }
}

function assertValid(message: unknown): void {
  assert.deepEqual(validateExternalProviderMessage(withProviderChainPin(message)), {
    valid: true,
  });
}

function assertInvalid(message: unknown, pattern: RegExp): void {
  const result = validateExternalProviderMessage(withProviderChainPin(message));
  assert.equal(result.valid, false);
  assert.match(result.error || "", pattern);
}

test("external provider messages enforce total size and bounded URLs", () => {
  assertValid({ type: "getProviderWindowState" });
  assertValid({
    type: "openFullscreenRequestSidePanel",
    fullscreen: true,
  });
  assertInvalid(
    { type: "openFullscreenRequestSidePanel", fullscreen: false },
    /fullscreen side-panel/i,
  );
  assertValid({ type: "getDappAccounts" });
  const maxFavicon = `https://images.example/${"x".repeat(
    2_048 - "https://images.example/".length,
  )}`;
  assert.equal(maxFavicon.length, 2_048);
  assertValid({ type: "getDappAccounts", favicon: maxFavicon });
  assertInvalid(
    { type: "getDappAccounts", favicon: "x".repeat(2_049) },
    /favicon/i,
  );
  assertInvalid(
    { type: "getDappAccounts", favicon: "https://127.0.0.1/icon.png" },
    /favicon/i,
  );
  assertInvalid(
    { type: "getDappAccounts", favicon: "http://images.example/icon.png" },
    /favicon/i,
  );
  assertInvalid(
    { type: "getDappAccounts", padding: "x".repeat(1_000_000) },
    /too large/i,
  );

  const circular: Record<string, unknown> = { type: "getDappAccounts" };
  circular.self = circular;
  assertInvalid(circular, /too large/i);
});

test("external provider request ids are bounded and syntax constrained", () => {
  const address = "0x0000000000000000000000000000000000000001";
  assertValid({
    type: "requestDappConnection",
    requestId: "x".repeat(128),
  });
  for (const message of [
    { type: "requestDappConnection", requestId: validId },
    { type: "walletGetCapabilities", requestId: validId, address },
    { type: "walletGetCallsStatus", requestId: validId, bundleId: validId },
    {
      type: "addEthereumChain",
      requestId: validId,
      chainId: 8453,
      chainName: "Base",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://mainnet.base.org"],
      blockExplorerUrls: ["https://basescan.org"],
    },
    {
      type: "watchAsset",
      watchAssetId: validId,
      asset: { address, symbol: "TEST", decimals: 18 },
    },
  ]) {
    assertValid(message);
  }

  for (const badId of ["", "x".repeat(129), "spaces are forbidden", "../escape"]) {
    assertInvalid(
      { type: "requestDappConnection", requestId: badId },
      /request id/i,
    );
    assertInvalid(
      { type: "watchAsset", watchAssetId: badId },
      /asset request id/i,
    );
    for (const message of [
      { type: "sendTransaction", txId: badId, tx: {} },
      {
        type: "signatureRequest",
        sigId: badId,
        signature: { params: [] },
      },
      {
        type: "walletSendCalls",
        bundleId: badId,
        params: { calls: [{}] },
      },
      { type: "rpcRequest", rpcId: badId, params: [] },
    ]) {
      assert.equal(
        validateExternalProviderMessage(withProviderChainPin(message)).valid,
        false,
      );
    }
  }
});

test("chain and asset prompts are schema-bounded before persistence", () => {
  const address = "0x0000000000000000000000000000000000000001";
  const chain = {
    type: "addEthereumChain",
    requestId: validId,
    chainId: 8453,
    chainName: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  };
  assertValid(chain);
  for (const changed of [
    { chainId: 0 },
    { rpcUrls: [] },
    { rpcUrls: ["file:///etc/passwd"] },
    { rpcUrls: ["https://user:secret@rpc.example"] },
    { rpcUrls: ["http://rpc.example"] },
    { blockExplorerUrls: ["javascript:alert(1)"] },
    { blockExplorerUrls: ["http://explorer.example"] },
    { blockExplorerUrls: ["https://192.168.1.1"] },
    { blockExplorerUrls: ["http://localhost:4000"] },
    { rpcUrls: Array.from({ length: 11 }, () => "https://rpc.example") },
    { nativeCurrency: { name: "Ether", symbol: "TOO-LONG-SYMBOL", decimals: 18 } },
    { nativeCurrency: { name: "Ether", symbol: "ETH", decimals: -1 } },
  ]) {
    assert.equal(validateExternalProviderMessage({ ...chain, ...changed }).valid, false);
  }

  const asset = {
    type: "watchAsset",
    watchAssetId: validId,
    providerChainId: 8453,
    chainId: 8453,
    asset: { address, symbol: "TEST", decimals: 18 },
  };
  assertValid(asset);
  for (const changedAsset of [
    { ...asset.asset, address: "0x1234" },
    { ...asset.asset, symbol: "SYMBOL-TOO-LONG" },
    { ...asset.asset, decimals: 1.5 },
    { ...asset.asset, image: "https://127.0.0.1/icon.png" },
    { ...asset.asset, image: "data:image/svg+xml,<svg/>" },
  ]) {
    assert.equal(
      validateExternalProviderMessage({ ...asset, asset: changedAsset }).valid,
      false,
    );
  }
});

test("transaction, signature, and RPC payloads have independent caps", () => {
  const address = "0x0000000000000000000000000000000000000001";
  assertValid({
    type: "sendTransaction",
    txId: validId,
    tx: { from: address, chainId: 1, data: `0x${"0".repeat(262_144)}` },
  });
  assertInvalid(
    {
      type: "sendTransaction",
      txId: validId,
      tx: {
        from: address,
        chainId: 1,
        data: `0x${"0".repeat(262_146)}`,
      },
    },
    /transaction data/i,
  );
  assertInvalid(
    {
      type: "sendTransaction",
      txId: validId,
      tx: { from: address, chainId: 1, data: 123 },
    },
    /transaction data/i,
  );

  assertValid({
    type: "signatureRequest",
    sigId: validId,
    signature: {
      method: "personal_sign",
      params: ["small", address],
    },
  });
  assertInvalid(
    {
      type: "signatureRequest",
      sigId: validId,
      signature: {
        method: "personal_sign",
        params: ["x".repeat(524_288), address],
      },
    },
    /signature request/i,
  );

  assertValid({ type: "rpcRequest", rpcId: validId, params: [] });
  assertInvalid(
    {
      type: "rpcRequest",
      rpcId: validId,
      params: ["x".repeat(524_288)],
    },
    /RPC request/i,
  );
  assertInvalid(
    { type: "rpcRequest", rpcId: validId, params: { not: "an array" } },
    /Invalid RPC request/i,
  );
});

test("signature ingress rejects unsupported methods and malformed hex", () => {
  const address = "0x0000000000000000000000000000000000000001";
  for (const signature of [
    { method: "eth_sign", params: [address, `0x${"00".repeat(32)}`] },
    { method: "eth_signTypedData", params: [address, {}] },
    { method: "wallet_revealPrivateKey", params: [address, "anything"] },
    { method: "personal_sign", params: ["0x0", address] },
    { method: "personal_sign", params: ["0xzz", address] },
    { method: "personal_sign", params: ["hello", "0x1234"] },
  ]) {
    assert.equal(
      validateExternalProviderMessage({
        type: "signatureRequest",
        sigId: validId,
        providerChainId: 1,
        signature: { ...signature, chainId: 1 },
      }).valid,
      false,
    );
  }
});

test("injected transactions reject malformed addresses, calldata, and quantities", () => {
  const address = "0x0000000000000000000000000000000000000001";
  const transaction = {
    type: "sendTransaction",
    txId: validId,
    tx: {
      from: address,
      to: address,
      chainId: 1,
      data: "0x1234",
      value: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      gas: "21000",
      maxFeePerGas: "0x1",
    },
  };
  assertValid(transaction);
  assertValid({
    ...transaction,
    tx: { ...transaction.tx, to: null, value: "0x" },
  });
  assertValid({
    ...transaction,
    tx: { ...transaction.tx, value: "0x00" },
  });

  for (const from of [undefined, null, "", "0x1234", 123]) {
    assertInvalid(
      { ...transaction, tx: { ...transaction.tx, from } },
      /from.*valid address/i,
    );
  }
  for (const chainId of [
    undefined,
    null,
    0,
    -1,
    1.5,
    "1",
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assertInvalid(
      { ...transaction, tx: { ...transaction.tx, chainId } },
      /chainId/i,
    );
  }
  for (const to of ["", "0x1234", 123]) {
    assertInvalid(
      { ...transaction, tx: { ...transaction.tx, to } },
      /to.*valid address/i,
    );
  }
  for (const data of ["0x1", "0xzz", "1234"]) {
    assertInvalid(
      { ...transaction, tx: { ...transaction.tx, data } },
      /transaction data/i,
    );
  }
  for (const [field, value] of [
    ["value", "-1"],
    ["value", "0x1" + "0".repeat(64)],
    ["value", "1" + "0".repeat(78)],
    ["value", `${" ".repeat(80)}1`],
    ["gas", "0x"],
    ["gasPrice", "1.5"],
    ["maxFeePerGas", 1],
    ["maxPriorityFeePerGas", "Infinity"],
  ] as const) {
    assertInvalid(
      {
        ...transaction,
        tx: { ...transaction.tx, [field]: value },
      },
      new RegExp(field, "i"),
    );
  }
});

test("wallet_sendCalls bounds call count and each calldata item", () => {
  const call = { to: "0x0000000000000000000000000000000000000000", data: "0x" };
  assertValid({
    type: "walletSendCalls",
    bundleId: validId,
    params: { calls: Array.from({ length: 100 }, () => ({ ...call })) },
  });
  assertInvalid(
    { type: "walletSendCalls", bundleId: validId, params: { calls: [] } },
    /call count/i,
  );
  assertInvalid(
    {
      type: "walletSendCalls",
      bundleId: validId,
      params: { calls: Array.from({ length: 101 }, () => ({ ...call })) },
    },
    /call count/i,
  );
  assertInvalid(
    {
      type: "walletSendCalls",
      bundleId: validId,
      params: { calls: [{ ...call, data: `0x${"0".repeat(262_145)}` }] },
    },
    /batch transaction data/i,
  );
  assertInvalid(
    {
      type: "walletSendCalls",
      bundleId: validId,
      params: { calls: [null] },
    },
    /batch transaction data/i,
  );
});

test("unknown provider message types fail closed", () => {
  assertInvalid({ type: "revealPrivateKey" }, /unsupported/i);
  assertInvalid(null, /invalid/i);
  assertInvalid({ type: 42 }, /invalid/i);
});

test("provider expiry is not an accepted external request", () => {
  assertInvalid(
    {
      type: "expireProviderRequest",
      requestKind: "transaction",
      requestId: validId,
    },
    /unsupported/i,
  );
});

test("execution-permission ingress binds method and effectful request id", () => {
  for (const method of [
    "wallet_getSupportedExecutionPermissions",
    "wallet_getGrantedExecutionPermissions",
  ]) {
    assertValid({
      type: "walletExecutionPermissions",
      method,
      params: [],
      chainId: 1,
      providerChainId: 1,
    });
  }
  assertValid({
    type: "walletExecutionPermissions",
    method: "wallet_requestExecutionPermissions",
    requestId: validId,
    params: [{}],
    chainId: 1,
    providerChainId: 1,
  });
  assertInvalid(
    {
      type: "walletExecutionPermissions",
      method: "wallet_requestExecutionPermissions",
      params: [{}],
      chainId: 1,
      providerChainId: 1,
    },
    /execution permission/i,
  );
  assertInvalid(
    {
      type: "walletExecutionPermissions",
      method: "eth_sendTransaction",
      params: [],
      chainId: 1,
      providerChainId: 1,
    },
    /execution permission/i,
  );
});
