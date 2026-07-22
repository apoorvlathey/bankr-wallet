import assert from "node:assert/strict";
import test from "node:test";

import { toFunctionSelector, toHex } from "viem";

import {
  isPrivacyPoolStateRootKnown,
  privacyPoolHistoricalRootIndices,
  readPrivacyAspOnchainRoots,
} from "../../src/chrome/privacy/asp/onchain";

test("ASP onchain reads use Entrypoint.latestRoot and accept the current pool root", async () => {
  const associationRoot = 123n;
  const stateRoot = 456n;
  const observedSelectors = new Set<string>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const requests = Array.isArray(body) ? body : [body];
    const responses = requests.map((request) => {
      if (request.method !== "eth_call") {
        throw new Error(`Unexpected RPC method ${String(request.method)}`);
      }
      const params = request.params as Array<{ data?: string }>;
      const selector = params[0]?.data?.slice(0, 10) ?? "";
      observedSelectors.add(selector);
      const result = selector === toFunctionSelector("latestRoot()")
        ? toHex(associationRoot, { size: 32 })
        : selector === toFunctionSelector("currentRoot()")
          ? toHex(stateRoot, { size: 32 })
          : null;
      if (result === null) throw new Error(`Unexpected selector ${selector}`);
      return { jsonrpc: "2.0", id: request.id, result };
    });
    return new Response(
      JSON.stringify(Array.isArray(body) ? responses : responses[0]),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    assert.deepEqual(
      await readPrivacyAspOnchainRoots({
        expectedStateRoot: stateRoot,
        rpcUrl: "https://rpc.example",
      }),
      { associationRoot, verifiedStateRoot: stateRoot },
    );
    assert.deepEqual(observedSelectors, new Set([
      toFunctionSelector("latestRoot()"),
      toFunctionSelector("currentRoot()"),
    ]));
    assert.equal(
      observedSelectors.has(toFunctionSelector("associationSets(uint256)")),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pool root history follows the 64-slot circular buffer", () => {
  const indices = privacyPoolHistoricalRootIndices(0);
  assert.equal(indices.length, 63);
  assert.equal(indices[0], 63);
  assert.equal(indices.at(-1), 1);
  assert.equal(new Set(indices).size, 63);
  assert.equal(indices.includes(0), false);
  assert.throws(() => privacyPoolHistoricalRootIndices(64));
});

test("historical pool state roots remain valid while unknown roots fail closed", async () => {
  const requested: number[][] = [];
  const historicalRoot = 777n;
  assert.equal(await isPrivacyPoolStateRootKnown({
    expectedStateRoot: historicalRoot,
    currentStateRoot: 999n,
    readCurrentRootIndex: async () => 3,
    readHistoricalRoots: async (indices) => {
      requested.push([...indices]);
      return indices.map((index) => index === 1 ? historicalRoot : 0n);
    },
  }), true);
  assert.deepEqual(requested[0]?.slice(0, 3), [2, 1, 0]);

  assert.equal(await isPrivacyPoolStateRootKnown({
    expectedStateRoot: 123n,
    currentStateRoot: 999n,
    readCurrentRootIndex: async () => 3,
    readHistoricalRoots: async (indices) => indices.map(() => 0n),
  }), false);
});

test("current pool state root avoids history RPC reads", async () => {
  let historyRead = false;
  assert.equal(await isPrivacyPoolStateRootKnown({
    expectedStateRoot: 456n,
    currentStateRoot: 456n,
    readCurrentRootIndex: async () => {
      historyRead = true;
      return 0;
    },
    readHistoricalRoots: async () => {
      historyRead = true;
      return [];
    },
  }), true);
  assert.equal(historyRead, false);
});
