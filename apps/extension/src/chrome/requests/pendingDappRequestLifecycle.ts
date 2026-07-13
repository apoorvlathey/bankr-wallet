import {
  getPendingBatchTxRequestById,
  getPendingBatchTxRequests,
} from "./pendingBatchTxStorage";
import {
  getPendingErc7715PermissionRequestById,
  getPendingErc7715PermissionRequests,
} from "../pendingErc7715PermissionStorage";
import {
  getPendingSignatureRequestById,
  getPendingSignatureRequests,
} from "./pendingSignatureStorage";
import {
  getPendingTxRequestById,
  getPendingTxRequests,
} from "./pendingTxStorage";
import {
  pendingRequestLifecycleErrors,
  pendingRequestMatchesInjectedOrigin,
} from "./pendingRequestLifecycle";
import { terminalizeUnauthorizedPendingRequest } from "./pendingRequestTerminalization";
import {
  DAPP_CONNECTION_TIMEOUT_ERROR,
  getPendingDappConnectionRequests,
  normalizeDappOrigin,
  removePendingDappConnectionRequests,
} from "./dappPermissionStorage";
import { trustedTopLevelDappOrigin } from "../dapp/requestPolicy";
import { runErc7715PermissionResolution } from "../erc7715/resolution";
import { runPendingRequestResolution } from "./pendingRequestResolution";
import { cancelCrossDappBatchForDappOrigin } from "../crossDappBatch/lifecycle";
import { cancelMetadataPromptsForDappOrigin } from "./pendingMetadataPromptLifecycle";

const revokedFailure = {
  authorized: false as const,
  error: pendingRequestLifecycleErrors.authorizationRevoked,
  code: 4100,
};

export async function expireDappConnectionRequest(
  requestId: string,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  const trusted = trustedTopLevelDappOrigin(sender);
  if (!trusted) return { success: false, error: "Unauthorized" };

  return runPendingRequestResolution({
    family: "dappConnection",
    requestId: "all",
    action: "expire",
    conflictResult: () => ({
      success: false,
      error: "Request is already being resolved",
    }),
    resolve: async () => {
      const pending = (await getPendingDappConnectionRequests()).find(
        (request) => request.id === requestId,
      );
      if (
        !pending ||
        pending.origin !== trusted.origin ||
        pending.tabId !== trusted.tabId ||
        (pending.frameId !== undefined && pending.frameId !== 0)
      ) {
        return { success: false, error: "Pending request not found" };
      }
      const removed = await removePendingDappConnectionRequests(
        (request) => request.id === requestId,
      );
      if (removed.length === 0) {
        return { success: false, error: "Pending request not found" };
      }
      await chrome.storage.local.set({
        [`dappConnectionResult:${requestId}`]: {
          result: {
            success: false,
            error: DAPP_CONNECTION_TIMEOUT_ERROR,
            code: -32000,
          },
          timestamp: Date.now(),
        },
      });
      return { success: true, expired: true };
    },
  });
}

export async function expireErc7715PermissionRequest(
  requestId: string,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; error?: string }> {
  const trusted = trustedTopLevelDappOrigin(sender);
  if (!trusted) return { success: false, error: "Unauthorized" };
  return runErc7715PermissionResolution(requestId, async () => {
    const pending = await getPendingErc7715PermissionRequestById(requestId);
    if (
      !pending ||
      pending.tabId !== trusted.tabId ||
      !pendingRequestMatchesInjectedOrigin(pending, trusted.origin)
    ) {
      return { success: false, error: "Pending request not found" };
    }
    const failure = {
      authorized: false as const,
      error: "Execution permission request timed out",
      code: -32000,
    };
    await terminalizeUnauthorizedPendingRequest(
      "erc7715Permission",
      pending,
      failure,
    );
    return { success: false, error: failure.error };
  });
}

/** Cancel every still-pending approval created by one injected exact origin. */
export async function cancelPendingRequestsForDappOrigin(
  rawOrigin: string,
): Promise<void> {
  const origin = normalizeDappOrigin(rawOrigin);
  if (!origin) return;

  const [transactions, signatures, batches, permissions] = await Promise.all([
    getPendingTxRequests(),
    getPendingSignatureRequests(),
    getPendingBatchTxRequests(),
    getPendingErc7715PermissionRequests(),
  ]);

  await Promise.all([
    ...transactions
      .filter((pending) =>
        pendingRequestMatchesInjectedOrigin(pending, origin),
      )
      .map((pending) =>
        runPendingRequestResolution({
          family: "transaction" as const,
          requestId: pending.id,
          action: "expire" as const,
          conflictResult: () => undefined,
          resolve: async () => {
            const current = await getPendingTxRequestById(pending.id);
            if (
              !current ||
              !pendingRequestMatchesInjectedOrigin(current, origin)
            ) {
              return;
            }
            await terminalizeUnauthorizedPendingRequest(
              "transaction",
              current,
              revokedFailure,
            );
          },
        }),
      ),
    ...signatures
      .filter((pending) =>
        pendingRequestMatchesInjectedOrigin(pending, origin),
      )
      .map((pending) =>
        runPendingRequestResolution({
          family: "signature" as const,
          requestId: pending.id,
          action: "expire" as const,
          conflictResult: () => undefined,
          resolve: async () => {
            const current = await getPendingSignatureRequestById(pending.id);
            if (
              !current ||
              !pendingRequestMatchesInjectedOrigin(current, origin)
            ) {
              return;
            }
            await terminalizeUnauthorizedPendingRequest(
              "signature",
              current,
              revokedFailure,
            );
          },
        }),
      ),
    ...batches
      .filter((pending) =>
        pendingRequestMatchesInjectedOrigin(pending, origin),
      )
      .map((pending) =>
        runPendingRequestResolution({
          family: "batchTransaction" as const,
          requestId: pending.id,
          action: "expire" as const,
          conflictResult: () => undefined,
          resolve: async () => {
            const current = await getPendingBatchTxRequestById(pending.id);
            if (
              !current ||
              !pendingRequestMatchesInjectedOrigin(current, origin)
            ) {
              return;
            }
            await terminalizeUnauthorizedPendingRequest(
              "batchTransaction",
              current,
              revokedFailure,
            );
          },
        }),
      ),
    ...permissions
      .filter((pending) =>
        pendingRequestMatchesInjectedOrigin(pending, origin),
      )
      .map((pending) =>
        runErc7715PermissionResolution(pending.id, async () => {
          const current = await getPendingErc7715PermissionRequestById(
            pending.id,
          );
          if (
            current &&
            pendingRequestMatchesInjectedOrigin(current, origin)
          ) {
            await terminalizeUnauthorizedPendingRequest(
              "erc7715Permission",
              current,
              revokedFailure,
            );
          }
          return {
            success: false,
            error: pendingRequestLifecycleErrors.authorizationRevoked,
          };
        }),
      ),
    cancelCrossDappBatchForDappOrigin(origin),
    cancelMetadataPromptsForDappOrigin(origin),
  ]);
}
