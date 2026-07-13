import { isCurrentAuthCeremonyEpoch } from "../authTransition";
import { getPasswordType } from "../sessionCache";

export const STALE_MASTER_AUTHORIZATION_ERROR =
  "Authentication state changed. Unlock and try again.";

/**
 * Auth ceremony epochs cover explicit lock/factor/password transitions. Timed
 * expiry clears caches without advancing that epoch, so secret mutations must
 * validate both signals at their storage linearization point.
 */
export function hasCurrentMasterAuthorization(
  expectedAuthEpoch: string,
): boolean {
  return (
    isCurrentAuthCeremonyEpoch(expectedAuthEpoch) &&
    getPasswordType() === "master"
  );
}

export function assertCurrentMasterAuthorization(
  expectedAuthEpoch: string,
): void {
  if (!hasCurrentMasterAuthorization(expectedAuthEpoch)) {
    throw new Error(STALE_MASTER_AUTHORIZATION_ERROR);
  }
}
