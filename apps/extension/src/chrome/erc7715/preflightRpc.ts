import { createPublicClient } from "viem";
import {
  CHAIN_REGISTRY,
  VIEM_CHAINS,
} from "@/constants/chainRegistry";
import { hasPermit2ApprovalRevocationMethod } from "@/lib/erc7715ApprovalRevocation";
import { secureHttpTransport } from "../network/rpcClient";
import {
  ERC7710_DELEGATION_MANAGER,
  METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
} from "./caveatDefinitions";
import type { Address } from "./types";

const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const BUILT_IN_CHAIN_IDS = new Set(CHAIN_REGISTRY.map((chain) => chain.chainId));

const NONCE_ENFORCER_ABI = [
  {
    type: "function",
    name: "currentNonce",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegator", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

function makePreflightClient(rpcUrl: string, chainId: number) {
  return createPublicClient({
    chain: VIEM_CHAINS[chainId],
    transport: secureHttpTransport(rpcUrl, { timeout: 8000, retryCount: 1 }),
  });
}

export async function readDelegationNonce({
  rpcUrl,
  chainId,
  delegator,
}: {
  rpcUrl: string;
  chainId: number;
  delegator: Address;
}): Promise<bigint> {
  const client = makePreflightClient(rpcUrl, chainId);
  return client.readContract({
    address: METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS.NonceEnforcer,
    abi: NONCE_ENFORCER_ABI,
    functionName: "currentNonce",
    args: [ERC7710_DELEGATION_MANAGER, delegator],
  });
}

export async function assertPermit2RevocationAvailable({
  request,
  rpcUrl,
  chainId,
}: {
  request: Record<string, unknown>;
  rpcUrl: string;
  chainId: number;
}) {
  const permission = request.permission as Record<string, unknown>;
  const data =
    typeof permission.data === "object" &&
    permission.data !== null &&
    !Array.isArray(permission.data)
      ? { ...(permission.data as Record<string, unknown>) }
      : {};
  if (!hasPermit2ApprovalRevocationMethod(data)) return;

  if (!BUILT_IN_CHAIN_IDS.has(chainId)) {
    throw new Error(
      "Permit2 approval revocation is only supported on WalletChan built-in chains",
    );
  }

  const client = makePreflightClient(rpcUrl, chainId);
  const code = await client.getCode({ address: PERMIT2_ADDRESS });
  if (!code || code === "0x") {
    throw new Error(
      "Permit2 approval revocation is not available on this chain",
    );
  }
}
