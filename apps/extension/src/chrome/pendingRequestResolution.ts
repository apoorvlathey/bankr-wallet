/**
 * In-process, first-action-wins claims for user-facing pending requests.
 *
 * A single request can be rendered in the popup, side panel, and a detached
 * full-page view at the same time. Chrome dispatches messages to the service
 * worker synchronously, so installing a claim before deferring the resolver to
 * a microtask prevents two surfaces from signing/broadcasting (or approving
 * and rejecting) the same persisted request concurrently.
 *
 * The pending request remains the durable source of truth. A successful
 * terminal resolver removes it before this claim is released; a later action
 * therefore observes "not found" and cannot overwrite the terminal result.
 * Fulfilled pre-effect failures intentionally release the claim so the user
 * can correct a password or other recoverable input. Unexpected exceptions
 * retain it for the lifetime of the service worker: whether an external effect
 * occurred is unknown, so retrying could duplicate a signature or broadcast.
 */

export type PendingRequestFamily =
  | "transaction"
  | "signature"
  | "batchTransaction"
  | "dappConnection"
  | "addChain"
  | "watchAsset"
  | "crossDappBatch"
  | "internalOperation";

export type PendingRequestResolutionAction =
  | "confirm"
  | "reject"
  | "cancel"
  | "expire"
  | "move"
  | "edit"
  | "split"
  | "reset";

interface PendingRequestClaim {
  action: PendingRequestResolutionAction;
  token: symbol;
}

const claims = new Map<string, PendingRequestClaim>();
const externalClaims = new Map<
  string,
  { token: symbol; action: PendingRequestResolutionAction }
>();
let walletResetClaim: symbol | null = null;

function claimKey(family: PendingRequestFamily, requestId: string): string {
  return `${family}:${requestId}`;
}

/**
 * Run one resolver under a synchronous first-action-wins claim.
 *
 * `resolve` is deliberately deferred until after the claim is installed. A
 * fulfilled resolver releases the claim only after all of its awaited storage
 * and result writes finish. A rejected resolver is retained fail-closed.
 */
export function runPendingRequestResolution<T>(options: {
  family: PendingRequestFamily;
  requestId: string;
  action: PendingRequestResolutionAction;
  resolve: () => Promise<T>;
  conflictResult: (winningAction: PendingRequestResolutionAction) => T;
}): Promise<T> {
  return runPendingRequestResolutions({
    requests: [
      {
        family: options.family,
        requestId: options.requestId,
        action: options.action,
      },
    ],
    resolve: options.resolve,
    conflictResult: (_family, _requestId, winningAction) =>
      options.conflictResult(winningAction),
  });
}

/**
 * Atomically claim multiple pending resources. Moving a request into the
 * cross-dapp batch, for example, must own both the source request and the
 * destination batch before its first storage read; acquiring them one after
 * another would leave a microtask-sized race with confirmation.
 */
export function runPendingRequestResolutions<T>(options: {
  requests: Array<{
    family: PendingRequestFamily;
    requestId: string;
    action: PendingRequestResolutionAction;
  }>;
  resolve: () => Promise<T>;
  conflictResult: (
    family: PendingRequestFamily,
    requestId: string,
    winningAction: PendingRequestResolutionAction,
  ) => T;
}): Promise<T> {
  const unique = new Map<
    string,
    (typeof options.requests)[number] & { key: string }
  >();
  for (const request of options.requests) {
    const key = claimKey(request.family, request.requestId);
    if (!unique.has(key)) unique.set(key, { ...request, key });
  }

  if (walletResetClaim) {
    const first = unique.values().next().value as
      | ((typeof options.requests)[number] & { key: string })
      | undefined;
    if (first) {
      return Promise.resolve(
        options.conflictResult(first.family, first.requestId, "reset"),
      );
    }
  }

  for (const request of unique.values()) {
    const external = externalClaims.get(request.key);
    if (external) {
      return Promise.resolve(
        options.conflictResult(
          request.family,
          request.requestId,
          external.action,
        ),
      );
    }
    const existing = claims.get(request.key);
    if (existing) {
      return Promise.resolve(
        options.conflictResult(
          request.family,
          request.requestId,
          existing.action,
        ),
      );
    }
  }

  const installed = [...unique.values()].map((request) => {
    const claim: PendingRequestClaim = {
      action: request.action,
      token: Symbol(request.key),
    };
    claims.set(request.key, claim);
    return { key: request.key, claim };
  });

  const resolution = Promise.resolve().then(options.resolve);
  return resolution.then(
    (result) => {
      for (const { key, claim } of installed) {
        if (claims.get(key)?.token === claim.token) claims.delete(key);
      }
      return result;
    },
    (error) => {
      // Do not release on an unexpected error. It may have happened after a
      // remote signer accepted a request or after an RPC broadcast, and a
      // retry could duplicate that effect. A service-worker restart is the
      // conservative recovery boundary; durable pending/result state is read
      // again after restart.
      // Deliberately retain every installed map entry.
      throw error;
    },
  );
}

/**
 * Register a resolution owned by a specialized single-flight implementation
 * (currently ERC-7715) with the global reset barrier. Returns null while reset
 * owns the barrier. The caller must release only after fulfilled terminal or
 * safely retryable work; rejected/ambiguous work stays registered fail-closed.
 */
export function beginExternalPendingRequestResolution(
  key: string,
  action: PendingRequestResolutionAction = "confirm",
): symbol | null {
  if (walletResetClaim || externalClaims.has(key)) return null;
  const token = Symbol(key);
  externalClaims.set(key, { token, action });
  return token;
}

export function finishExternalPendingRequestResolution(
  key: string,
  token: symbol,
): void {
  if (externalClaims.get(key)?.token === token) externalClaims.delete(key);
}

export interface PendingRequestEffectLease {
  release: () => void;
}

export interface PendingRequestEffectGuard {
  /** Call synchronously immediately before invoking the signer/submitter. */
  beginEffect: () => void;
  /** Call only after the signer/submitter returns a definitive response. */
  settleEffect: () => void;
  /** Release only when no invoked effect has an unknown outcome. */
  releaseIfSafe: () => void;
}

/**
 * Track whether a remote/local effect invocation has an unknown outcome.
 * Exceptions before `beginEffect` are safely retryable; exceptions after it
 * retain the lease fail-closed unless `settleEffect` observed a definitive
 * response. This matters when an RPC/API accepted a request but its response
 * was lost.
 */
export function guardPendingRequestEffectLease(
  lease?: PendingRequestEffectLease,
): PendingRequestEffectGuard {
  let ambiguous = false;
  return {
    beginEffect: () => {
      ambiguous = true;
    },
    settleEffect: () => {
      ambiguous = false;
    },
    releaseIfSafe: () => {
      if (!ambiguous) lease?.release();
    },
  };
}

/**
 * Keep reset and competing lifecycle actions blocked after an async handler
 * has consumed durable pending state but before its background processor
 * reaches the irreversible signing/broadcast boundary.
 */
export function beginPendingRequestEffectLease(
  family: PendingRequestFamily,
  requestId: string,
): PendingRequestEffectLease | null {
  const key = claimKey(family, requestId);
  const token = beginExternalPendingRequestResolution(key, "confirm");
  if (!token) return null;
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      finishExternalPendingRequestResolution(key, token);
    },
  };
}

/**
 * Reset is mutually exclusive with every signing/broadcast/grant resolver.
 * The barrier is installed synchronously before reset's first auth/storage
 * await. A conflict is visible to the caller; reset never pretends it
 * cancelled an already-approved operation.
 */
export function runWalletResetAgainstPendingResolutions<T>(options: {
  resolve: () => Promise<T>;
  conflictResult: () => T;
}): Promise<T> {
  if (walletResetClaim || claims.size > 0 || externalClaims.size > 0) {
    return Promise.resolve(options.conflictResult());
  }

  const token = Symbol("wallet-reset");
  walletResetClaim = token;
  const reset = Promise.resolve().then(options.resolve);
  return reset.then(
    (result) => {
      if (walletResetClaim === token) walletResetClaim = null;
      return result;
    },
    (error) => {
      // A partially failed reset has unknown durable state. Retain the barrier
      // until service-worker restart instead of permitting a signing action to
      // run against an identity that may be half removed.
      throw error;
    },
  );
}

/**
 * Cancellation is a control signal for an already-winning confirmation, not
 * a competing terminal result writer. Permit it only while confirmation owns
 * the request; rejection and another cancellation still win exclusively.
 */
export function canSignalPendingTransactionCancellation(
  requestId: string,
): boolean {
  const existing = claims.get(claimKey("transaction", requestId));
  return !existing || existing.action === "confirm";
}

export function pendingRequestResolutionAction(
  family: PendingRequestFamily,
  requestId: string,
): PendingRequestResolutionAction | null {
  return claims.get(claimKey(family, requestId))?.action ?? null;
}

/** Test-only reset for this service-worker-local coordination state. */
export function resetPendingRequestResolutionClaimsForTests(): void {
  claims.clear();
  externalClaims.clear();
  walletResetClaim = null;
}
