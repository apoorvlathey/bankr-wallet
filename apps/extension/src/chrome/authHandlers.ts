/**
 * Stable authentication compatibility facade.
 *
 * The focused modules below own unlock/hydration, factors, Bankr credential
 * mutation, and password rotation. Existing message routing and callers keep
 * importing this file so the decomposition does not alter the public API.
 */

export {
  checkHasVaultKeySystem,
  handleUnlockWallet,
  type UnlockWalletResult,
} from "./auth/walletUnlock";
export {
  decryptAllKeysWithVaultKey,
  hydrateAuthSessionFromVaultKeyBytes,
  type HydrateAuthSessionOptions,
} from "./auth/sessionHydration";
export { verifyMasterPassword } from "./auth/masterPasswordVerification";
export {
  handleRemoveAgentPassword,
  handleSetAgentPassword,
} from "./auth/agentFactorHandlers";
export {
  commitPreparedApiKeyUpdate,
  handleSaveApiKeyWithCachedPassword,
  prepareApiKeyUpdateWithCachedPassword,
  type PreparedApiKeyUpdate,
} from "./auth/bankrCredentialUpdate";
export { handleChangePassword } from "./auth/masterPasswordRotation";
