import { updateBundleStatus } from "./bundleStatusStorage";
import { trustedTopLevelDappOrigin } from "./dappRequestPolicy";
import { BUNDLE_STATUS } from "./erc5792Types";
import {
  getPendingBatchTxRequestById,
  removePendingBatchTxRequest,
} from "./pendingBatchTxStorage";
import { pendingRequestMatchesInjectedOrigin } from "./pendingRequestLifecycle";
import { runPendingRequestResolution } from "./pendingRequestResolution";

const BATCH_ACK_TIMEOUT_ERROR = "Batch request timed out";

async function writeBatchAcknowledgementFailure(
  bundleId: string,
): Promise<void> {
  await chrome.storage.local.set({
    [`batchTxAck:${bundleId}`]: {
      result: {
        success: false,
        error: BATCH_ACK_TIMEOUT_ERROR,
        code: -32000,
      },
      timestamp: Date.now(),
    },
  });
}

/**
 * End an injected wallet_sendCalls request whose queue acknowledgement never
 * arrived. The background ingress owns the same first-action claim from before
 * its first permission read, so this cannot report a timeout while a delayed
 * queue operation can still publish a signable prompt.
 */
export async function expireBatchAcknowledgement(
  bundleId: string,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  const trusted = trustedTopLevelDappOrigin(sender);
  if (!trusted) return { success: false, error: "Unauthorized" };

  return runPendingRequestResolution({
    family: "batchTransaction",
    requestId: bundleId,
    action: "expire",
    conflictResult: () => ({
      success: false,
      error: "Request is already being resolved",
    }),
    resolve: async () => {
      const pending = await getPendingBatchTxRequestById(bundleId);
      if (pending) {
        if (
          pending.walletConnect ||
          pending.tabId !== trusted.tabId ||
          !pendingRequestMatchesInjectedOrigin(pending, trusted.origin)
        ) {
          return { success: false, error: "Pending request not found" };
        }

        await removePendingBatchTxRequest(bundleId);
        await updateBundleStatus(bundleId, {
          status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
          error: BATCH_ACK_TIMEOUT_ERROR,
          completedAt: Date.now(),
        });
      }

      // bundleId is generated inside the isolated content script and is never
      // page-controlled or disclosed before this acknowledgement. When no
      // pending record exists, ownership of the ingress claim is sufficient
      // proof that no live queue operation can subsequently create one.
      await writeBatchAcknowledgementFailure(bundleId);
      return { success: true, expired: true };
    },
  });
}

export const pendingBatchAcknowledgementLifecycleErrors = {
  timeout: BATCH_ACK_TIMEOUT_ERROR,
} as const;
