import { getStoredResolvedChainById } from "@/lib/chains";
import { getAccountById } from "../../accountStorage";
import { handleUnlockWallet } from "../../authHandlers";
import {
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedVault,
  tryRestoreSession,
} from "../../sessionCache";
import type { Account } from "../../types";
import type { SwapAccountLock, SwapTxEntry } from "./types";

export async function resolveLockedSwapAccount(
  lock: SwapAccountLock | undefined,
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  if (!lock?.accountId || !lock.fromAddress) {
    return { ok: false, error: "Prepared swap is missing its account lock" };
  }
  const account = await getAccountById(lock.accountId);
  if (!account) return { ok: false, error: "Account no longer exists" };
  if (account.address.toLowerCase() !== lock.fromAddress.toLowerCase()) {
    return {
      ok: false,
      error: "Prepared swap account does not match the locked from address",
    };
  }
  return { ok: true, account };
}

export function validateLockedSwapTransactions(
  transactions: SwapTxEntry[],
  fromAddress: string,
  expectedChainId?: number,
): { ok: true } | { ok: false; error: string } {
  const lockedFrom = fromAddress.toLowerCase();
  for (const entry of transactions) {
    if (entry.tx.from.toLowerCase() !== lockedFrom) {
      return {
        ok: false,
        error: "Prepared swap transaction does not match the locked from account",
      };
    }
    if (
      expectedChainId !== undefined &&
      entry.tx.chainId !== expectedChainId
    ) {
      return {
        ok: false,
        error: "Prepared swap transaction chain does not match the requested chain",
      };
    }
  }
  return { ok: true };
}

export async function resolveLocalSwapPrivateKey(
  account: Extract<Account, { type: "privateKey" | "seedPhrase" }>,
): Promise<`0x${string}` | null> {
  let privateKey = getPrivateKeyFromCache(account.id);
  if (privateKey) return privateKey;

  const vaultKey = getCachedVaultKey();
  if (!vaultKey) {
    const restored = await tryRestoreSession(handleUnlockWallet);
    if (restored) privateKey = getPrivateKeyFromCache(account.id);
  }
  if (privateKey) return privateKey;

  const cachedVaultKey = getCachedVaultKey();
  if (cachedVaultKey) {
    const { decryptAllKeysWithVaultKey } = await import("../../authHandlers");
    const vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
    if (vault) setCachedVault(vault);
  }
  return getPrivateKeyFromCache(account.id);
}

export async function resolveSwapChain(chainId: number) {
  const resolved = await getStoredResolvedChainById(chainId);
  return {
    rpcUrl: resolved?.rpcUrl,
    customChainMeta: resolved?.isCustom
      ? {
          name: resolved.name,
          nativeCurrency: resolved.nativeCurrency,
          explorer: resolved.explorer || undefined,
        }
      : undefined,
  };
}
