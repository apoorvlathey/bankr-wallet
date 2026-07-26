import assert from "node:assert/strict";
import test from "node:test";
import {
  findSafesOwnedByAccount,
  findSafesOwnedByAccountBatch,
  getSafeEligibleChains,
  parseSafeAddressInput,
  probeSafeAddress,
} from "../../src/chrome/safe/discovery";
import type { SafeChainSnapshot } from "../../src/chrome/safe/types";
import type { SafeServiceChain } from "../../src/chrome/safe/serviceRegistry";

const safe = "0xC970484D029D1D3f757847f4D4c804781Fa0bBc4";
const baseSepoliaService: SafeServiceChain = {
  chainId: 84532,
  chainName: "Base Sepolia",
  shortName: "basesep",
  transactionService: "https://api.safe.global/tx-service/basesep",
  publicRpcUrl: "https://sepolia.base.org",
  isTestnet: true,
};
const noStoredNetworks = async () => ({});
const baseSepoliaNetworks = async () => ({
  "Base Sepolia": {
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    isCustom: true,
  },
});
const baseSepoliaServices = async () => [baseSepoliaService];

function baseSepoliaSnapshot(): SafeChainSnapshot {
  return {
    chainId: 84532,
    verifiedAtBlock: "44360222",
    configEpoch: `0x${"11".repeat(32)}`,
    singleton: "0x29fcb43b46531bca003ddc8fcb67ffe91900c762",
    version: "1.4.1",
    owners: ["0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2"],
    contractOwners: [],
    threshold: 1,
    nonce: "1",
    modules: [],
    guard: "0x0000000000000000000000000000000000000000",
    fallbackHandler: "0xfd0732dc9e303f09fcef3a7388ad10a83459ec99",
    transactionService: "supported",
    capability: "observe",
  };
}

test("Base Sepolia is an eligible Safe network with explicit prefixes", async () => {
  assert.equal(parseSafeAddressInput(`base-sepolia:${safe}`).requestedChainId, 84532);
  assert.equal(parseSafeAddressInput(`84532:${safe}`).requestedChainId, 84532);
  assert.equal((await getSafeEligibleChains(undefined, {
    getServices: baseSepoliaServices,
    getNetworksInfo: baseSepoliaNetworks,
  })).some((chain) => chain.chainId === 84532), true);
});

test("the reported Base Sepolia Safe reaches onchain verification with canonical RPC", async () => {
  const calls: Array<{ chainId: number; safeAddress: string; rpcUrl?: string }> = [];
  const result = await probeSafeAddress(
    `base-sepolia:${safe}`,
    async (input) => {
      calls.push(input);
      return baseSepoliaSnapshot();
    },
    {
      info: async () => ({}),
      getServices: baseSepoliaServices,
      getNetworksInfo: baseSepoliaNetworks,
    },
  );

  assert.deepEqual(calls, [{
    chainId: 84532,
    safeAddress: safe.toLowerCase(),
    rpcUrl: "https://sepolia.base.org",
  }]);
  assert.equal(result.snapshots[0]?.chainId, 84532);
  assert.deepEqual(result.failures, []);
});

test("owner discovery preserves the Base Sepolia RPC through verification", async () => {
  const result = await findSafesOwnedByAccount({
    id: "owner",
    type: "privateKey",
    address: "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2",
    createdAt: 1,
  }, {
    discover: async (chainId) => ({ safes: chainId === 84532 ? [safe] : [] }),
    verify: async (input) => {
      assert.equal(input.chainId, 84532);
      assert.equal(input.rpcUrl, "https://sepolia.base.org");
      assert.equal(input.transactionService, "supported");
      return baseSepoliaSnapshot();
    },
    getServices: baseSepoliaServices,
    getNetworksInfo: baseSepoliaNetworks,
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.address, safe.toLowerCase());
  assert.deepEqual(result.failures, []);
  assert.equal(result.scannedChainIds.includes(84532), true);
});

test("Ledger accounts can discover Safes without entering an EOA signing path", async () => {
  let disclosedOwner = "";
  const result = await findSafesOwnedByAccount({
    id: "ledger-owner",
    type: "ledger",
    address: "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2",
    deviceId: "0x1111111111111111111111111111111111111111",
    hdPath: "m/44'/60'/0'/0/0",
    hdIndex: 0,
    createdAt: 1,
  }, {
    discover: async (_chainId, owner) => {
      disclosedOwner = owner;
      return { safes: [safe] };
    },
    verify: async () => baseSepoliaSnapshot(),
    getServices: baseSepoliaServices,
    getNetworksInfo: baseSepoliaNetworks,
  });

  assert.equal(disclosedOwner, "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2");
  assert.equal(result.candidates.length, 1);
});

test("visible custom networks use their configured RPC when Safe supports the chain", async () => {
  const chains = await getSafeEligibleChains(undefined, {
    getServices: async () => [{
      chainId: 5042,
      chainName: "Arc",
      shortName: "arc",
      transactionService: "https://api.safe.global/tx-service/arc",
      publicRpcUrl: "https://safe-public.example",
      isTestnet: false,
    }],
    getNetworksInfo: async () => ({
      "My Arc": {
        chainId: 5042,
        rpcUrl: "https://user-rpc.example",
        isCustom: true,
      },
    }),
  });

  assert.deepEqual(chains, [{
    chainId: 5042,
    name: "My Arc",
    shortName: "arc",
    rpcUrl: "https://user-rpc.example",
    isTestnet: false,
  }]);
});

test("hidden networks are excluded from broad Safe discovery", async () => {
  const chains = await getSafeEligibleChains(undefined, {
    getServices: async () => [{
      chainId: 5042,
      chainName: "Arc",
      shortName: "arc",
      transactionService: "https://api.safe.global/tx-service/arc",
      publicRpcUrl: "https://safe-public.example",
      isTestnet: false,
    }],
    getNetworksInfo: async () => ({
      Arc: {
        chainId: 5042,
        rpcUrl: "https://user-rpc.example",
        isCustom: true,
        hidden: true,
      },
    }),
  });

  assert.deepEqual(chains, []);
  await assert.rejects(
    getSafeEligibleChains(5042, {
      getServices: async () => [{
        chainId: 5042,
        chainName: "Arc",
        shortName: "arc",
        transactionService: "https://api.safe.global/tx-service/arc",
        isTestnet: false,
      }],
      getNetworksInfo: async () => ({
        Arc: {
          chainId: 5042,
          rpcUrl: "https://user-rpc.example",
          isCustom: true,
          hidden: true,
        },
      }),
    }),
    /show this network/i,
  );
});

test("Safe discovery count matches the visible Safe-supported intersection", async () => {
  const services: SafeServiceChain[] = Array.from({ length: 12 }, (_, index) => {
    const chainId = 6001 + index;
    return {
      chainId,
      chainName: `Custom ${chainId}`,
      shortName: `custom-${chainId}`,
      transactionService: `https://api.safe.global/tx-service/custom-${chainId}`,
      isTestnet: false,
    };
  });
  const networksInfo = Object.fromEntries(
    services.map((service, index) => [
      service.chainName,
      {
        chainId: service.chainId,
        rpcUrl: `https://rpc-${service.chainId}.example`,
        isCustom: true,
        hidden: index >= 10 ? true : undefined,
      },
    ]),
  );

  const chains = await getSafeEligibleChains(undefined, {
    getServices: async () => services,
    getNetworksInfo: async () => networksInfo,
  });

  assert.equal(chains.length, 10);
  assert.deepEqual(
    chains.map((chain) => chain.chainId).sort((a, b) => a - b),
    services.slice(0, 10).map((service) => service.chainId),
  );
});

test("owner discovery prioritizes popular chains and pages through activity order", async () => {
  const services: SafeServiceChain[] = [137, 10, 8453, 42161, 1].map(
    (chainId) => ({
      chainId,
      chainName: `Chain ${chainId}`,
      shortName: `chain-${chainId}`,
      transactionService: `https://api.safe.global/tx-service/chain-${chainId}`,
      isTestnet: false,
    }),
  );
  const getServices = async () => services;
  const ordered = await getSafeEligibleChains(undefined, {
    getServices,
    getNetworksInfo: noStoredNetworks,
  });
  assert.deepEqual(
    ordered.map((chain) => chain.chainId),
    [1, 8453, 42161, 10, 137],
  );

  const calls: number[] = [];
  const result = await findSafesOwnedByAccountBatch({
    id: "owner",
    type: "privateKey",
    address: "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2",
    createdAt: 1,
  }, { offset: 4, limit: 4 }, {
    discover: async (chainId) => {
      calls.push(chainId);
      return { safes: [] };
    },
    getServices,
    getNetworksInfo: noStoredNetworks,
  });

  assert.deepEqual(calls, [137]);
  assert.deepEqual(result.scannedChainIds, [137]);
  assert.equal(result.nextOffset, 5);
  assert.equal(result.totalChains, 5);
  assert.equal(result.complete, true);
});

test("owner discovery rejects view-only and Safe accounts before disclosure", async () => {
  let calls = 0;
  await assert.rejects(
    findSafesOwnedByAccount({
      id: "view-only",
      type: "impersonator",
      address: "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2",
      createdAt: 1,
    }, {
      discover: async () => {
        calls += 1;
        return { safes: [] };
      },
    }),
    /signing account/i,
  );
  assert.equal(calls, 0);
});
