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
  normalizeDappOrigin,
} from "./dappPermissionStorage";
import { runErc7715PermissionResolution } from "../erc7715/resolution";
import { runPendingRequestResolution } from "./pendingRequestResolution";
import { cancelCrossDappBatchForDappOrigin } from "../crossDappBatch/lifecycle";
import { cancelMetadataPromptsForDappOrigin } from "./pendingMetadataPromptLifecycle";

const revokedFailure = {
  authorized: false as const,
  error: pendingRequestLifecycleErrors.authorizationRevoked,
  code: 4100,
};

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
