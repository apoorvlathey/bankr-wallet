import assert from "node:assert/strict";
import test from "node:test";
import type { DescriptorLookup } from "../../src/chrome/clearSigning/types";

const PROXY = `0x${"1".repeat(40)}`;
const IMPLEMENTATION = `0x${"2".repeat(40)}`;
const lookup: DescriptorLookup = {
  chainId: 8453,
  address: PROXY,
  kind: "calldata",
  selector: "0xa9059cbb",
};

async function withoutConsole<T>(operation: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.warn = () => undefined;
  try {
    return await operation();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

test("a direct remote descriptor wins without proxy RPC", async () => {
  const { resolveRemoteDescriptor } = await import(
    "../../src/chrome/clearSigning/descriptorResolver"
  );
  const direct = { metadata: { contractName: "Direct" } };
  let proxyCalls = 0;
  const result = await withoutConsole(() =>
    resolveRemoteDescriptor(lookup, {
      fetchDescriptor: async () => direct,
      resolveProxy: async () => {
        proxyCalls += 1;
        return null;
      },
    }),
  );
  assert.equal(result, direct);
  assert.equal(proxyCalls, 0);
});

test("proxy fallback refetches implementation and extends a cloned deployment", async () => {
  const { resolveRemoteDescriptor } = await import(
    "../../src/chrome/clearSigning/descriptorResolver"
  );
  const implementationDescriptor = {
    context: {
      contract: {
        deployments: [{ chainId: 8453, address: IMPLEMENTATION }],
      },
    },
    metadata: { contractName: "Implementation" },
  };
  const fetches: DescriptorLookup[] = [];
  const result = await withoutConsole(() =>
    resolveRemoteDescriptor(lookup, {
      fetchDescriptor: async (candidate) => {
        fetches.push(candidate);
        return candidate.address === PROXY ? null : implementationDescriptor;
      },
      resolveProxy: async () => ({
        implementation: IMPLEMENTATION,
        kind: "eip1967",
      }),
    }),
  );

  assert.deepEqual(fetches, [lookup, { ...lookup, address: IMPLEMENTATION }]);
  assert.notEqual(result, implementationDescriptor);
  assert.deepEqual(result?.context?.contract?.deployments, [
    { chainId: 8453, address: IMPLEMENTATION },
    { chainId: 8453, address: PROXY },
  ]);
  assert.deepEqual(implementationDescriptor.context.contract.deployments, [
    { chainId: 8453, address: IMPLEMENTATION },
  ]);
});

test("deployment extension selects the matching context and deduplicates", async () => {
  const { extendDescriptorDeployments } = await import(
    "../../src/chrome/clearSigning/deploymentExtension"
  );
  const descriptor = {
    context: {
      eip712: {
        deployments: [{ chainId: 1, address: PROXY.toUpperCase() }],
      },
    },
  };
  const extended = extendDescriptorDeployments(
    descriptor,
    "eip712",
    1,
    PROXY,
  );
  assert.equal(extended.context?.eip712?.deployments?.length, 1);
  assert.equal(extended.context?.contract, undefined);
  assert.notEqual(extended, descriptor);
});

test("proxy resolver or implementation failures remain a null descriptor", async () => {
  const { resolveRemoteDescriptor } = await import(
    "../../src/chrome/clearSigning/descriptorResolver"
  );
  assert.equal(
    await withoutConsole(() =>
      resolveRemoteDescriptor(lookup, {
        fetchDescriptor: async () => null,
        resolveProxy: async () => {
          throw new Error("RPC unavailable");
        },
      }),
    ),
    null,
  );
  assert.equal(
    await withoutConsole(() =>
      resolveRemoteDescriptor(lookup, {
        fetchDescriptor: async () => null,
        resolveProxy: async () => ({
          implementation: IMPLEMENTATION,
          kind: "safe",
        }),
      }),
    ),
    null,
  );
});
