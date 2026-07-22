import {
  createPublicClient,
  keccak256,
  parseAbi,
  size,
  type Hex,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import { secureHttpTransport } from "../../network/rpcClient";
import { PRIVACY_POOLS_RPC_BATCH_SIZE } from "../rpcPolicy";
import {
  PRIVACY_POOLS_DEPLOYMENT,
  type PrivacyPoolsContractId,
  type PrivacyPoolsDeployment,
} from "./manifest";
import type {
  PrivacyPoolsRuntimeIdentity,
  PrivacyPoolsSnapshot,
} from "./validation";

const POOL_ABI = parseAbi([
  "function SCOPE() view returns (uint256)",
  "function ENTRYPOINT() view returns (address)",
  "function ASSET() view returns (address)",
  "function WITHDRAWAL_VERIFIER() view returns (address)",
  "function RAGEQUIT_VERIFIER() view returns (address)",
]);

const ENTRYPOINT_ABI = parseAbi([
  "function scopeToPool(uint256 scope) view returns (address)",
  "function assetConfig(address asset) view returns (address pool, uint256 minimumDepositAmount, uint256 vettingFeeBPS, uint256 maxRelayFeeBPS)",
]);

function runtimeIdentity(bytecode: Hex | undefined): PrivacyPoolsRuntimeIdentity {
  if (!bytecode || bytecode === "0x") {
    return { runtimeByteLength: null, runtimeBytecodeHash: null };
  }
  return {
    runtimeByteLength: size(bytecode),
    runtimeBytecodeHash: keccak256(bytecode),
  };
}

/** Read only the fixed, public fields required to identify the active deployment. */
export async function readPrivacyPoolsSnapshot(
  rpcUrl: string,
  deployment: PrivacyPoolsDeployment = PRIVACY_POOLS_DEPLOYMENT,
): Promise<PrivacyPoolsSnapshot> {
  const contracts = deployment.contracts;
  const client = createPublicClient({
    chain: deployment.chainId === mainnet.id ? mainnet : sepolia,
    transport: secureHttpTransport(rpcUrl, {
      batch: { batchSize: PRIVACY_POOLS_RPC_BATCH_SIZE, wait: 0 },
      retryCount: 1,
      timeout: 12_000,
    }),
  });

  const codeReads = [
    client.getBytecode({ address: contracts.entrypointProxy.address }),
    client.getBytecode({ address: contracts.entrypointImplementation.address }),
    client.getBytecode({ address: contracts.ethPool.address }),
    client.getBytecode({ address: contracts.withdrawalVerifier.address }),
    client.getBytecode({ address: contracts.ragequitVerifier.address }),
  ] as const;
  const pool = contracts.ethPool.address;
  const entrypoint = contracts.entrypointProxy.address;

  const [
    chainId,
    implementationSlot,
    scope,
    poolEntrypoint,
    asset,
    withdrawalVerifier,
    ragequitVerifier,
    poolForScope,
    assetConfig,
    ...bytecodes
  ] = await Promise.all([
    client.getChainId(),
    client.getStorageAt({
      address: entrypoint,
      slot: deployment.eip1967ImplementationSlot,
    }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "SCOPE" }),
    client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "ENTRYPOINT",
    }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "ASSET" }),
    client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "WITHDRAWAL_VERIFIER",
    }),
    client.readContract({
      address: pool,
      abi: POOL_ABI,
      functionName: "RAGEQUIT_VERIFIER",
    }),
    client.readContract({
      address: entrypoint,
      abi: ENTRYPOINT_ABI,
      functionName: "scopeToPool",
      args: [deployment.scope],
    }),
    client.readContract({
      address: entrypoint,
      abi: ENTRYPOINT_ABI,
      functionName: "assetConfig",
      args: [deployment.nativeAsset],
    }),
    ...codeReads,
  ]);

  const runtimeContracts: Record<
    PrivacyPoolsContractId,
    PrivacyPoolsRuntimeIdentity
  > = {
    entrypointProxy: runtimeIdentity(bytecodes[0]),
    entrypointImplementation: runtimeIdentity(bytecodes[1]),
    ethPool: runtimeIdentity(bytecodes[2]),
    withdrawalVerifier: runtimeIdentity(bytecodes[3]),
    ragequitVerifier: runtimeIdentity(bytecodes[4]),
  };
  const [assetPool, minimumDepositAmount, vettingFeeBPS, maxRelayFeeBPS] =
    assetConfig;

  return {
    chainId,
    implementationSlot,
    contracts: runtimeContracts,
    pool: {
      scope,
      entrypoint: poolEntrypoint,
      asset,
      withdrawalVerifier,
      ragequitVerifier,
    },
    entrypoint: {
      poolForScope,
      assetPool,
      minimumDepositAmount,
      vettingFeeBPS,
      maxRelayFeeBPS,
    },
  };
}
