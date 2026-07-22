import { importVaultKey } from "../crypto";
import { loadMnemonicVault, verifyMnemonicKeyForVault } from "../mnemonicStorage";
import type { UnwrappedPasskeyRecordKeys } from "./keyWrapping";

type MnemonicKey = { key: CryptoKey; keyId: string };
type MnemonicHydrationResult =
  | { ok: true; mnemonicKey: MnemonicKey | null }
  | { ok: false; error: string };

export async function preparePasskeyMnemonicKey(
  unwrapped: UnwrappedPasskeyRecordKeys,
): Promise<MnemonicHydrationResult> {
  if (!unwrapped.mnemonicKeyBytes || !unwrapped.mnemonicKeyId) {
    return { ok: true, mnemonicKey: null };
  }
  const mnemonicVault = await loadMnemonicVault();
  if (
    !mnemonicVault ||
    mnemonicVault.version !== 2 ||
    mnemonicVault.keyId !== unwrapped.mnemonicKeyId
  ) {
    return {
      ok: false,
      error: "Biometric seed protection does not match this wallet",
    };
  }
  const importedMnemonicKey = await importVaultKey(unwrapped.mnemonicKeyBytes);
  if (!(await verifyMnemonicKeyForVault(mnemonicVault, importedMnemonicKey))) {
    return {
      ok: false,
      error: "Biometric seed protection could not be verified. Unlock with the master password and upgrade biometric unlock.",
    };
  }
  return {
    ok: true,
    mnemonicKey: { key: importedMnemonicKey, keyId: unwrapped.mnemonicKeyId },
  };
}
