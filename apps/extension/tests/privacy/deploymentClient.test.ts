import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toFunctionSelector,
  toHex,
} from "viem";

import { readPrivacyPoolsSepoliaSnapshot } from "../../src/chrome/privacy/deployment/client";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";

const ADDRESS_OUTPUT = parseAbiParameters("address");
const ASSET_CONFIG_OUTPUT = parseAbiParameters(
  "address, uint256, uint256, uint256",
);

function resultForRequest(request: Record<string, unknown>): unknown {
  const deployment = PRIVACY_POOLS_SEPOLIA_DEPLOYMENT;
  switch (request.method) {
    case "eth_chainId":
      return deployment.chainIdHex;
    case "eth_getCode":
      return "0x6000";
    case "eth_getStorageAt":
      return "0x000000000000000000000000457f219308fd4f06ffb39dc7b532a51b1580f58b";
    case "eth_call": {
      const params = request.params as Array<{ data?: string }>;
      const selector = params[0]?.data?.slice(0, 10);
      if (selector === toFunctionSelector("SCOPE()")) {
        return toHex(deployment.scope, { size: 32 });
      }
      if (selector === toFunctionSelector("ENTRYPOINT()")) {
        return encodeAbiParameters(ADDRESS_OUTPUT, [
          deployment.contracts.entrypointProxy.address,
        ]);
      }
      if (selector === toFunctionSelector("ASSET()")) {
        return encodeAbiParameters(ADDRESS_OUTPUT, [deployment.nativeAsset]);
      }
      if (selector === toFunctionSelector("WITHDRAWAL_VERIFIER()")) {
        return encodeAbiParameters(ADDRESS_OUTPUT, [
          deployment.contracts.withdrawalVerifier.address,
        ]);
      }
      if (selector === toFunctionSelector("RAGEQUIT_VERIFIER()")) {
        return encodeAbiParameters(ADDRESS_OUTPUT, [
          deployment.contracts.ragequitVerifier.address,
        ]);
      }
      if (selector === toFunctionSelector("scopeToPool(uint256)")) {
        return encodeAbiParameters(ADDRESS_OUTPUT, [
          deployment.contracts.ethPool.address,
        ]);
      }
      if (selector === toFunctionSelector("assetConfig(address)")) {
        return encodeAbiParameters(ASSET_CONFIG_OUTPUT, [
          deployment.contracts.ethPool.address,
          deployment.assetConfig.minimumDepositAmount,
          deployment.assetConfig.vettingFeeBPS,
          deployment.assetConfig.maxRelayFeeBPS,
        ]);
      }
      throw new Error(`Unexpected eth_call selector ${selector}`);
    }
    default:
      throw new Error(`Unexpected RPC method ${String(request.method)}`);
  }
}

test("Sepolia deployment reads never exceed three requests per RPC batch", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const observedInits: RequestInit[] = [];
  const batchLengths: number[] = [];
  globalThis.fetch = (async (input, init) => {
    calls += 1;
    if (init) observedInits.push(init);
    assert.equal(String(input), "https://rpc.example/");
    const body = JSON.parse(String(init?.body)) as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const requests = Array.isArray(body) ? body : [body];
    batchLengths.push(requests.length);
    assert.ok(requests.length <= 3);
    const responses = requests.map((request) => ({
      jsonrpc: "2.0",
      id: request.id,
      result: resultForRequest(request),
    }));
    return new Response(
      JSON.stringify(Array.isArray(body) ? responses : responses[0]),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const snapshot = await readPrivacyPoolsSepoliaSnapshot(
      "https://rpc.example",
    );
    assert.equal(calls, 5);
    assert.deepEqual(batchLengths, [3, 3, 3, 3, 2]);
    assert.ok(observedInits.every((init) => init.redirect === "error"));
    assert.ok(observedInits.every((init) => init.credentials === "omit"));
    assert.ok(
      observedInits.every((init) => init.referrerPolicy === "no-referrer"),
    );
    assert.equal(snapshot.chainId, 11_155_111);
    assert.equal(snapshot.pool.scope, PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope);
    assert.deepEqual(snapshot.contracts.entrypointProxy, {
      runtimeByteLength: 2,
      runtimeBytecodeHash: keccak256("0x6000"),
    });
    assert.equal(
      snapshot.entrypoint.assetPool,
      PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
