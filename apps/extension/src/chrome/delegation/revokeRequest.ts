import { getStoredResolvedChainById } from "@/lib/chains";
import { getAccountById } from "../accountStorage";
import { ZERO_DELEGATE_ADDRESS } from "./constants";
import { buildDelegationRequest } from "./requestConstruction";
import { queueDelegationRequest } from "./requestQueue";
import type { DelegationActionResult } from "./types";

export interface RevokeDelegationDependencies {
  getAccountById: typeof getAccountById;
  getStoredResolvedChainById: typeof getStoredResolvedChainById;
  queueDelegationRequest: typeof queueDelegationRequest;
  now: () => number;
}

const defaultDependencies: RevokeDelegationDependencies = {
  getAccountById,
  getStoredResolvedChainById,
  queueDelegationRequest,
  now: () => Date.now(),
};

export function createInitiateRevokeDelegationHandler(
  dependencies: RevokeDelegationDependencies,
) {
  return async function handleInitiateRevokeDelegation(
    accountId: string,
    chainId: number,
  ): Promise<DelegationActionResult> {
    const account = await dependencies.getAccountById(accountId);
    if (!account) return { success: false, error: "Account not found" };
    if (account.type !== "privateKey" && account.type !== "seedPhrase") {
      return {
        success: false,
        error: "Only PK and Seed Phrase accounts can revoke delegations",
      };
    }

    const resolved = await dependencies.getStoredResolvedChainById(chainId);
    if (!resolved?.rpcUrl) {
      return { success: false, error: "Chain has no RPC URL configured" };
    }

    const txId = `revoke7702:${accountId}:${chainId}:${dependencies.now()}`;
    const request = buildDelegationRequest(account, {
      id: txId,
      chainId,
      chainName: resolved.name,
      targetDelegate: ZERO_DELEGATE_ADDRESS,
      kind: "revoke",
      timestamp: dependencies.now(),
    });
    await dependencies.queueDelegationRequest(request);
    return { success: true, txId };
  };
}

export const handleInitiateRevokeDelegation =
  createInitiateRevokeDelegationHandler(defaultDependencies);
