import { getAccountById } from "../accountStorage";
import {
  enforcePendingRequestAuthorizationAtConfirmation,
  type PendingRequestLifecycleContext,
  type PendingRequestLifecycleKind,
} from "../requests/pendingRequestLifecycle";

type PinnedBankrPending = PendingRequestLifecycleContext & {
  accountId?: string;
  accountAddress?: string;
  accountType?: string;
};

/**
 * Last async gate before a Bankr submit. `submitTransactionDirect` invokes
 * this while holding the wallet-secret operation lock, then starts fetch
 * synchronously before releasing the lock. Keep `beginEffect` last: no await
 * may occur after it and before the irreversible HTTP request starts.
 */
export async function authorizePendingBankrSubmit(
  kind: Extract<PendingRequestLifecycleKind, "transaction" | "batchTransaction">,
  pending: PinnedBankrPending,
  beginEffect: () => void,
  beforeEffect?: () => void | Promise<void>,
): Promise<void> {
  if (
    !pending.accountId ||
    !pending.accountAddress ||
    pending.accountType !== "bankr"
  ) {
    throw new Error("Pending request is no longer valid");
  }
  const account = await getAccountById(pending.accountId);
  if (
    !account ||
    account.type !== "bankr" ||
    account.address.toLowerCase() !== pending.accountAddress.toLowerCase()
  ) {
    throw new Error("Pending request is no longer valid");
  }
  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(kind, pending);
  if (!authorization.authorized) throw new Error(authorization.error);
  await beforeEffect?.();
  beginEffect();
}
