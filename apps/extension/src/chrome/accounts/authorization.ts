/** Revalidate an optional master-session epoch at an account commit boundary. */

import { assertCurrentMasterAuthorization } from "../masterAuthorization";

export function assertAccountStorageAuthorized(
  expectedAuthEpoch?: string,
): void {
  if (expectedAuthEpoch) {
    assertCurrentMasterAuthorization(expectedAuthEpoch);
  }
}
