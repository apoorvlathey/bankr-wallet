import assert from "node:assert/strict";
import test from "node:test";
import type { Address, PublicClient } from "viem";
import { discoverBatchAssetCandidates } from "../../src/chrome/simulation/batchCandidates";

const SAFE = "0x3a11e7c2ccd1af51c1edd664800af20d21ee5d34" as Address;
const AAVE_POOL = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5" as Address;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as Address;
const A_USDC = "0x4e65fe4dba92790696d040ac24aa414708f5c0ab" as Address;

test("Safe candidate discovery traces underlying calls instead of ERC-7821 execute", async () => {
  const accessListTargets: string[] = [];
  const client = {
    createAccessList: async ({ to }: { to: Address }) => {
      accessListTargets.push(to.toLowerCase());
      return {
        accessList: [
          { address: AAVE_POOL, storageKeys: [] },
          { address: USDC, storageKeys: [] },
          { address: A_USDC, storageKeys: [] },
        ],
        gasUsed: 1n,
      };
    },
    multicall: async () => { throw new Error("unavailable"); },
  } as unknown as PublicClient;

  const candidates = await discoverBatchAssetCandidates({
    client,
    calls: [{
      to: AAVE_POOL,
      data: `0x617ba037${"0".repeat(24)}${USDC.slice(2)}${"0".repeat(64)}`,
      value: "0",
    }],
    from: SAFE,
    chainId: 8453,
    strategy: "directCalls",
  });

  assert.deepEqual(accessListTargets, [AAVE_POOL]);
  assert.equal(accessListTargets.includes(SAFE), false);
  assert.equal(candidates.some((address) => address.toLowerCase() === USDC), true);
  assert.equal(candidates.some((address) => address.toLowerCase() === A_USDC), true);
});

test("calldata tokens remain candidates when a Safe direct trace fails", async () => {
  const client = {
    createAccessList: async () => { throw new Error("trace unavailable"); },
    multicall: async () => { throw new Error("unavailable"); },
  } as unknown as PublicClient;

  const candidates = await discoverBatchAssetCandidates({
    client,
    calls: [{
      to: AAVE_POOL,
      data: `0x617ba037${"0".repeat(24)}${USDC.slice(2)}`,
    }],
    from: SAFE,
    chainId: 8453,
    strategy: "directCalls",
  });

  assert.equal(candidates.some((address) => address.toLowerCase() === USDC), true);
});
