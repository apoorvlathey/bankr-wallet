import { resolveActiveDelegate } from "@/utils/delegationResolution";
import { getStoredResolvedChainById } from "@/lib/chains";
import { getAccountById } from "../accountStorage";
import type {
  Address,
  DelegationStatusFailure,
  DelegationStatusResponse,
} from "./types";

export interface DelegationStatusDependencies {
  getAccountById: typeof getAccountById;
  getStoredResolvedChainById: typeof getStoredResolvedChainById;
  resolveActiveDelegate: typeof resolveActiveDelegate;
}

const defaultDependencies: DelegationStatusDependencies = {
  getAccountById,
  getStoredResolvedChainById,
  resolveActiveDelegate,
};

export function createGetDelegationStatusHandler(
  dependencies: DelegationStatusDependencies,
) {
  return async function handleGetDelegationStatus(
    accountId: string,
    chainId: number,
  ): Promise<DelegationStatusResponse | DelegationStatusFailure> {
    const account = await dependencies.getAccountById(accountId);
    if (!account) return { success: false, error: "Account not found" };
    const resolved = await dependencies.getStoredResolvedChainById(chainId);
    if (!resolved?.rpcUrl) {
      return { success: false, error: "Chain has no RPC URL configured" };
    }
    const resolution = await dependencies.resolveActiveDelegate({
      accountId,
      accountAddress: account.address as Address,
      chainId,
      rpcUrl: resolved.rpcUrl,
    });
    return {
      success: true,
      delegate: resolution.delegate,
      source: resolution.source,
      needsAuthorization: resolution.needsAuthorization,
      onchainDelegate: resolution.onchainDelegate,
      customDelegate: resolution.customDelegate,
    };
  };
}

export const handleGetDelegationStatus =
  createGetDelegationStatusHandler(defaultDependencies);
