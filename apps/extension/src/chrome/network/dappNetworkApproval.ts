import {
  getResolvedChainById,
  normalizeNetworksInfo,
  type ChainAccountType,
} from "@/lib/chains";
import { withStorageLock } from "../storageLock";
import { cleanChainName, cleanNetworkEntry } from "./customNetworkValidation";
import { reconcileNetworkRpcEndpoints } from "./networkRpcMutation";
import {
  failure,
  findChainNameById,
  type NetworkMutationResult,
} from "./networkPolicy";
import {
  getNetworkState,
  NETWORKS_INFO_LOCK_KEY,
  writeNetworkState,
} from "./networkRepository";

/**
 * Applies a user-approved EIP-3085 request without duplicating a known chain.
 * For an existing chain, only the selected RPC and visibility are changed;
 * WalletChan-owned identity and capability metadata remain authoritative.
 */
export async function approveDappNetworkRequest({
  chainName,
  entry,
  requestChainId,
  switchIfSupportedForAccountType,
  requestOrigin,
}: {
  chainName: unknown;
  entry: unknown;
  requestChainId: number;
  switchIfSupportedForAccountType: ChainAccountType | null;
  requestOrigin: string;
}): Promise<NetworkMutationResult> {
  return withStorageLock(NETWORKS_INFO_LOCK_KEY, async () => {
    try {
      const requestedName = cleanChainName(chainName);
      const requestedEntry = cleanNetworkEntry(entry, requestOrigin);
      const { networksInfo } = await getNetworkState();
      const existingName = findChainNameById(
        networksInfo,
        requestedEntry.chainId,
      );

      if (existingName && requestedEntry.chainId !== requestChainId) {
        return failure(
          `Chain ID ${requestedEntry.chainId} already exists as "${existingName}".`,
          networksInfo,
        );
      }

      if (!existingName) {
        if (networksInfo[requestedName]) {
          return failure(
            `Chain name "${requestedName}" already exists.`,
            networksInfo,
          );
        }
        const nextNetworksInfo = normalizeNetworksInfo({
          ...networksInfo,
          [requestedName]: { ...requestedEntry, isCustom: true },
        });
        const resolved = getResolvedChainById(
          requestedEntry.chainId,
          nextNetworksInfo,
        );
        const shouldSwitch =
          switchIfSupportedForAccountType !== "bankr" ||
          resolved?.isBankrSupported === true;
        const normalized = await writeNetworkState(
          nextNetworksInfo,
          shouldSwitch ? { chainName: requestedName } : {},
        );
        return {
          success: true,
          networksInfo: normalized,
          chainName: requestedName,
          chainId: requestedEntry.chainId,
          shouldSwitch,
        };
      }

      const current = networksInfo[existingName];
      await reconcileNetworkRpcEndpoints({
        current,
        savedChainId: current.chainId,
        savedRpcUrl: requestedEntry.rpcUrl,
      });
      const nextNetworksInfo = normalizeNetworksInfo({
        ...networksInfo,
        [existingName]: {
          ...current,
          rpcUrl: requestedEntry.rpcUrl,
          hidden: undefined,
        },
      });
      const resolved = getResolvedChainById(
        requestedEntry.chainId,
        nextNetworksInfo,
      );
      const shouldSwitch =
        switchIfSupportedForAccountType !== "bankr" ||
        resolved?.isBankrSupported === true;
      const normalized = await writeNetworkState(
        nextNetworksInfo,
        shouldSwitch ? { chainName: existingName } : {},
      );
      return {
        success: true,
        networksInfo: normalized,
        chainName: existingName,
        chainId: current.chainId,
        existed: true,
        shouldSwitch,
      };
    } catch (error) {
      return failure(error);
    }
  });
}
