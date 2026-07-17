/** ERC-5792 request validation and durable two-record queue commit. */
import { ALLOWED_CHAIN_IDS } from "../../constants/chainRegistry";
import { BANKR_SUPPORTED_CHAIN_IDS, CHAIN_NAMES } from "../../constants/networks";
import { getStoredResolvedChainById } from "../../lib/chains";
import { resolveActiveDelegate } from "../../utils/delegationResolution";
import { getActiveAccount, getTabAccount } from "../accountStorage";
import { normalizeBatchCallValues } from "./batchTxEncoding";
import { removeBundleStatus, saveBundleStatus } from "./bundleStatusStorage";
import { ERC5792_ERRORS, BUNDLE_STATUS } from "../erc5792Types";
import type { ERC5792Call, WalletConnectRequestMetadata, WalletSendCallsParams } from "../erc5792Types";
import { openExtensionPopup } from "../extensionPopup";
import {
  capturePendingRequestAuthorizationCommitSnapshot,
  pendingRequestLifecycleErrors,
  validatePendingRequestAuthorization,
} from "../requests/pendingRequestLifecycle";
import { writeResultToStorage } from "../transactions/runtime";
import {
  getPendingBatchTxRequestById,
  bindPendingBatchTxRequestCredential,
  markPendingBatchTxRequestReady,
  removePendingBatchTxRequest,
  savePendingBatchTxRequest,
} from "../requests/pendingBatchTxStorage";
import { pinnedBatchTxRequest } from "../requests/pinnedRequest";
import { validateWalletSendCallsPayload } from "../provider/batchValidation";
import type { Account } from "../types";
import { clearProviderRequestSurfaceHint } from "../windowing/providerRequestSurface";

export async function handleWalletSendCalls(
  params: WalletSendCallsParams,
  bundleId: string,
  origin: string,
  favicon: string | null,
  senderWindowId?: number,
  senderOrigin?: string,
  tabId?: number,
  frameId?: number,
  accountOverride?: Account,
  walletConnect?: WalletConnectRequestMetadata,
): Promise<void> {
  try {
    const requestValidation = validateWalletSendCallsPayload(params);
    if (!requestValidation.valid) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: requestValidation.error || "Invalid batch request",
        code: -32602,
      });
      return;
    }
    if (params.version !== "2.0.0") {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Unsupported version. Expected 2.0.0",
        code: ERC5792_ERRORS.UNSUPPORTED_CAPABILITY,
      });
      return;
    }

    const chainId = Number(params.chainId);
    const account = accountOverride ??
      (typeof tabId === "number" ? await getTabAccount(tabId) : await getActiveAccount());
    const isBankrAccount = account?.type === "bankr";
    const isPKOrSP = account?.type === "privateKey" || account?.type === "seedPhrase";
    const isImpersonator = account?.type === "impersonator";
    if (!account || (!isBankrAccount && !isPKOrSP && !isImpersonator)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Active account does not support batch transactions",
        code: ERC5792_ERRORS.ATOMIC_NOT_SUPPORTED,
      });
      return;
    }

    const supportedChains = isBankrAccount ? BANKR_SUPPORTED_CHAIN_IDS : ALLOWED_CHAIN_IDS;
    if (!supportedChains.has(chainId)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: `Chain ${chainId} is not supported for batch transactions`,
        code: ERC5792_ERRORS.UNSUPPORTED_CHAIN,
      });
      return;
    }
    if (!params.calls || params.calls.length === 0) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false, error: "No calls provided", code: -32602,
      });
      return;
    }
    if (params.calls.some((call) => !call.to)) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false, error: "Each call must have a 'to' address", code: -32602,
      });
      return;
    }

    const normalizedCalls = normalizeBatchCallValues(params.calls);
    if (!normalizedCalls.ok) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false, error: normalizedCalls.error, code: -32602,
      });
      return;
    }
    const normalizedParams: WalletSendCallsParams = { ...params, calls: normalizedCalls.calls };

    const eoa = account.address.toLowerCase();
    const offending = normalizedParams.calls.findIndex((call) => {
      if ((call.to ?? "").toLowerCase() !== eoa) return false;
      const data = call.data ?? "0x";
      const valueHex = call.value ?? "0x0";
      return (data !== "0x" && data !== "0x0" && data.length > 2) ||
        (valueHex !== "0x" && valueHex !== "0x0" && BigInt(valueHex) > 0n);
    });
    if (offending !== -1) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: `Call ${offending + 1} targets your own account with payload — rejected to prevent ERC-7821 self-recursion (an inner execute() call would re-enter with auth bypassed)`,
        code: -32602,
      });
      return;
    }

    if (params.from && params.from.toLowerCase() !== account.address.toLowerCase()) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false, error: "From address does not match active account", code: ERC5792_ERRORS.UNAUTHORIZED,
      });
      return;
    }
    for (const call of normalizedParams.calls) {
      const callFrom = (call as ERC5792Call & { from?: string }).from;
      if (typeof callFrom === "string" && callFrom.length > 0 &&
        callFrom.toLowerCase() !== account.address.toLowerCase()) {
        await writeResultToStorage(`batchTxAck:${bundleId}`, {
          success: false, error: "Call 'from' does not match active account", code: ERC5792_ERRORS.UNAUTHORIZED,
        });
        return;
      }
    }

    const trustedOrigin = senderOrigin ?? origin;
    const pendingRequest = await bindPendingBatchTxRequestCredential(
      pinnedBatchTxRequest(account, {
        id: bundleId,
        params: normalizedParams,
        origin,
        favicon,
        chainName: CHAIN_NAMES[chainId] || `Chain ${chainId}`,
        chainId,
        timestamp: Date.now(),
        intakeStatus: "validating",
        tabId,
        frameId,
        senderOrigin,
        requestChainId: chainId,
        walletConnect,
      }),
    );

    const authorizationSnapshot =
      await capturePendingRequestAuthorizationCommitSnapshot(pendingRequest);
    const initialAuthorization =
      await validatePendingRequestAuthorization("batchTransaction", pendingRequest);
    if (!initialAuthorization.authorized || !authorizationSnapshot.isCurrent()) {
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: initialAuthorization.authorized
          ? pendingRequestLifecycleErrors.authorizationRevoked
          : initialAuthorization.error,
        code: initialAuthorization.authorized ? 4100 : initialAuthorization.code,
      });
      return;
    }

    await savePendingBatchTxRequest(pendingRequest);
    // The pinned request is now safe to display. Publish/open it before any
    // network-backed atomic-capability check so a cold sidepanel can render
    // the real review screen instead of waiting behind its request skeleton.
    chrome.runtime.sendMessage({
      type: "newPendingBatchTxRequest",
      batchRequest: pendingRequest,
    }).catch(() => {});
    openExtensionPopup(senderWindowId);

    if (isPKOrSP && params.atomicRequired === true && normalizedParams.calls.length > 1) {
      const resolved = await getStoredResolvedChainById(chainId);
      let canBeAtomic = false;
      if (resolved?.rpcUrl) {
        try {
          const result = await resolveActiveDelegate({
            accountId: account.id,
            accountAddress: account.address as `0x${string}`,
            chainId,
            rpcUrl: resolved.rpcUrl,
          });
          canBeAtomic = !!result.delegate;
        } catch {
          canBeAtomic = false;
        }
      }
      if (!canBeAtomic) {
        await removePendingBatchTxRequest(bundleId);
        await writeResultToStorage(`batchTxAck:${bundleId}`, {
          success: false,
          error: `Atomic execution is not available for chain ${chainId} on this account. Configure a 7702 delegate in Account Settings → Smart Account, or retry without atomicRequired.`,
          code: ERC5792_ERRORS.ATOMIC_NOT_SUPPORTED,
        });
        clearProviderRequestSurfaceHint(senderWindowId);
        return;
      }
    }

    const authorizationAfterPendingSave =
      await validatePendingRequestAuthorization("batchTransaction", pendingRequest);
    if (!authorizationAfterPendingSave.authorized || !authorizationSnapshot.isCurrent()) {
      await removePendingBatchTxRequest(bundleId);
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: authorizationAfterPendingSave.authorized
          ? pendingRequestLifecycleErrors.authorizationRevoked
          : authorizationAfterPendingSave.error,
        code: authorizationAfterPendingSave.authorized ? 4100 : authorizationAfterPendingSave.code,
      });
      return;
    }

    await saveBundleStatus({
      id: bundleId,
      chainId,
      status: BUNDLE_STATUS.PENDING,
      atomic: isBankrAccount,
      createdAt: Date.now(),
      origin: trustedOrigin,
      walletConnect,
    });
    const [persistedPending, finalAuthorization] = await Promise.all([
      getPendingBatchTxRequestById(bundleId),
      validatePendingRequestAuthorization("batchTransaction", pendingRequest),
    ]);
    if (!persistedPending || !finalAuthorization.authorized || !authorizationSnapshot.isCurrent()) {
      await removePendingBatchTxRequest(bundleId);
      await removeBundleStatus(bundleId);
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: finalAuthorization.authorized
          ? pendingRequestLifecycleErrors.authorizationRevoked
          : finalAuthorization.error,
        code: finalAuthorization.authorized ? 4100 : finalAuthorization.code,
      });
      return;
    }

    const readyRequest = await markPendingBatchTxRequestReady(bundleId);
    if (!readyRequest) {
      await removeBundleStatus(bundleId);
      await writeResultToStorage(`batchTxAck:${bundleId}`, {
        success: false,
        error: "Batch request was resolved before validation completed",
        code: 4001,
      });
      clearProviderRequestSurfaceHint(senderWindowId);
      return;
    }

    await writeResultToStorage(`batchTxAck:${bundleId}`, { success: true, id: bundleId });
    clearProviderRequestSurfaceHint(senderWindowId);
    chrome.runtime.sendMessage({
      type: "newPendingBatchTxRequest",
      batchRequest: readyRequest,
    }).catch(() => {});
  } catch (error) {
    await removePendingBatchTxRequest(bundleId).catch(() => undefined);
    await removeBundleStatus(bundleId).catch(() => undefined);
    await writeResultToStorage(`batchTxAck:${bundleId}`, {
      success: false,
      error: error instanceof Error ? error.message : "Failed to queue batch transaction",
      code: -32000,
    }).catch(() => undefined);
  }
}
