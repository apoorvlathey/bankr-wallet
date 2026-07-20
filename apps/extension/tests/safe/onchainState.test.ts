import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256, type PublicClient } from "viem";
import { verifySafeOnchainState } from "../../src/chrome/safe/onchainState";
import type { SafeDeploymentIdentity } from "../../src/chrome/safe/deploymentRegistry";

const safe = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const singleton = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const owner = "0xcccccccccccccccccccccccccccccccccccccccc" as const;
const fallback = "0xdddddddddddddddddddddddddddddddddddddddd" as const;
const singletonCode = "0x6000" as const;
const word = (address: string) => `0x${"0".repeat(24)}${address.slice(2)}` as const;

function fakeClient(options?: { modules?: string[]; guard?: string; fallback?: string; nonce?: bigint; contractOwner?: boolean; delegatedOwner?: boolean }) {
  return {
    getBlockNumber: async () => 123n,
    getCode: async ({ address }: { address: string }) =>
      address.toLowerCase() === safe
        ? "0x6001"
        : address.toLowerCase() === owner
          ? options?.contractOwner
            ? "0x6002"
            : options?.delegatedOwner
              ? "0xef01001111111111111111111111111111111111111111"
              : "0x"
          : singletonCode,
    getStorageAt: async ({ slot }: { slot: string }) => {
      if (slot === `0x${"0".repeat(64)}`) return word(singleton);
      if (slot === "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8") {
        return word(options?.guard ?? "0x0000000000000000000000000000000000000000");
      }
      return word(options?.fallback ?? fallback);
    },
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "VERSION") return "1.4.1";
      if (functionName === "getOwners") return [owner];
      if (functionName === "getThreshold") return 1n;
      if (functionName === "nonce") return options?.nonce ?? 7n;
      return [options?.modules ?? [], "0x0000000000000000000000000000000000000001"];
    },
  } as unknown as PublicClient;
}

const deployment: SafeDeploymentIdentity = {
  address: singleton,
  codeHash: keccak256(singletonCode),
  contractName: "SafeL2",
  version: "1.4.1",
  deploymentKind: "l2Singleton",
};

test("onchain verification pins one block and accepts canonical authority", async () => {
  const result = await verifySafeOnchainState({
    chainId: 8453,
    safeAddress: safe,
    client: fakeClient(),
    resolveSingleton: () => deployment,
    isProxyRuntimeAllowed: () => true,
    isFallbackHandlerAllowed: () => true,
  });
  assert.equal(result.verifiedAtBlock, "123");
  assert.equal(result.nonce, "7");
  assert.deepEqual(result.owners, [owner]);
  assert.deepEqual(result.contractOwners, []);
  assert.equal(result.capability, "observe");
});

test("EIP-7702 delegated EOAs remain ordinary Safe signing owners", async () => {
  const result = await verifySafeOnchainState({
    chainId: 8453,
    safeAddress: safe,
    client: fakeClient({ delegatedOwner: true }),
    resolveSingleton: () => deployment,
    isProxyRuntimeAllowed: () => true,
    isFallbackHandlerAllowed: () => true,
  });
  assert.deepEqual(result.contractOwners, []);
  assert.equal(result.capability, "observe");
});

test("contract and nested Safe owners remain visible but block signing", async () => {
  const result = await verifySafeOnchainState({
    chainId: 8453,
    safeAddress: safe,
    client: fakeClient({ contractOwner: true }),
    resolveSingleton: () => deployment,
    isProxyRuntimeAllowed: () => true,
    isFallbackHandlerAllowed: () => true,
  });
  assert.deepEqual(result.contractOwners, [owner]);
  assert.equal(result.capability, "blocked");
  assert.match(result.blockedReason ?? "", /contract|nested/i);
});

test("unknown fallback and enabled extensions fail closed", async () => {
  const common = {
    chainId: 8453,
    safeAddress: safe,
    resolveSingleton: () => deployment,
    isProxyRuntimeAllowed: () => true,
    isFallbackHandlerAllowed: () => false,
  } as const;
  const fallbackResult = await verifySafeOnchainState({ ...common, client: fakeClient() });
  assert.equal(fallbackResult.capability, "blocked");
  assert.match(fallbackResult.blockedReason ?? "", /fallback/i);

  const moduleResult = await verifySafeOnchainState({
    ...common,
    client: fakeClient({ modules: ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"] }),
  });
  assert.equal(moduleResult.capability, "blocked");
  assert.match(moduleResult.blockedReason ?? "", /module/i);
});

test("configuration epoch tracks authority rather than executable nonce", async () => {
  const common = {
    chainId: 8453,
    safeAddress: safe,
    resolveSingleton: () => deployment,
    isProxyRuntimeAllowed: () => true,
    isFallbackHandlerAllowed: () => true,
  } as const;
  const first = await verifySafeOnchainState({ ...common, client: fakeClient({ nonce: 7n }) });
  const second = await verifySafeOnchainState({ ...common, client: fakeClient({ nonce: 8n }) });
  assert.equal(first.configEpoch, second.configEpoch);
  assert.notEqual(first.nonce, second.nonce);
});
