import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import { revalidatePendingSignatureBeforeRelease } from "../requests/pendingSignatureRelease";
import { removePendingSignatureRequest } from "../requests/pendingSignatureStorage";
import type { SignatureResult } from "../transactions/runtime";
import { prepareSignatureConfirmation } from "../signatures/confirmationPolicy";
import { ensureLedgerSigningSession } from "./session";
import { signLedgerSignatureRequest } from "./signing";

/** Confirms a pinned Ledger message or EIP-712 signature request. */
export async function handleConfirmLedgerSignatureRequest(
  sigId: string,
  password: string,
  _tabId?: number,
  allowUnsafeSiwe = false,
): Promise<SignatureResult> {
  const preflight = await prepareSignatureConfirmation(sigId, allowUnsafeSiwe);
  if (!preflight.ok) return preflight.result;
  const { pending, account } = preflight.value;
  if (account.type !== "ledger") {
    return { success: false, error: "Pending request is no longer valid" };
  }

  try {
    await ensureLedgerSigningSession(password);
    const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
      "signature",
      pending,
    );
    if (!authorization.authorized) {
      return { success: false, error: authorization.error };
    }
    const lease = beginPendingRequestEffectLease("signature", sigId);
    if (!lease) return { success: false, error: "Wallet reset is in progress" };
    const effectGuard = guardPendingRequestEffectLease(lease);
    try {
      effectGuard.beginEffect();
      let signature: `0x${string}`;
      try {
        signature = await signLedgerSignatureRequest({
          opId: sigId,
          account,
          method: pending.signature.method,
          params: pending.signature.params,
          chainId: pending.signature.chainId,
        });
        effectGuard.settleEffect();
      } catch (error) {
        effectGuard.settleEffect();
        throw error;
      }
      const finalAuthorization = await revalidatePendingSignatureBeforeRelease(
        pending,
        "ledger",
      );
      if (!finalAuthorization.authorized) {
        return { success: false, error: finalAuthorization.error };
      }
      await removePendingSignatureRequest(sigId);
      return { success: true, signature };
    } finally {
      effectGuard.releaseIfSafe();
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ledger signing failed",
    };
  }
}
