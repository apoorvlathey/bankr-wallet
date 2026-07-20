import { handleUnlockWallet } from "../authHandlers";
import { resolvePasswordType } from "../sessionCache";
import type { PasswordType } from "../types";

/** Restore or establish a live wallet session before asking the device to sign. */
export async function ensureLedgerSigningSession(
  password: string,
): Promise<PasswordType> {
  const restoredType = await resolvePasswordType(handleUnlockWallet);
  if (restoredType) return restoredType;

  if (typeof password === "string" && password.length > 0) {
    const unlocked = await handleUnlockWallet(password);
    if (unlocked.success && unlocked.passwordType) return unlocked.passwordType;
    throw new Error(unlocked.error || "Invalid password");
  }

  throw new Error("Wallet must be unlocked");
}
