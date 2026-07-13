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
  type LifecycleValidationResult,
  type PendingRequestLifecycleContext,
  type PendingRequestLifecycleKind,
} from "./pendingRequestLifecycle";
import { terminalizeUnauthorizedPendingRequest } from "./pendingRequestTerminalization";
import { runErc7715PermissionResolution } from "../erc7715/resolution";
import {
  runPendingRequestResolution,
  type PendingRequestFamily,
} from "./pendingRequestResolution";
import {
  getWalletConnectPendingRequest,
  getWalletConnectPendingRequests,
  removeWalletConnectPendingRequest,
  type WalletConnectPendingRequest,
} from "../walletConnect/storage";
import { cancelCrossDappBatchForWalletConnectTopic } from "../crossDappBatch/lifecycle";

const SESSION_ENDED_ERROR = "WalletConnect session is no longer active";
const terminatingTopics = new Set<string>();
const topicTerminationEpochs = new Map<string, number>();

function beginWalletConnectTopicTermination(topic: string): void {
  topicTerminationEpochs.set(
    topic,
    (topicTerminationEpochs.get(topic) ?? 0) + 1,
  );
  terminatingTopics.add(topic);
}

/**
 * Capture a synchronous commit guard before multi-source async validation.
 * The epoch remains advanced even if a disconnect later fails and the live
 * session is resumed, so a confirmation that overlapped that disconnect can
 * never publish an effect based on a stale transport check.
 */
export function captureWalletConnectTerminationSnapshot(topic: string): {
  isCurrent: () => boolean;
} {
  const epoch = topicTerminationEpochs.get(topic) ?? 0;
  const wasTerminating = terminatingTopics.has(topic);
  return {
    isCurrent: () =>
      !wasTerminating &&
      !terminatingTopics.has(topic) &&
      (topicTerminationEpochs.get(topic) ?? 0) === epoch,
  };
}

function topicFromOrigin(origin: string): string | null {
  const prefix = "walletconnect:";
  if (!origin.startsWith(prefix)) return null;
  return origin.slice(prefix.length) || null;
}

function expectedRouteKind(
  kind: PendingRequestLifecycleKind,
): WalletConnectPendingRequest["kind"] | null {
  if (kind === "transaction") return "transaction";
  if (kind === "signature") return "signature";
  if (kind === "erc7715Permission") return "erc7715Permission";
  // wallet_sendCalls is acknowledged immediately and has no deferred route.
  return null;
}

export async function validateWalletConnectPendingRequestAuthorization(
  kind: PendingRequestLifecycleKind,
  pending: PendingRequestLifecycleContext,
): Promise<LifecycleValidationResult> {
  const explicit = pending.walletConnect;
  const routeKind = expectedRouteKind(kind);
  const route = routeKind
    ? await getWalletConnectPendingRequest(pending.id)
    : null;
  const topic = explicit?.topic || topicFromOrigin(pending.origin) || "";

  const routeMatches = routeKind
    ? route?.kind === routeKind &&
      route.topic === topic &&
      (explicit?.requestId === undefined ||
        route.requestId === explicit.requestId) &&
      (explicit?.method === undefined || route.method === explicit.method)
    : kind === "batchTransaction" && !!explicit?.topic;

  if (!topic || !routeMatches || terminatingTopics.has(topic)) {
    return { authorized: false, error: SESSION_ENDED_ERROR, code: 4100 };
  }

  try {
    const { isWalletConnectSessionActive } = await import(
      "../walletConnect/client"
    );
    if (
      !(await isWalletConnectSessionActive(topic)) ||
      terminatingTopics.has(topic)
    ) {
      return { authorized: false, error: SESSION_ENDED_ERROR, code: 4100 };
    }
  } catch {
    return { authorized: false, error: SESSION_ENDED_ERROR, code: 4100 };
  }
  return { authorized: true };
}

function matchesTopic(
  pending: PendingRequestLifecycleContext,
  topic: string,
  routedIds: ReadonlySet<string>,
): boolean {
  return (
    pending.walletConnect?.topic === topic ||
    topicFromOrigin(pending.origin) === topic ||
    routedIds.has(pending.id)
  );
}

const terminalFailure = {
  authorized: false as const,
  error: SESSION_ENDED_ERROR,
  code: 4100,
};

async function cancelClaimedPending<T extends PendingRequestLifecycleContext>({
  family,
  kind,
  requestId,
  topic,
  routedIds,
  getCurrent,
  onCancelled,
}: {
  family: PendingRequestFamily;
  kind: Exclude<PendingRequestLifecycleKind, "erc7715Permission">;
  requestId: string;
  topic: string;
  routedIds: ReadonlySet<string>;
  getCurrent: () => Promise<T | null>;
  onCancelled: () => void;
}): Promise<void> {
  await runPendingRequestResolution({
    family,
    requestId,
    action: "expire",
    conflictResult: () => undefined,
    resolve: async () => {
      const current = await getCurrent();
      if (!current || !matchesTopic(current, topic, routedIds)) return;
      await terminalizeUnauthorizedPendingRequest(
        kind,
        current,
        terminalFailure,
      );
      onCancelled();
    },
  });
}

export interface WalletConnectPendingCancellationSummary {
  transactions: number;
  signatures: number;
  batches: number;
  permissions: number;
}

/** Terminalize every approval owned by one confirmed-terminating session. */
export async function cancelPendingRequestsForWalletConnectTopic(
  topic: string,
): Promise<WalletConnectPendingCancellationSummary> {
  const summary: WalletConnectPendingCancellationSummary = {
    transactions: 0,
    signatures: 0,
    batches: 0,
    permissions: 0,
  };
  if (!topic) return summary;

  // Install before the first await. A concurrent confirm that has not reached
  // its last-safe-point check will fail even while storage is being listed.
  beginWalletConnectTopicTermination(topic);
  const [transactions, signatures, batches, permissions, routes] =
    await Promise.all([
      getPendingTxRequests(),
      getPendingSignatureRequests(),
      getPendingBatchTxRequests(),
      getPendingErc7715PermissionRequests(),
      getWalletConnectPendingRequests(),
    ]);
  const routedIds = new Set(
    Object.values(routes)
      .filter((route) => route.topic === topic)
      .map((route) => route.id),
  );

  await Promise.all([
    ...transactions
      .filter((pending) => matchesTopic(pending, topic, routedIds))
      .map((pending) =>
        cancelClaimedPending({
          family: "transaction",
          kind: "transaction",
          requestId: pending.id,
          topic,
          routedIds,
          getCurrent: () => getPendingTxRequestById(pending.id),
          onCancelled: () => {
            summary.transactions += 1;
          },
        }),
      ),
    ...signatures
      .filter((pending) => matchesTopic(pending, topic, routedIds))
      .map((pending) =>
        cancelClaimedPending({
          family: "signature",
          kind: "signature",
          requestId: pending.id,
          topic,
          routedIds,
          getCurrent: () => getPendingSignatureRequestById(pending.id),
          onCancelled: () => {
            summary.signatures += 1;
          },
        }),
      ),
    ...batches
      .filter((pending) => matchesTopic(pending, topic, routedIds))
      .map((pending) =>
        cancelClaimedPending({
          family: "batchTransaction",
          kind: "batchTransaction",
          requestId: pending.id,
          topic,
          routedIds,
          getCurrent: () => getPendingBatchTxRequestById(pending.id),
          onCancelled: () => {
            summary.batches += 1;
          },
        }),
      ),
    ...permissions
      .filter((pending) => matchesTopic(pending, topic, routedIds))
      .map((pending) =>
        runErc7715PermissionResolution(pending.id, async () => {
          const current = await getPendingErc7715PermissionRequestById(
            pending.id,
          );
          if (current && matchesTopic(current, topic, routedIds)) {
            await terminalizeUnauthorizedPendingRequest(
              "erc7715Permission",
              current,
              terminalFailure,
            );
            summary.permissions += 1;
          }
          return { success: false, error: SESSION_ENDED_ERROR };
        }),
      ),
    cancelCrossDappBatchForWalletConnectTopic(topic).then((cross) => {
      summary.transactions += cross.transactions;
      summary.batches += cross.bundles;
    }),
  ]);

  return summary;
}

/** Discard routes only after the SDK confirms that the session is gone. */
export async function finalizeWalletConnectTopicTermination(
  topic: string,
): Promise<void> {
  if (!topic) return;
  if (!terminatingTopics.has(topic)) {
    beginWalletConnectTopicTermination(topic);
  }
  await Promise.all(
    Object.values(await getWalletConnectPendingRequests())
      .filter((route) => route.topic === topic)
      .map((route) => removeWalletConnectPendingRequest(route.id)),
  );
}

/** A failed manual disconnect must not permanently poison a live session. */
export function resumeWalletConnectTopicAfterFailedTermination(
  topic: string,
): void {
  terminatingTopics.delete(topic);
}

/** Test-only reset for service-worker-local session termination gates. */
export function resetPendingWalletConnectLifecycleForTests(): void {
  terminatingTopics.clear();
  topicTerminationEpochs.clear();
}

export const pendingWalletConnectLifecycleErrors = {
  sessionEnded: SESSION_ENDED_ERROR,
} as const;
