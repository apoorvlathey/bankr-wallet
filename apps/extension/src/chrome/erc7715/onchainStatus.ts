/** Live onchain verification and local revocation sync for stored grants. */

import { createPublicClient } from "viem";
import {
  EIP_7702_DEFAULT_DELEGATE,
  VIEM_CHAINS,
} from "@/constants/chainRegistry";
import { getStoredResolvedChainById } from "@/lib/chains";
import { readOnchainDelegate } from "@/utils/delegationResolution";
import { secureHttpTransport } from "../rpcHttpClient";
import {
  ERC7710_DELEGATION_MANAGER,
  METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
} from "./caveatDefinitions";
import { hashErc7710Delegation } from "./delegationSigning";
import {
  type Erc7715PermissionGrant,
} from "./types";
import {
  getActiveErc7715PermissionGrants,
  revokeErc7715PermissionGrant,
} from "./grantStorage";

const DELEGATION_MANAGER_DISABLED_ABI = [
  {
    type: "function",
    name: "disabledDelegations",
    stateMutability: "view",
    inputs: [{ name: "delegationHash", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

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

function nonceCaveatTerm(grant: Erc7715PermissionGrant): bigint | null {
  const caveat = grant.caveats.find(
    (entry) => entry.enforcerName === "NonceEnforcer",
  );
  if (!caveat || !/^0x[0-9a-f]+$/iu.test(caveat.terms)) return null;
  try {
    return BigInt(caveat.terms);
  } catch {
    return null;
  }
}

export type GrantOnchainStatus = "active" | "disabled" | "unknown";

export async function getErc7715GrantOnchainStatus(
  grant: Erc7715PermissionGrant,
): Promise<GrantOnchainStatus> {
  if (
    grant.response.delegationManager.toLowerCase() !==
      ERC7710_DELEGATION_MANAGER.toLowerCase() ||
    grant.typedData.domain.verifyingContract.toLowerCase() !==
      ERC7710_DELEGATION_MANAGER.toLowerCase()
  ) {
    return "unknown";
  }

  const resolvedChain = await getStoredResolvedChainById(grant.chainId);
  if (!resolvedChain?.rpcUrl) return "unknown";
  try {
    const delegateRead = await readOnchainDelegate(
      resolvedChain.rpcUrl,
      grant.chainId,
      grant.delegation.delegator,
    );
    if (!delegateRead.ok) return "unknown";
    if (
      !delegateRead.delegate ||
      delegateRead.delegate.toLowerCase() !==
        EIP_7702_DEFAULT_DELEGATE.toLowerCase()
    ) {
      return "disabled";
    }

    const client = createPublicClient({
      chain: VIEM_CHAINS[grant.chainId],
      transport: secureHttpTransport(resolvedChain.rpcUrl, {
        timeout: 8000,
        retryCount: 1,
      }),
    });
    const disabled = await client.readContract({
      address: ERC7710_DELEGATION_MANAGER,
      abi: DELEGATION_MANAGER_DISABLED_ABI,
      functionName: "disabledDelegations",
      args: [hashErc7710Delegation(grant.delegation)],
    });
    if (disabled) return "disabled";

    const expectedNonce = nonceCaveatTerm(grant);
    if (expectedNonce === null) return "active";
    const currentNonce = await client.readContract({
      address: METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS.NonceEnforcer,
      abi: NONCE_ENFORCER_ABI,
      functionName: "currentNonce",
      args: [ERC7710_DELEGATION_MANAGER, grant.delegation.delegator],
    });
    return currentNonce !== expectedNonce ? "disabled" : "active";
  } catch (error) {
    console.warn("[erc7715] onchain grant status check failed", error);
    return "unknown";
  }
}

export async function getActiveErc7715PermissionGrantsWithOnchainSync(
  filters: { origin?: string; accountId?: string; chainId?: number } = {},
): Promise<Erc7715PermissionGrant[]> {
  const grants = await getActiveErc7715PermissionGrants(filters);
  const checked = await Promise.all(
    grants.map(async (grant) => {
      const status = await getErc7715GrantOnchainStatus(grant);
      if (status === "active") return grant;
      if (status === "unknown") {
        throw new Error("Could not verify delegated permission status onchain");
      }
      try {
        await revokeErc7715PermissionGrant({
          grantId: grant.id,
          accountId: grant.accountId,
        });
      } catch (error) {
        console.warn("[erc7715] failed to mark disabled grant revoked", error);
      }
      return null;
    }),
  );
  return checked.filter(
    (grant): grant is Erc7715PermissionGrant => grant !== null,
  );
}
