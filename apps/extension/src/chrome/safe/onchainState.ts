import {
  createPublicClient,
  getAddress,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { getStoredRpcUrl } from "@/lib/chains";
import { secureHttpTransport } from "../network/rpcClient";
import {
  isCanonicalSafeProxyRuntime,
  isCanonicalFallbackHandler,
  resolveSafeSingleton,
  type SafeDeploymentIdentity,
} from "./deploymentRegistry";
import type {
  SafeAddress,
  SafeCapability,
  SafeChainSnapshot,
} from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const SENTINEL_MODULES = "0x0000000000000000000000000000000000000001" as const;
const SAFE_SINGLETON_SLOT = `0x${"0".repeat(64)}` as const;
const GUARD_STORAGE_SLOT = keccak256(toHex("guard_manager.guard.address"));
const FALLBACK_HANDLER_STORAGE_SLOT = keccak256(
  toHex("fallback_manager.handler.address"),
);
const MAX_OWNERS = 100;
const MAX_MODULES = 100;

function isContractOwnerCode(code: Hex | undefined): boolean {
  if (!code || code === "0x") return false;
  // An EIP-7702 delegation designator does not change the account's ECDSA
  // authority; the owner can still produce an ordinary Safe EOA signature.
  return !/^0xef0100[0-9a-fA-F]{40}$/.test(code);
}

const SAFE_READ_ABI = [
  {
    type: "function",
    name: "VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "getThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "nonce",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getModulesPaginated",
    stateMutability: "view",
    inputs: [
      { name: "start", type: "address" },
      { name: "pageSize", type: "uint256" },
    ],
    outputs: [
      { name: "array", type: "address[]" },
      { name: "next", type: "address" },
    ],
  },
] as const;

function storageWordToAddress(word: Hex | undefined): SafeAddress {
  if (!word) return ZERO_ADDRESS;
  const body = word.slice(2).padStart(64, "0");
  return `0x${body.slice(-40)}`.toLowerCase() as SafeAddress;
}

function normalizeUniqueAddresses(
  addresses: readonly string[],
  max: number,
  label: string,
): SafeAddress[] {
  if (addresses.length === 0 || addresses.length > max) {
    throw new Error(`Unsupported Safe ${label} count`);
  }
  const normalized = addresses.map((address) =>
    getAddress(address).toLowerCase() as SafeAddress,
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`Duplicate Safe ${label}`);
  }
  return normalized;
}

function configurationEpoch(input: {
  chainId: number;
  safeAddress: SafeAddress;
  singleton: SafeAddress;
  version: string;
  owners: SafeAddress[];
  contractOwners: SafeAddress[];
  threshold: number;
  modules: SafeAddress[];
  guard: SafeAddress;
  fallbackHandler: SafeAddress;
}): string {
  return keccak256(
    toHex(
      JSON.stringify({
        ...input,
      }),
    ),
  );
}

export interface VerifySafeOnchainStateInput {
  chainId: number;
  safeAddress: SafeAddress;
  /** Canonical fallback for recognized testnets not yet saved by the user. */
  rpcUrl?: string;
  client?: PublicClient;
  capability?: SafeCapability;
  transactionService?: SafeChainSnapshot["transactionService"];
  /** Test seam; production always uses the canonical deployment registry. */
  resolveSingleton?: (
    chainId: number,
    singleton: string,
  ) => SafeDeploymentIdentity | null;
  /** Test seam; production always uses the canonical fallback registry. */
  isFallbackHandlerAllowed?: (
    chainId: number,
    version: SafeChainSnapshot["version"],
    address: string,
  ) => boolean;
  /** Test seam; production pins the released SafeProxy runtime per version. */
  isProxyRuntimeAllowed?: (
    chainId: number,
    version: SafeChainSnapshot["version"],
    runtimeHash: string,
  ) => boolean;
}

export async function verifySafeOnchainState(
  input: VerifySafeOnchainStateInput,
): Promise<SafeChainSnapshot> {
  const rpcUrl = input.client
    ? null
    : (await getStoredRpcUrl(input.chainId)) ?? input.rpcUrl;
  if (!input.client && !rpcUrl) throw new Error("No RPC configured for chain");
  const client =
    input.client ??
    createPublicClient({
      transport: secureHttpTransport(rpcUrl!, { timeout: 12_000, retryCount: 1 }),
    });
  const safeAddress = getAddress(input.safeAddress) as Address;
  const blockNumber = await client.getBlockNumber();
  const [proxyCode, singletonWord] = await Promise.all([
    client.getCode({ address: safeAddress, blockNumber }),
    client.getStorageAt({ address: safeAddress, slot: SAFE_SINGLETON_SLOT, blockNumber }),
  ]);
  if (!proxyCode || proxyCode === "0x") throw new Error("Safe is not deployed");
  const singleton = storageWordToAddress(singletonWord);
  const deployment = (input.resolveSingleton ?? resolveSafeSingleton)(
    input.chainId,
    singleton,
  );
  if (!deployment) throw new Error("Unsupported Safe singleton");
  if (!(input.isProxyRuntimeAllowed ?? isCanonicalSafeProxyRuntime)(
    input.chainId,
    deployment.version,
    keccak256(proxyCode),
  )) {
    throw new Error("Safe proxy runtime does not match canonical deployment");
  }

  const singletonCode = await client.getCode({
    address: getAddress(singleton),
    blockNumber,
  });
  if (!singletonCode || keccak256(singletonCode) !== deployment.codeHash) {
    throw new Error("Safe singleton code does not match canonical deployment");
  }

  const contract = { address: safeAddress, abi: SAFE_READ_ABI, blockNumber } as const;
  const [version, rawOwners, rawThreshold, nonce, modulePage, guardWord, fallbackWord] =
    await Promise.all([
      client.readContract({ ...contract, functionName: "VERSION" }),
      client.readContract({ ...contract, functionName: "getOwners" }),
      client.readContract({ ...contract, functionName: "getThreshold" }),
      client.readContract({ ...contract, functionName: "nonce" }),
      client.readContract({
        ...contract,
        functionName: "getModulesPaginated",
        args: [SENTINEL_MODULES, BigInt(MAX_MODULES + 1)],
      }),
      client.getStorageAt({ address: safeAddress, slot: GUARD_STORAGE_SLOT, blockNumber }),
      client.getStorageAt({
        address: safeAddress,
        slot: FALLBACK_HANDLER_STORAGE_SLOT,
        blockNumber,
      }),
    ]);

  if (version !== deployment.version) {
    throw new Error("Safe version does not match singleton deployment");
  }
  const owners = normalizeUniqueAddresses(rawOwners, MAX_OWNERS, "owner");
  const threshold = Number(rawThreshold);
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > owners.length) {
    throw new Error("Invalid Safe threshold");
  }
  const contractOwners = (await Promise.all(owners.map(async (owner) => ({
    owner,
    code: await client.getCode({ address: getAddress(owner), blockNumber }),
  })))).filter(({ code }) => isContractOwnerCode(code)).map(({ owner }) => owner);
  const [rawModules, nextModule] = modulePage;
  if (
    rawModules.length > MAX_MODULES ||
    nextModule.toLowerCase() !== SENTINEL_MODULES
  ) {
    throw new Error("Safe has too many modules to verify");
  }
  const modules = rawModules.length
    ? normalizeUniqueAddresses(rawModules, MAX_MODULES, "module")
    : [];
  const guard = storageWordToAddress(guardWord);
  const fallbackHandler = storageWordToAddress(fallbackWord);
  const fallbackHandlerAllowed =
    fallbackHandler === ZERO_ADDRESS ||
    (input.isFallbackHandlerAllowed ?? isCanonicalFallbackHandler)(
      input.chainId,
      deployment.version,
      fallbackHandler,
    );
  const blockedReason =
    contractOwners.length > 0
      ? "Contract and nested Safe owners are observe-only in this release"
      : modules.length > 0
      ? "Safe modules require explicit review"
      : guard !== ZERO_ADDRESS
        ? "Safe guard requires explicit review"
        : !fallbackHandlerAllowed
          ? "Safe fallback handler is not a canonical deployment"
        : undefined;
  const capability = blockedReason ? "blocked" : (input.capability ?? "observe");

  return {
    chainId: input.chainId,
    verifiedAtBlock: blockNumber.toString() as `${bigint}`,
    configEpoch: configurationEpoch({
      chainId: input.chainId,
      safeAddress: safeAddress.toLowerCase() as SafeAddress,
      singleton,
      version,
      owners,
      contractOwners,
      threshold,
      modules,
      guard,
      fallbackHandler,
    }),
    singleton,
    version: deployment.version,
    owners,
    contractOwners,
    threshold,
    nonce: nonce.toString() as `${bigint}`,
    modules,
    guard,
    fallbackHandler,
    transactionService: input.transactionService ?? "unavailable",
    capability,
    blockedReason,
  };
}
