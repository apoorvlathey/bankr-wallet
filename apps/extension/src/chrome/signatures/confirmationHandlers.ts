import {
  hasEncryptedApiKey,
  loadDecryptedApiKey,
} from "../crypto";
import { signMessageViaApi } from "../bankr/signing";
import { handleSignatureRequest as localSignatureRequest } from "../localSigner";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { removePendingSignatureRequest } from "../requests/pendingSignatureStorage";
import { revalidatePendingSignatureBeforeRelease } from "../requests/pendingSignatureRelease";
import type { SignatureResult } from "../transactions/runtime";
import {
  getCachedApiKey,
  getCachedPassword,
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedApiKey,
  setCachedVault,
  tryRestoreSession,
} from "../sessionCache";
import {
  prepareSignatureConfirmation,
  type PreparedSignatureConfirmation,
} from "./confirmationPolicy";
import { decryptAllKeys } from "../vaultCrypto";

/** Confirms a private-key or seed-phrase signature request. */
export async function handleConfirmSignatureRequest(
  sigId: string,
  password: string,
  tabId?: number,
  allowUnsafeSiwe = false,
): Promise<SignatureResult> {
  const preflight = await prepareSignatureConfirmation(sigId, allowUnsafeSiwe);
  if (!preflight.ok) return preflight.result;
  const { account } = preflight.value;

  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return {
      success: false,
      error:
        "Signatures are only supported for Private Key and Seed Phrase accounts",
    };
  }

  let privateKey = getPrivateKeyFromCache(account.id);
  if (!privateKey) {
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const { handleUnlockWallet } = await import("../authHandlers");
      const restored = await tryRestoreSession(handleUnlockWallet);
      if (restored) {
        privateKey = getPrivateKeyFromCache(account.id);
      }
    }

    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      let vault;
      if (cachedVaultKey) {
        const { decryptAllKeysWithVaultKey } = await import("../authHandlers");
        vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
      } else {
        vault = await decryptAllKeys(password);
      }

      if (!vault) {
        return { success: false, error: "Invalid password" };
      }
      setCachedVault(vault);

      const hasApiKey = await hasEncryptedApiKey();
      if (hasApiKey) {
        const apiKey = await loadDecryptedApiKey(password);
        if (apiKey) {
          setCachedApiKey(apiKey, password);
        }
      }

      privateKey = getPrivateKeyFromCache(account.id);
      if (!privateKey) {
        return { success: false, error: "Private key not found for account" };
      }
    }
  }

  return executeLocalSignature(sigId, preflight.value, privateKey);
}

async function executeLocalSignature(
  sigId: string,
  prepared: PreparedSignatureConfirmation,
  privateKey: `0x${string}`,
): Promise<SignatureResult> {
  const { pending, account } = prepared;
  try {
    await removePendingSignatureRequest(sigId);

    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "signature",
        pending,
      );
    if (!authorization.authorized) {
      return { success: false, error: authorization.error };
    }

    const effectLease = beginPendingRequestEffectLease("signature", sigId);
    if (!effectLease) {
      return { success: false, error: "Wallet reset is in progress" };
    }
    const effectGuard = guardPendingRequestEffectLease(effectLease);
    try {
      let signature: string;
      try {
        effectGuard.beginEffect();
        signature = await localSignatureRequest(
          privateKey,
          pending.signature.method,
          pending.signature.params,
          pending.signature.chainId,
        );
        effectGuard.settleEffect();
      } catch (error) {
        effectGuard.settleEffect();
        throw error;
      }
      const finalAuthorization =
        await revalidatePendingSignatureBeforeRelease(pending, account.type);
      if (!finalAuthorization.authorized) {
        return { success: false, error: finalAuthorization.error };
      }
      return { success: true, signature };
    } finally {
      effectGuard.releaseIfSafe();
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Signing failed",
    };
  }
}

/** Confirms a Bankr API signature request. */
export async function handleConfirmSignatureRequestBankr(
  sigId: string,
  password: string,
  allowUnsafeSiwe = false,
): Promise<SignatureResult> {
  const preflight = await prepareSignatureConfirmation(sigId, allowUnsafeSiwe);
  if (!preflight.ok) return preflight.result;
  const { pending, account } = preflight.value;

  if (account.type !== "bankr") {
    return { success: false, error: "Pending request is no longer valid" };
  }

  let apiKey = getCachedApiKey();
  if (!apiKey) {
    if (!getCachedPassword()) {
      const { tryRestoreSession } = await import("../sessionCache");
      const { handleUnlockWallet } = await import("../authHandlers");
      await tryRestoreSession(handleUnlockWallet);
      apiKey = getCachedApiKey();
    }

    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        return { success: false, error: "Invalid password" };
      }
      setCachedApiKey(apiKey, password);
    }
  }

  try {
    await removePendingSignatureRequest(sigId);

    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "signature",
        pending,
      );
    if (!authorization.authorized) {
      return { success: false, error: authorization.error };
    }

    const effectLease = beginPendingRequestEffectLease("signature", sigId);
    if (!effectLease) {
      return { success: false, error: "Wallet reset is in progress" };
    }
    const effectGuard = guardPendingRequestEffectLease(effectLease);
    try {
      effectGuard.beginEffect();
      const result = await signMessageViaApi(
        apiKey,
        pending.signature.method,
        pending.signature.params,
      );
      effectGuard.settleEffect();
      const finalAuthorization =
        await revalidatePendingSignatureBeforeRelease(pending, "bankr");
      if (!finalAuthorization.authorized) {
        return { success: false, error: finalAuthorization.error };
      }
      return { success: true, signature: result.signature };
    } finally {
      effectGuard.releaseIfSafe();
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Signing failed",
    };
  }
}
