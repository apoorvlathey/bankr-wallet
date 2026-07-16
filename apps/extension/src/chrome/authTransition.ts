/**
 * Serializes security-sensitive authentication state transitions.
 *
 * Chrome can dispatch messages from multiple extension views concurrently.
 * The queue makes each mutation linearizable, while the per-worker epoch lets
 * a WebAuthn ceremony prove that no lock/reset/password rotation happened
 * after the ceremony was started. A worker restart creates a new epoch, so
 * results produced for the previous worker are rejected as stale.
 */

let authCeremonyEpoch = crypto.randomUUID();
let authTransitionTail: Promise<void> = Promise.resolve();
let manualLockRestorationBlocked = false;

export function getAuthCeremonyEpoch(): string {
  return authCeremonyEpoch;
}

export function isCurrentAuthCeremonyEpoch(epoch: unknown): epoch is string {
  return typeof epoch === "string" && epoch === authCeremonyEpoch;
}

export function invalidateAuthCeremonies(): string {
  authCeremonyEpoch = crypto.randomUUID();
  return authCeremonyEpoch;
}

export function blockSessionRestorationForManualLock(): void {
  manualLockRestorationBlocked = true;
}

export function clearManualLockRestorationBlock(): void {
  manualLockRestorationBlocked = false;
}

export function isSessionRestorationBlockedByManualLock(): boolean {
  return manualLockRestorationBlocked;
}

export async function runSerializedAuthTransition<T>(
  transition: () => Promise<T>,
): Promise<T> {
  const previous = authTransitionTail;
  let release!: () => void;
  authTransitionTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);
  try {
    return await transition();
  } finally {
    release();
  }
}
