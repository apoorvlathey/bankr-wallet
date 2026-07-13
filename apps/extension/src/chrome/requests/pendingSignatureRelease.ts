import { getAccountById } from "../accountStorage";
import {
  enforcePendingRequestAuthorizationAtConfirmation,
  type PendingRequestLifecycleContext,
} from "./pendingRequestLifecycle";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";

type PendingSignatureReleaseContext = PendingRequestLifecycleContext & {
  accountId?: string;
  accountAddress?: string;
  accountType?: string;
};

/** Discard a completed signature if account/transport/credential authority moved while signing. */
export async function revalidatePendingSignatureBeforeRelease(
  pending: PendingSignatureReleaseContext,
  expectedType: "bankr" | "privateKey" | "seedPhrase",
): Promise<{ authorized: true } | { authorized: false; error: string }> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    if (!pending.accountId || !pending.accountAddress) {
      return { authorized: false, error: "Pending request is no longer valid" };
    }
    const account = await getAccountById(pending.accountId);
    if (
      !account ||
      account.type !== expectedType ||
      account.address.toLowerCase() !== pending.accountAddress.toLowerCase()
    ) {
      return { authorized: false, error: "Pending request is no longer valid" };
    }
    // Keep transport + Bankr credential binding as the final await. Account
    // and credential mutations are excluded by the operation lock, while the
    // lifecycle validator rechecks origin/WC revocation epochs.
    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "signature",
        pending,
      );
    return authorization.authorized
      ? { authorized: true }
      : { authorized: false, error: authorization.error };
  });
}
