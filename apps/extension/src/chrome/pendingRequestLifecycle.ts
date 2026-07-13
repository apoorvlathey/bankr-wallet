import { removePendingBatchTxRequest } from "./pendingBatchTxStorage";
import {
  removePendingErc7715PermissionRequest,
  writeErc7715PermissionResult,
} from "./pendingErc7715PermissionStorage";
import {
  getPendingSignatureRequestById,
  removePendingSignatureRequest,
} from "./pendingSignatureStorage";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "./pendingTxStorage";
import { updateBundleStatus } from "./bundleStatusStorage";
import { BUNDLE_STATUS } from "./erc5792Types";
import {
  getDappPermission,
  normalizeDappOrigin,
} from "./dappPermissionStorage";
import { trustedTopLevelDappOrigin } from "./dappRequestPolicy";
import { runPendingRequestResolution } from "./pendingRequestResolution";
import {
  getWalletConnectPendingRequest,
  saveWalletConnectTerminalResponse,
} from "./walletConnectStorage";
import { validatePendingBankrCredential } from "./bankrCredentialBinding";

const PROVIDER_AUTHORIZATION_REVOKED_ERROR =
  "This site's WalletChan connection is no longer active";
const PROVIDER_REQUEST_TIMEOUT_ERROR = "Wallet request timed out";
const WALLETCONNECT_SESSION_ENDED_ERROR =
  "WalletConnect session is no longer active";
const BANKR_CREDENTIAL_CHANGED_ERROR =
  "The Bankr credential changed. Review a new request before continuing.";

export type PendingRequestLifecycleKind =
  | "transaction"
  | "signature"
  | "batchTransaction"
  | "erc7715Permission";

type WalletConnectRequestIdentity = {
  topic: string;
  requestId?: number;
  method?: string;
};

export type PendingRequestLifecycleContext = {
  id: string;
  origin: string;
  senderOrigin?: string;
  tabId?: number;
  frameId?: number;
  walletConnect?: WalletConnectRequestIdentity;
  trustedInternal?: true;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  bankrCredentialTag?: string;
};

export type LifecycleValidationResult =
  | { authorized: true }
  | { authorized: false; error: string; code: number };

const revokingDappOrigins = new Set<string>();
const dappOriginRevocationEpochs = new Map<string, number>();

export interface PendingRequestAuthorizationCommitSnapshot {
  isCurrent: () => boolean;
}

function normalizedInjectedOrigin(
  pending: PendingRequestLifecycleContext,
): string | null {
  if (pending.walletConnect?.topic || pending.origin.startsWith("walletconnect:")) {
    return null;
  }
  if (typeof pending.tabId !== "number") return null;
  return normalizeDappOrigin(pending.senderOrigin);
}

function walletConnectTopic(
  pending: PendingRequestLifecycleContext,
): string | null {
  if (pending.walletConnect?.topic) return pending.walletConnect.topic;
  const prefix = "walletconnect:";
  if (!pending.origin.startsWith(prefix)) return null;
  return pending.origin.slice(prefix.length) || null;
}

/**
 * Capture a transport epoch for a multi-source operation before any async
 * authorization reads. Call `isCurrent()` synchronously after every read and
 * immediately before the irreversible effect. This closes the window where
 * origin A is revoked while origin B is still being validated.
 */
export async function capturePendingRequestAuthorizationCommitSnapshot(
  pending: PendingRequestLifecycleContext,
): Promise<PendingRequestAuthorizationCommitSnapshot> {
  if (pending.trustedInternal === true) {
    return { isCurrent: () => true };
  }

  const topic = walletConnectTopic(pending);
  if (topic) {
    const { captureWalletConnectTerminationSnapshot } = await import(
      "./pendingWalletConnectLifecycle"
    );
    return captureWalletConnectTerminationSnapshot(topic);
  }

  const origin = normalizedInjectedOrigin(pending);
  if (!origin) return { isCurrent: () => false };
  const epoch = dappOriginRevocationEpochs.get(origin) ?? 0;
  const wasRevoking = revokingDappOrigins.has(origin);
  return {
    isCurrent: () =>
      !wasRevoking &&
      !revokingDappOrigins.has(origin) &&
      (dappOriginRevocationEpochs.get(origin) ?? 0) === epoch,
  };
}

export function pendingRequestMatchesInjectedOrigin(
  pending: PendingRequestLifecycleContext,
  origin: string,
): boolean {
  return (
    typeof pending.tabId === "number" &&
    normalizedInjectedOrigin(pending) === origin
  );
}

async function writeProviderResult(
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
  if (!pending.walletConnect?.topic && !pending.origin.startsWith("walletconnect:")) return;

  const route = await getWalletConnectPendingRequest(pending.id);
  if (route) {
    await saveWalletConnectTerminalResponse(route.topic, route.requestId, {
      kind: "error",
      code: typeof result.code === "number" ? result.code : -32000,
      message:
        typeof result.error === "string" ? result.error : "Request failed",
    });
  }
  // Dynamic to avoid a static txHandlers -> lifecycle -> txHandlers cycle once
  // confirm handlers enforce this policy at their last safe signing point.
  try {
    const { completeWalletConnectRequestIfNeeded } = await import(
      "./walletConnectHandlers"
    );
    await completeWalletConnectRequestIfNeeded(key, result);
  } catch {
    // The terminal outbox above remains replayable after worker/SDK recovery.
  }
}

/**
 * Re-check an injected request at the last safe point before signing. Stored
 * tab/origin fields are only a snapshot: the user may have revoked access,
 * closed the tab, or navigated it while a confirmation surface remained open.
 *
 * Extension-initiated requests and WalletConnect requests have no injected-tab
 * authority to re-check and pass through to their own lifecycle policy.
 */
export async function validateInjectedPendingRequestAuthorization(
  pending: PendingRequestLifecycleContext,
): Promise<LifecycleValidationResult> {
  const origin = normalizedInjectedOrigin(pending);
  if (origin === null) {
    if (typeof pending.tabId === "number" && !pending.walletConnect?.topic) {
      return {
        authorized: false,
        error: PROVIDER_AUTHORIZATION_REVOKED_ERROR,
        code: 4100,
      };
    }
    return { authorized: true };
  }

  if (revokingDappOrigins.has(origin)) {
    return {
      authorized: false,
      error: PROVIDER_AUTHORIZATION_REVOKED_ERROR,
      code: 4100,
    };
  }
  const revocationEpoch = dappOriginRevocationEpochs.get(origin) ?? 0;

  if (pending.frameId !== undefined && pending.frameId !== 0) {
    return {
      authorized: false,
      error: PROVIDER_AUTHORIZATION_REVOKED_ERROR,
      code: 4100,
    };
  }

  const [permission, tab] = await Promise.all([
    getDappPermission(origin),
    chrome.tabs.get(pending.tabId as number).catch(() => null),
  ]);
  const currentTabOrigin = normalizeDappOrigin(tab?.url);
  if (
    !permission ||
    currentTabOrigin !== origin ||
    revokingDappOrigins.has(origin) ||
    (dappOriginRevocationEpochs.get(origin) ?? 0) !== revocationEpoch
  ) {
    return {
      authorized: false,
      error: PROVIDER_AUTHORIZATION_REVOKED_ERROR,
      code: 4100,
    };
  }

  return { authorized: true };
}

/**
 * Revalidate the transport authorization immediately before a pending request
 * is committed for signing/broadcast. This is deliberately separate from the
 * ingress checks: permissions and WalletConnect sessions can disappear while
 * a confirmation surface is left open.
 */
export async function validatePendingRequestAuthorization(
  kind: PendingRequestLifecycleKind,
  pending: PendingRequestLifecycleContext,
): Promise<LifecycleValidationResult> {
  // Bankr prompts are bound to the encrypted credential generation that was
  // current at ingress. This check intentionally applies to internal, injected,
  // and WalletConnect requests alike and makes pre-upgrade rows fail closed.
  if (!(await validatePendingBankrCredential(pending))) {
    return {
      authorized: false,
      error: BANKR_CREDENTIAL_CHANGED_ERROR,
      code: 4100,
    };
  }
  if (pending.trustedInternal === true) {
    return { authorized: true };
  }
  if (
    pending.walletConnect?.topic ||
    pending.origin.startsWith("walletconnect:")
  ) {
    const { validateWalletConnectPendingRequestAuthorization } = await import(
      "./pendingWalletConnectLifecycle"
    );
    return validateWalletConnectPendingRequestAuthorization(kind, pending);
  }

  // Every persisted external batch/permission prompt must have either a
  // browser-attested tab binding or exact WalletConnect transport metadata.
  // Missing fields indicate a legacy/partial record that cannot be safely
  // reauthorized after an extension update.
  if (typeof pending.tabId !== "number") {
    return {
      authorized: false,
      error: PROVIDER_AUTHORIZATION_REVOKED_ERROR,
      code: 4100,
    };
  }

  return validateInjectedPendingRequestAuthorization(pending);
}

/**
 * Remove and publish a terminal failure after a last-safe-point authorization
 * check fails. The caller must already own that request's resolution claim.
 */
export async function terminalizeUnauthorizedPendingRequest(
  kind: PendingRequestLifecycleKind,
  pending: PendingRequestLifecycleContext,
  failure: Extract<LifecycleValidationResult, { authorized: false }>,
): Promise<void> {
  if (kind === "transaction") {
    await removePendingTxRequest(pending.id);
    await writeBridgedProviderResult(`txResult:${pending.id}`, {
      success: false,
      error: failure.error,
      code: failure.code,
    }, pending);
    return;
  }
  if (kind === "signature") {
    await removePendingSignatureRequest(pending.id);
    await writeBridgedProviderResult(`sigResult:${pending.id}`, {
      success: false,
      error: failure.error,
      code: failure.code,
    }, pending);
    return;
  }
  if (kind === "batchTransaction") {
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

/** Validate and terminalize in one call so confirm handlers cannot forget it. */
export async function enforcePendingRequestAuthorizationAtConfirmation(
  kind: PendingRequestLifecycleKind,
  pending: PendingRequestLifecycleContext,
): Promise<LifecycleValidationResult> {
  const validation = await validatePendingRequestAuthorization(kind, pending);
  if (!validation.authorized) {
    await terminalizeUnauthorizedPendingRequest(kind, pending, validation);
  }
  return validation;
}

/** Install a synchronous gate before the permission storage mutation awaits. */
export function beginDappOriginRevocation(rawOrigin: string): string | null {
  const origin = normalizeDappOrigin(rawOrigin);
  if (origin) {
    dappOriginRevocationEpochs.set(
      origin,
      (dappOriginRevocationEpochs.get(origin) ?? 0) + 1,
    );
    revokingDappOrigins.add(origin);
  }
  return origin;
}

export function finishDappOriginRevocation(rawOrigin: string): void {
  const origin = normalizeDappOrigin(rawOrigin);
  if (origin) revokingDappOrigins.delete(origin);
}

export async function expireInjectedProviderRequest(
  kind: "transaction" | "signature",
  requestId: string,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  const trusted = trustedTopLevelDappOrigin(sender);
  if (!trusted) return { success: false, error: "Unauthorized" };

  if (kind === "transaction") {
    return runPendingRequestResolution({
      family: "transaction",
      requestId,
      action: "expire",
      conflictResult: () => ({
        success: false,
        error: "Request is already being resolved",
      }),
      resolve: async () => {
        const pending = await getPendingTxRequestById(requestId);
        if (
          !pending ||
          pending.walletConnect ||
          pending.tabId !== trusted.tabId ||
          !pendingRequestMatchesInjectedOrigin(pending, trusted.origin)
        ) {
          return { success: false, error: "Pending request not found" };
        }
        await removePendingTxRequest(requestId);
        await writeProviderResult(`txResult:${requestId}`, {
          success: false,
          error: PROVIDER_REQUEST_TIMEOUT_ERROR,
          code: -32000,
        });
        return { success: true, expired: true };
      },
    });
  }

  return runPendingRequestResolution({
    family: "signature",
    requestId,
    action: "expire",
    conflictResult: () => ({
      success: false,
      error: "Request is already being resolved",
    }),
    resolve: async () => {
      const pending = await getPendingSignatureRequestById(requestId);
      if (
        !pending ||
        pending.walletConnect ||
        pending.tabId !== trusted.tabId ||
        !pendingRequestMatchesInjectedOrigin(pending, trusted.origin)
      ) {
        return { success: false, error: "Pending request not found" };
      }
      await removePendingSignatureRequest(requestId);
      await writeProviderResult(`sigResult:${requestId}`, {
        success: false,
        error: PROVIDER_REQUEST_TIMEOUT_ERROR,
        code: -32000,
      });
      return { success: true, expired: true };
    },
  });
}

/** Test-only reset for service-worker-local revocation gates. */
export function resetPendingRequestLifecycleForTests(): void {
  revokingDappOrigins.clear();
  dappOriginRevocationEpochs.clear();
}

export const pendingRequestLifecycleErrors = {
  authorizationRevoked: PROVIDER_AUTHORIZATION_REVOKED_ERROR,
  timeout: PROVIDER_REQUEST_TIMEOUT_ERROR,
  walletConnectSessionEnded: WALLETCONNECT_SESSION_ENDED_ERROR,
} as const;
