/** First general-vault credential commit for a marker-owned fresh wallet. */

import {
  encryptVaultKey,
  encryptWithVaultKey,
  generateVaultKey,
  importVaultKey,
} from "../crypto";
import { hydrateAuthSessionFromVaultKeyBytes } from "../authHandlers";
import { clearAllAuthState } from "../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import { invalidateAuthCeremonies } from "../authTransition";
import { isOnboardingInitializationOwner } from "./state";
import { newPasswordPolicyError } from "@/constants/securityPolicy";

export async function initializeOnboardingCredential(
  initializationId: string,
  credential: string,
  password: string,
): Promise<{
  success: boolean;
  error?: string;
  passwordType?: "master";
}> {
  const passwordError = newPasswordPolicyError(password, "Password");
  if (
    !initializationId ||
    !credential ||
    credential.length > 65_536 ||
    passwordError
  ) {
    return {
      success: false,
      error: passwordError || "Wallet setup session is no longer valid",
    };
  }

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    if (!(await isOnboardingInitializationOwner(initializationId))) {
      return { success: false, error: "Wallet setup session is no longer valid" };
    }

    try {
      const vaultKeyBytes = generateVaultKey();
      const vaultKey = await importVaultKey(vaultKeyBytes);
      const [encryptedVaultKeyMaster, encryptedApiKeyVault] = await Promise.all([
        encryptVaultKey(vaultKeyBytes, password),
        encryptWithVaultKey(vaultKey, credential),
      ]);

      // This single write establishes the wallet's first recovery factor and
      // credential. Fresh-onboarding preflight already rejected prior wallets.
      await chrome.storage.local.set({
        encryptedVaultKeyMaster,
        encryptedApiKeyVault,
        encryptedApiKey: null,
        encryptedVaultKeyAgent: null,
        agentPasswordEnabled: false,
      });

      const hydrated = await hydrateAuthSessionFromVaultKeyBytes(
        vaultKeyBytes,
        "master",
        {
          password,
          persistPasswordSession: true,
          secretOperationAlreadySerialized: true,
        },
      );
      if (!hydrated.success) {
        await clearAllAuthState().catch(() => undefined);
        return hydrated;
      }

      invalidateAuthCeremonies();
      return { success: true, passwordType: "master" };
    } catch (error) {
      await clearAllAuthState().catch(() => undefined);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize wallet credentials",
      };
    }
  });
}
