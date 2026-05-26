/**
 * EIP-7702 delegation management handlers.
 *
 * Handles message types fired from the Account Settings → Smart Account UI:
 *   - getDelegationStatus: read onchain delegation + custom override + the
 *     resolved delegate WalletChan would use on the next batch.
 *   - probeDelegateContract: ERC-7821 support check for custom-delegate
 *     address entry validation (called as the user types).
 *   - setCustomDelegate / removeCustomDelegate: pure storage writes for the
 *     `customDelegates` UI cache. Used internally by the post-broadcast cleanup
 *     in txHandlers — NOT by the UI flow (the UI broadcasts a Set tx instead).
 *   - initiateSetDelegation: enqueue a type-4 tx that sets the EOA's
 *     delegation to a chosen contract (WalletChan default or user-pasted
 *     custom). User confirms it on the standard tx-confirmation screen.
 *   - initiateRevokeDelegation: enqueue a type-4 tx that sets delegation to
 *     the zero address.
 *
 * Both Set and Revoke broadcast their own tx because the user is making an
 * onchain decision *outside* a normal batch — there's no dapp tx to piggyback
 * an authorization on. After the broadcast lands, txHandlers updates the
 * receipt poller updates `customDelegates` storage from `eth_getCode(EOA)` to
 * mirror the new onchain state.
 *
 * Follows the established `*Handlers.ts` pattern and the session-restoration
 * block from _docs/IMPLEMENTATION.md so handlers work after a service-worker
 * restart with auto-lock = "Never".
 */

import { isAddress } from "viem";
import {
  resolveActiveDelegate,
  probeErc7821Support,
} from "@/utils/delegationResolution";
import {
  setCustomDelegate,
  removeCustomDelegate,
} from "./delegationStorage";
import { getAccountById } from "./accountStorage";
import { getStoredResolvedChainById } from "@/lib/chains";
import { savePendingTxRequest } from "./pendingTxStorage";
import { pinnedTxRequest } from "./pinnedRequest";
import { EIP_7702_DEFAULT_DELEGATE } from "@/constants/chainRegistry";

type Address = `0x${string}`;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export interface DelegationStatusResponse {
  success: true;
  delegate: Address | null;
  source: "onchain" | "default" | "none";
  needsAuthorization: boolean;
  onchainDelegate: Address | null;
  customDelegate: Address | null;
}

export interface DelegationStatusFailure {
  success: false;
  error: string;
}

export async function handleGetDelegationStatus(
  accountId: string,
  chainId: number,
): Promise<DelegationStatusResponse | DelegationStatusFailure> {
  const account = await getAccountById(accountId);
  if (!account) return { success: false, error: "Account not found" };
  const resolved = await getStoredResolvedChainById(chainId);
  if (!resolved?.rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }
  const resolution = await resolveActiveDelegate({
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
}

export async function handleProbeDelegateContract(
  chainId: number,
  address: string,
): Promise<{ success: boolean; supports7821?: boolean; error?: string }> {
  if (!isAddress(address)) {
    return { success: false, error: "Invalid address" };
  }
  const resolved = await getStoredResolvedChainById(chainId);
  if (!resolved?.rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }
  const probe = await probeErc7821Support(
    resolved.rpcUrl,
    chainId,
    address.toLowerCase() as Address,
  );
  if (!probe.ok) {
    return { success: false, error: `Couldn't probe contract: ${probe.error}` };
  }
  return { success: true, supports7821: probe.supports };
}

export async function handleSetCustomDelegate(
  accountId: string,
  chainId: number,
  delegate: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isAddress(delegate)) {
    return { success: false, error: "Invalid delegate address" };
  }
  if (delegate.toLowerCase() === ZERO_ADDRESS) {
    return {
      success: false,
      error: "Use Revoke to clear the delegation instead of setting it to 0x0",
    };
  }
  const resolved = await getStoredResolvedChainById(chainId);
  if (!resolved?.rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }
  // Re-probe at save time — the UI already does this for user feedback, but
  // saving without a fresh probe risks persisting a stale "ok" if the
  // contract was self-destructed or the chain reorged it out.
  const probe = await probeErc7821Support(
    resolved.rpcUrl,
    chainId,
    delegate.toLowerCase() as Address,
  );
  if (!probe.ok) {
    return { success: false, error: `Couldn't probe contract: ${probe.error}` };
  }
  if (!probe.supports) {
    return {
      success: false,
      error: "Contract does not implement ERC-7821 batch execution",
    };
  }
  await setCustomDelegate(accountId, chainId, delegate as Address);
  return { success: true };
}

export async function handleRemoveCustomDelegate(
  accountId: string,
  chainId: number,
): Promise<{ success: boolean }> {
  await removeCustomDelegate(accountId, chainId);
  return { success: true };
}

/**
 * Initiate an EIP-7702 set-delegation by enqueueing a PendingTxRequest with
 * `kind: "setDelegate"`. Mirror of `handleInitiateRevokeDelegation` but with
 * a real target instead of the zero address.
 *
 * Validates the chosen delegate:
 *   - Must be a valid address (and non-zero — Revoke is the codepath for 0x0).
 *   - For non-default delegates, probes ERC-7821 batch-mode support before
 *     enqueuing so a clearly-incompatible contract is rejected here rather
 *     than after the user has signed.
 *
 * The post-receipt cleanup in `txReceiptPoller.applyReceiptToHistory` mirrors
 * the new onchain state to `customDelegates` storage so the Settings UI stays
 * in sync (write entry if target is custom, clear if default).
 */
export async function handleInitiateSetDelegation(
  accountId: string,
  chainId: number,
  targetDelegate: string,
): Promise<{ success: boolean; txId?: string; error?: string }> {
  const account = await getAccountById(accountId);
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
  if (target.toLowerCase() === ZERO_ADDRESS) {
    return {
      success: false,
      error: "Use Revoke to clear the delegation instead of setting it to 0x0",
    };
  }

  const resolved = await getStoredResolvedChainById(chainId);
  if (!resolved?.rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }

  // Re-probe non-default delegates at submit time so a recent self-destruct
  // or reorg can't slip a broken delegate through. We trust the canonical
  // default address — it's the same CREATE2 deploy across every supported
  // chain and probing it on every Set adds an avoidable RPC roundtrip.
  if (target.toLowerCase() !== EIP_7702_DEFAULT_DELEGATE.toLowerCase()) {
    const probe = await probeErc7821Support(resolved.rpcUrl, chainId, target);
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

  const fromAddr = account.address as Address;
  const txId = `setDelegate7702:${accountId}:${chainId}:${Date.now()}`;

  const request = pinnedTxRequest(account, {
    id: txId,
    tx: {
      from: fromAddr,
      to: fromAddr,
      data: "0x",
      value: "0x0",
      chainId,
      // 50k headroom — same rationale as the revoke path: eth_estimateGas
      // doesn't account for the per-auth EIP-7702 overhead, so leaving this
      // unset would trip "intrinsic gas too low".
      gas: "0xC350",
    },
    origin: "WalletChan",
    favicon: null,
    chainName: resolved.name,
    timestamp: Date.now(),
    delegation7702Meta: {
      targetDelegate: target,
      kind: "setDelegate",
    },
  });

  await savePendingTxRequest(request);

  chrome.runtime
    .sendMessage({ type: "newPendingTxRequest", txRequest: request })
    .catch(() => {});

  return { success: true, txId };
}

/**
 * Initiate an EIP-7702 revoke by enqueueing a PendingTxRequest. The user
 * confirms it from the same transaction-confirmation screen used for any
 * other tx — gas tier picker, simulation, etc. — keeping the security model
 * (password / agent / Bankr / PK) consistent with every other broadcast.
 *
 * The tx is a self-call (`to == eoa`, `data = 0x`, `value = 0`); the actual
 * effect comes from the EIP-7702 authorizationList carrying a tuple that
 * sets the EOA's delegation to `targetDelegate` (0x0 for revoke). We don't
 * sign or attach the auth here — it has to be signed at broadcast time with
 * a nonce derived from the live tx nonce, so the PK confirm path does that
 * once the user clicks Confirm.
 */
export async function handleInitiateRevokeDelegation(
  accountId: string,
  chainId: number,
): Promise<{ success: boolean; txId?: string; error?: string }> {
  const account = await getAccountById(accountId);
  if (!account) return { success: false, error: "Account not found" };
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return {
      success: false,
      error: "Only PK and Seed Phrase accounts can revoke delegations",
    };
  }

  const resolved = await getStoredResolvedChainById(chainId);
  if (!resolved?.rpcUrl) {
    return { success: false, error: "Chain has no RPC URL configured" };
  }

  const fromAddr = account.address as Address;
  const txId = `revoke7702:${accountId}:${chainId}:${Date.now()}`;

  const request = pinnedTxRequest(account, {
    id: txId,
    tx: {
      from: fromAddr,
      to: fromAddr,
      data: "0x",
      value: "0x0",
      chainId,
      // 50k headroom: 21k base + ~12.5k auth base cost + ~5k no-op self-call.
      // `eth_estimateGas` doesn't account for the EIP-7702 authorization
      // overhead (it only sees the bare self-call), so leaving this unset
      // makes viem broadcast with ~25k and trip "intrinsic gas too low".
      gas: "0xC350",
    },
    origin: "WalletChan",
    favicon: null,
    chainName: resolved.name,
    timestamp: Date.now(),
    delegation7702Meta: {
      targetDelegate: ZERO_ADDRESS as Address,
      kind: "revoke",
    },
  });

  await savePendingTxRequest(request);

  // Tell the open popup (if any) to switch to the confirmation screen.
  chrome.runtime
    .sendMessage({ type: "newPendingTxRequest", txRequest: request })
    .catch(() => {});

  return { success: true, txId };
}

/**
 * Wired up so the storage entry doesn't linger after the account is gone.
 * Called from accountStorage's deletion path (added separately).
 */
export { removeAllDelegatesForAccount } from "./delegationStorage";
