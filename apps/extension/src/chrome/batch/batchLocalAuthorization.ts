import { getAccountById } from "../accountStorage";
import type { PendingBatchTxRequest } from "../erc5792Types";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";

/** Final pinned-account and transport gate immediately before local RPC. */
export async function authorizePendingLocalBatchBroadcast(
  pending: PendingBatchTxRequest,
  expectedAccount: { id: string; address: string; type: string },
  beginEffect: () => void,
): Promise<void> {
  const latestAccount = await getAccountById(expectedAccount.id);
  if (
    !latestAccount ||
    latestAccount.type !== expectedAccount.type ||
    latestAccount.address.toLowerCase() !==
      expectedAccount.address.toLowerCase()
  ) {
    throw new Error("Pending request account is no longer available");
  }

  // Keep this as the last await so origin/WC revocation cannot interleave
  // between the authority decision and the effect boundary.
  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
      "batchTransaction",
      pending,
    );
  if (!authorization.authorized) throw new Error(authorization.error);
  if (pending.privacyRagequitMeta) {
    const { authorizePrivacyRagequitBatchConfirmation } = await import(
      "../privacy/ragequit/submission"
    );
    const { beginPrivacyRagequitBatchSubmission } = await import(
      "../privacy/ragequit/lifecycle"
    );
    const privacyAuthorization =
      await authorizePrivacyRagequitBatchConfirmation(pending);
    await beginPrivacyRagequitBatchSubmission(pending, privacyAuthorization);
  }
  beginEffect();
}
