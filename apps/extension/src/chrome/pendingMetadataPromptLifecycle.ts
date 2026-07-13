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
import { trustedTopLevelDappOrigin } from "./dappRequestPolicy";
import { runPendingRequestResolution } from "./pendingRequestResolution";

export type MetadataPromptKind = "addChain" | "watchAsset";
type MetadataPrompt = PendingAddChainRequest | PendingWatchAssetRequest;

const PROMPT_EXPIRY_MS = 5 * 60 * 1000;
const promptConfig = {
  addChain: {
    resultPrefix: "addChainResult:",
    timeoutError: "Add-chain request timed out",
  },
  watchAsset: {
    resultPrefix: "watchAssetResult:",
    timeoutError: "Watch-asset request timed out",
  },
} as const;

async function getPrompt(
  kind: MetadataPromptKind,
  requestId: string,
): Promise<MetadataPrompt | null> {
  const requests =
    kind === "addChain"
      ? await getPendingAddChainRequests()
      : await getPendingWatchAssetRequests();
  return requests.find((request) => request.id === requestId) || null;
}

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
  if (Date.now() - pending.timestamp >= PROMPT_EXPIRY_MS) {
    validation = {
      authorized: false,
      error: promptConfig[kind].timeoutError,
      code: -32000,
    };
  } else if (typeof pending.tabId !== "number") {
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

export async function expireMetadataPrompt(
  kind: MetadataPromptKind,
  requestId: string,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  const trusted = trustedTopLevelDappOrigin(sender);
  if (!trusted) return { success: false, error: "Unauthorized" };
  return runPendingRequestResolution({
    family: kind,
    requestId,
    action: "expire",
    conflictResult: () => ({
      success: false,
      error: "Request is already being resolved",
    }),
    resolve: async () => {
      const pending = await getPrompt(kind, requestId);
      if (
        !pending ||
        pending.tabId !== trusted.tabId ||
        pending.senderOrigin !== trusted.origin ||
        (pending.frameId !== undefined && pending.frameId !== 0)
      ) {
        return { success: false, error: "Pending request not found" };
      }
      await terminalizePromptFailure(kind, pending, {
        authorized: false,
        error: promptConfig[kind].timeoutError,
        code: -32000,
      });
      return { success: true, expired: true };
    },
  });
}

export async function expirePersistedMetadataPrompt(
  kind: MetadataPromptKind,
  requestId: string,
  expiredAtOrBefore: number,
): Promise<void> {
  await runPendingRequestResolution({
    family: kind,
    requestId,
    action: "expire",
    conflictResult: () => undefined,
    resolve: async () => {
      const pending = await getPrompt(kind, requestId);
      if (!pending || pending.timestamp > expiredAtOrBefore) return;
      await terminalizePromptFailure(kind, pending, {
        authorized: false,
        error: promptConfig[kind].timeoutError,
        code: -32000,
      });
    },
  });
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

export const metadataPromptExpiryMs = PROMPT_EXPIRY_MS;
