import {
  getPendingAddChainRequests,
  removePendingAddChainRequest,
  type PendingAddChainRequest,
} from "./pendingAddChainStorage";
import {
  getPendingWatchAssetRequests,
  removePendingWatchAssetRequest,
  type PendingWatchAssetRequest,
} from "./pendingWatchAssetStorage";
import {
  pendingRequestLifecycleErrors,
  validateInjectedPendingRequestAuthorization,
  type LifecycleValidationResult,
} from "./pendingRequestLifecycle";
import { runPendingRequestResolution } from "./pendingRequestResolution";

export type MetadataPromptKind = "addChain" | "watchAsset";
type MetadataPrompt = PendingAddChainRequest | PendingWatchAssetRequest;

const promptConfig = {
  addChain: {
    resultPrefix: "addChainResult:",
  },
  watchAsset: {
    resultPrefix: "watchAssetResult:",
  },
} as const;

async function removePrompt(
  kind: MetadataPromptKind,
  requestId: string,
): Promise<void> {
  if (kind === "addChain") await removePendingAddChainRequest(requestId);
  else await removePendingWatchAssetRequest(requestId);
}

async function writePromptResult(
  kind: MetadataPromptKind,
  requestId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await chrome.storage.local.set({
    [`${promptConfig[kind].resultPrefix}${requestId}`]: {
      result,
      timestamp: Date.now(),
    },
  });
}

async function terminalizePromptFailure(
  kind: MetadataPromptKind,
  pending: MetadataPrompt,
  failure: Extract<LifecycleValidationResult, { authorized: false }>,
): Promise<void> {
  await removePrompt(kind, pending.id);
  await writePromptResult(kind, pending.id, {
    success: false,
    error: failure.error,
    code: failure.code,
  });
}

export async function enforceMetadataPromptAuthorizationAtConfirmation(
  kind: MetadataPromptKind,
  pending: MetadataPrompt,
): Promise<LifecycleValidationResult> {
  let validation: LifecycleValidationResult;
  if (typeof pending.tabId !== "number") {
    validation = {
      authorized: false,
      error: pendingRequestLifecycleErrors.authorizationRevoked,
      code: 4100,
    };
  } else {
    validation = await validateInjectedPendingRequestAuthorization(pending);
  }
  if (!validation.authorized) {
    await terminalizePromptFailure(kind, pending, validation);
  }
  return validation;
}

export async function cancelMetadataPromptsForDappOrigin(
  origin: string,
): Promise<void> {
  const [chains, assets] = await Promise.all([
    getPendingAddChainRequests(),
    getPendingWatchAssetRequests(),
  ]);
  const failure = {
    authorized: false as const,
    error: pendingRequestLifecycleErrors.authorizationRevoked,
    code: 4100,
  };
  await Promise.all([
    ...chains
      .filter((pending) => pending.senderOrigin === origin)
      .map((pending) =>
        runPendingRequestResolution({
          family: "addChain" as const,
          requestId: pending.id,
          action: "expire" as const,
          conflictResult: () => undefined,
          resolve: () => terminalizePromptFailure("addChain", pending, failure),
        }),
      ),
    ...assets
      .filter((pending) => pending.senderOrigin === origin)
      .map((pending) =>
        runPendingRequestResolution({
          family: "watchAsset" as const,
          requestId: pending.id,
          action: "expire" as const,
          conflictResult: () => undefined,
          resolve: () =>
            terminalizePromptFailure("watchAsset", pending, failure),
        }),
      ),
  ]);
}
