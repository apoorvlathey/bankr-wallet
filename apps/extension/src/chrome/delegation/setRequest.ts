import { getStoredResolvedChainById } from "@/lib/chains";
import { probeErc7821Support } from "@/utils/delegationResolution";
import { isAddress } from "viem";
import { getAccountById } from "../accountStorage";
import { STALE_MASTER_AUTHORIZATION_ERROR } from "../masterAuthorization";
import { captureEip7702DelegationAuthorization } from "./authorityPolicy";
import {
  DEFAULT_DELEGATE_ADDRESS,
  ZERO_DELEGATE_ADDRESS,
} from "./constants";
import { buildDelegationRequest } from "./requestConstruction";
import { queueDelegationRequest } from "./requestQueue";
import type { Address, DelegationActionResult } from "./types";

export interface SetDelegationDependencies {
  getAccountById: typeof getAccountById;
  getStoredResolvedChainById: typeof getStoredResolvedChainById;
  captureEip7702DelegationAuthorization:
    typeof captureEip7702DelegationAuthorization;
  probeErc7821Support: typeof probeErc7821Support;
  queueDelegationRequest: typeof queueDelegationRequest;
  now: () => number;
}

const defaultDependencies: SetDelegationDependencies = {
  getAccountById,
  getStoredResolvedChainById,
  captureEip7702DelegationAuthorization,
  probeErc7821Support,
  queueDelegationRequest,
  now: () => Date.now(),
};

export function createInitiateSetDelegationHandler(
  dependencies: SetDelegationDependencies,
) {
  return async function handleInitiateSetDelegation(
    accountId: string,
    chainId: number,
    targetDelegate: string,
  ): Promise<DelegationActionResult> {
    const account = await dependencies.getAccountById(accountId);
    if (!account) return { success: false, error: "Account not found" };
    if (account.type !== "privateKey" && account.type !== "seedPhrase") {
      return {
        success: false,
        error: "Only PK and Seed Phrase accounts can set delegations",
      };
    }
    if (!isAddress(targetDelegate)) {
      return { success: false, error: "Invalid delegate address" };
    }
    const target = targetDelegate as Address;
    if (target.toLowerCase() === ZERO_DELEGATE_ADDRESS) {
      return {
        success: false,
        error: "Use Revoke to clear the delegation instead of setting it to 0x0",
      };
    }

    let expectedMasterAuthEpoch: string | undefined;
    try {
      expectedMasterAuthEpoch =
        await dependencies.captureEip7702DelegationAuthorization({
          targetDelegate: target,
          kind: "setDelegate",
        });
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Master unlock required",
      };
    }

    const resolved = await dependencies.getStoredResolvedChainById(chainId);
    if (!resolved?.rpcUrl) {
      return { success: false, error: "Chain has no RPC URL configured" };
    }

    if (target.toLowerCase() !== DEFAULT_DELEGATE_ADDRESS.toLowerCase()) {
      const probe = await dependencies.probeErc7821Support(
        resolved.rpcUrl,
        chainId,
        target,
      );
      if (!probe.ok) {
        return {
          success: false,
          error: `Couldn't probe contract: ${probe.error}`,
        };
      }
      if (!probe.supports) {
        return {
          success: false,
          error: "Contract does not implement ERC-7821 batch execution",
        };
      }
    }

    const txId = `setDelegate7702:${accountId}:${chainId}:${dependencies.now()}`;
    const request = buildDelegationRequest(account, {
      id: txId,
      chainId,
      chainName: resolved.name,
      targetDelegate: target,
      kind: "setDelegate",
      timestamp: dependencies.now(),
    });

    try {
      await dependencies.queueDelegationRequest(
        request,
        expectedMasterAuthEpoch,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === STALE_MASTER_AUTHORIZATION_ERROR
      ) {
        return { success: false, error: error.message };
      }
      throw error;
    }
    return { success: true, txId };
  };
}

export const handleInitiateSetDelegation =
  createInitiateSetDelegationHandler(defaultDependencies);
