import { ALLOWED_CHAIN_IDS } from "../../constants/chainRegistry";
import { BANKR_SUPPORTED_CHAIN_IDS } from "../../constants/networks";
import {
  getResolvedChains,
  getStoredNetworksInfo,
  getStoredResolvedChainById,
} from "../../lib/chains";
import {
  hasDefaultDelegateForChain,
  resolveActiveDelegate,
} from "../../utils/delegationResolution";
import { getActiveAccount } from "../accountStorage";
import { getAllDelegatesForAccount } from "../delegationStorage";
import type { Account } from "../types";

const ATOMIC_SUPPORTED_CAP = {
  atomic: { status: "supported" },
  atomicBatch: { supported: true },
} as const;

/** Advertise ERC-5792 capabilities for the exact connected account. */
export async function handleWalletGetCapabilities(
  address: string,
  chainIds?: `0x${string}`[],
  accountOverride?: Account,
): Promise<Record<string, any>> {
  const account = accountOverride ?? (await getActiveAccount());
  if (
    address &&
    account?.address &&
    address.toLowerCase() !== account.address.toLowerCase()
  ) {
    return {};
  }

  const capabilities: Record<string, any> = {};
  const networksInfo = await getStoredNetworksInfo();
  const hiddenChainIds = new Set<number>();
  for (const chain of getResolvedChains(networksInfo)) {
    if (chain.hidden) hiddenChainIds.add(chain.chainId);
  }
  const shouldEmit = (chainId: number, hexChainId: `0x${string}`) => {
    if (hiddenChainIds.has(chainId)) return false;
    return !(
      chainIds &&
      chainIds.length > 0 &&
      !chainIds.includes(hexChainId)
    );
  };

  if (account?.type === "bankr") {
    emitSupportedChains(
      capabilities,
      BANKR_SUPPORTED_CHAIN_IDS,
      shouldEmit,
    );
  }

  if (
    account?.type === "privateKey" ||
    account?.type === "seedPhrase"
  ) {
    const candidateSet = new Set<number>(ALLOWED_CHAIN_IDS);
    for (const chain of getResolvedChains(networksInfo)) {
      if (
        !chain.hidden &&
        hasDefaultDelegateForChain(chain.chainId)
      ) {
        candidateSet.add(chain.chainId);
      }
    }
    const optedInDelegates = await getAllDelegatesForAccount(account.id);
    for (const chainIdValue of Object.keys(optedInDelegates)) {
      const chainId = Number(chainIdValue);
      if (Number.isFinite(chainId)) candidateSet.add(chainId);
    }

    const candidateChainIds = [...candidateSet].filter((chainId) => {
      const hexChainId = toHexChainId(chainId);
      return shouldEmit(chainId, hexChainId);
    });
    const probeResults = await Promise.all(
      candidateChainIds.map(async (chainId) => {
        const resolved = await getStoredResolvedChainById(chainId);
        if (!resolved?.rpcUrl) return { chainId, atomic: false };
        try {
          const result = await resolveActiveDelegate({
            accountId: account.id,
            accountAddress: account.address as `0x${string}`,
            chainId,
            rpcUrl: resolved.rpcUrl,
          });
          return { chainId, atomic: !!result.delegate };
        } catch {
          return { chainId, atomic: false };
        }
      }),
    );
    for (const { chainId, atomic } of probeResults) {
      if (atomic) capabilities[toHexChainId(chainId)] = {
        ...ATOMIC_SUPPORTED_CAP,
      };
    }
  }

  // View-only accounts advertise batching so dapps surface a review screen;
  // all signing paths still reject this account type.
  if (account?.type === "impersonator") {
    emitSupportedChains(capabilities, ALLOWED_CHAIN_IDS, shouldEmit);
  }
  return capabilities;
}

function emitSupportedChains(
  capabilities: Record<string, any>,
  chainIds: Iterable<number>,
  shouldEmit: (chainId: number, hexChainId: `0x${string}`) => boolean,
): void {
  for (const chainId of chainIds) {
    const hexChainId = toHexChainId(chainId);
    if (shouldEmit(chainId, hexChainId)) {
      capabilities[hexChainId] = { ...ATOMIC_SUPPORTED_CAP };
    }
  }
}

function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}
