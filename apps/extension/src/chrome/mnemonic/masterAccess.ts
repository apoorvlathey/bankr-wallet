import { handleUnlockWallet } from "../authHandlers";
import { getAuthCeremonyEpoch } from "../authTransition";
import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import {
  unlockMnemonicKeyWithPassword,
} from "./recovery";
import { loadMnemonicVault } from "./repository";
import {
  getCachedMnemonicKey,
  getCachedPassword,
  getCachedVaultKey,
  resolvePasswordType,
  setCachedMnemonicKey,
} from "../sessionCache";

const MASTER_MNEMONIC_ACCESS = Symbol("master-mnemonic-access");

/**
 * A service-worker-only snapshot of the material needed to read or extend the
 * mnemonic vault. The capability brand and every sensitive field are
 * non-enumerable, so Chrome structured cloning or JSON serialization cannot
 * carry its credential/key material across a message boundary. Persistent
 * effects must still re-check `authEpoch` immediately before their storage
 * commit; possession of this value is not authorization by itself.
 */
export interface MasterMnemonicAccess {
  readonly success: true;
  readonly [MASTER_MNEMONIC_ACCESS]: true;
  readonly password: string | null;
  readonly mnemonicKey: ReturnType<typeof getCachedMnemonicKey>;
  readonly vaultKey: CryptoKey | null;
  readonly authEpoch: string;
}

export type MasterMnemonicAccessResult =
  | MasterMnemonicAccess
  | { success: false; error: string };

function createMasterMnemonicAccess(
  values: Omit<MasterMnemonicAccess, "success" | typeof MASTER_MNEMONIC_ACCESS>,
): MasterMnemonicAccess {
  const access = {} as MasterMnemonicAccess;
  Object.defineProperties(access, {
    success: { value: true, enumerable: true },
    [MASTER_MNEMONIC_ACCESS]: { value: true },
    password: { value: values.password },
    mnemonicKey: { value: values.mnemonicKey },
    vaultKey: { value: values.vaultKey },
    authEpoch: { value: values.authEpoch },
  });
  return Object.freeze(access);
}

export async function resolveMasterMnemonicAccess(): Promise<MasterMnemonicAccessResult> {
  const passwordType = await resolvePasswordType(handleUnlockWallet);
  if (passwordType === "agent") {
    return {
      success: false,
      error: "Seed phrase actions require the master password",
    };
  }
  if (passwordType !== "master") {
    return { success: false, error: "Wallet must be unlocked" };
  }
  const authEpoch = getAuthCeremonyEpoch();

  const password = getCachedPassword();
  let mnemonicKey = getCachedMnemonicKey();
  if (!mnemonicKey && password) {
    try {
      const unlocked = await unlockMnemonicKeyWithPassword(password);
      if (unlocked) {
        assertCurrentMasterAuthorization(authEpoch);
        mnemonicKey = { key: unlocked.key, keyId: unlocked.keyId };
        setCachedMnemonicKey(mnemonicKey);
      }
    } catch {
      // Preserve the active wallet session. The caller receives a narrowly
      // scoped mnemonic-recovery error below without rewriting ciphertext.
    }
  }

  const vaultKey = getCachedVaultKey();
  const storedMnemonicVault = await loadMnemonicVault();
  try {
    assertCurrentMasterAuthorization(authEpoch);
  } catch {
    return { success: false, error: "Wallet must be unlocked" };
  }
  if (storedMnemonicVault?.version === 2 && !mnemonicKey) {
    return {
      success: false,
      error:
        "Seed phrase protection could not be unlocked. Unlock with the master password and retry biometric setup.",
    };
  }
  if (!password && !mnemonicKey) {
    return {
      success: false,
      error:
        "Unlock with the master password and set up biometric unlock again to use seed phrases.",
    };
  }

  return createMasterMnemonicAccess({
    password,
    mnemonicKey,
    vaultKey,
    authEpoch,
  });
}
