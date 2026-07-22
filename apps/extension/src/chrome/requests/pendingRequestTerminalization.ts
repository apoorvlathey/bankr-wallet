import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { BUNDLE_STATUS } from "../erc5792Types";
import {
  removePendingErc7715PermissionRequest,
  writeErc7715PermissionResult,
} from "../pendingErc7715PermissionStorage";
import {
  getWalletConnectPendingRequest,
  saveWalletConnectTerminalResponse,
} from "../walletConnect/storage";
import { removePendingBatchTxRequest } from "./pendingBatchTxStorage";
import type {
  LifecycleValidationResult,
  PendingRequestLifecycleContext,
  PendingRequestLifecycleKind,
} from "./pendingRequestLifecycle";
import { removePendingSignatureRequest } from "./pendingSignatureStorage";
import { removePendingTxRequest } from "./pendingTxStorage";

export async function writeProviderResult(
  key: string,
  result: Record<string, unknown>,
): Promise<void> {
  await chrome.storage.local.set({
    [key]: { result, timestamp: Date.now() },
  });
}

async function writeBridgedProviderResult(
  key: string,
  result: Record<string, unknown>,
  pending: PendingRequestLifecycleContext,
): Promise<void> {
  await writeProviderResult(key, result);
  if (
    !pending.walletConnect?.topic &&
    !pending.origin.startsWith("walletconnect:")
  ) {
    return;
  }

  const route = await getWalletConnectPendingRequest(pending.id);
  if (route) {
    await saveWalletConnectTerminalResponse(route.topic, route.requestId, {
      kind: "error",
      code: typeof result.code === "number" ? result.code : -32000,
      message:
        typeof result.error === "string" ? result.error : "Request failed",
    });
  }
  try {
    const { completeWalletConnectRequestIfNeeded } = await import(
      "../walletConnect/resultBridge"
    );
    await completeWalletConnectRequestIfNeeded(key, result);
  } catch {
    // The durable terminal outbox remains replayable after SDK recovery.
  }
}

/** Remove a claimed request before publishing its durable terminal failure. */
export async function terminalizeUnauthorizedPendingRequest(
  kind: PendingRequestLifecycleKind,
  pending: PendingRequestLifecycleContext,
  failure: Extract<LifecycleValidationResult, { authorized: false }>,
): Promise<void> {
  if (kind === "transaction") {
    await removePendingTxRequest(pending.id);
    await writeBridgedProviderResult(
      `txResult:${pending.id}`,
      { success: false, error: failure.error, code: failure.code },
      pending,
    );
    return;
  }
  if (kind === "signature") {
    await removePendingSignatureRequest(pending.id);
    await writeBridgedProviderResult(
      `sigResult:${pending.id}`,
      { success: false, error: failure.error, code: failure.code },
      pending,
    );
    return;
  }
  if (kind === "batchTransaction") {
    if ((pending as { privacyRagequitMeta?: unknown }).privacyRagequitMeta) {
      const { recordPrivacyRagequitBatchSubmissionFailure } = await import(
        "../privacy/ragequit/lifecycle"
      );
      await recordPrivacyRagequitBatchSubmissionFailure(
        pending as import("../erc5792Types").PendingBatchTxRequest,
      );
    }
    await removePendingBatchTxRequest(pending.id);
    await updateBundleStatus(pending.id, {
      status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
      error: failure.error,
      completedAt: Date.now(),
    });
    return;
  }

  await removePendingErc7715PermissionRequest(pending.id);
  await writeErc7715PermissionResult(pending.id, {
    success: false,
    error: failure.error,
  });
}
