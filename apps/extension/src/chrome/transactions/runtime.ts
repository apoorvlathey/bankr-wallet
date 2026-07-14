import type { Account } from "../types";
import type { WalletGetCallsStatusResult } from "../erc5792Types";
import { getAccountById } from "../accountStorage";
import { isRequestSigningAccount } from "../requests/pinnedRequest";

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface SignatureResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/** Durable result bridge used by injected and WalletConnect requests. */
export async function writeResultToStorage(
  key: string,
  result:
    | TransactionResult
    | SignatureResult
    | WalletGetCallsStatusResult
    | { error: string; code: number }
    | Record<string, unknown>,
): Promise<void> {
  await chrome.storage.local.set({ [key]: { result, timestamp: Date.now() } });
  try {
    const { completeWalletConnectRequestIfNeeded } = await import(
      "../walletConnect/resultBridge"
    );
    await completeWalletConnectRequestIfNeeded(
      key,
      result as Record<string, unknown>,
    );
  } catch (error) {
    console.warn("[WalletConnect] Result bridge failed", error);
  }
}

export const activeAbortControllers = new Map<string, AbortController>();

/** Resolves the immutable account binding captured at request intake. */
export async function resolvePinnedAccount(
  pending: { accountId?: string; accountAddress?: string },
): Promise<
  | { ok: true; account: Exclude<Account, { type: "impersonator" }> }
  | { ok: false; error: string }
> {
  if (!pending.accountId) {
    return { ok: false, error: "Pending request is no longer valid" };
  }
  const account = await getAccountById(pending.accountId);
  if (!account) {
    return { ok: false, error: "Account no longer exists" };
  }
  if (
    pending.accountAddress &&
    account.address.toLowerCase() !== pending.accountAddress.toLowerCase()
  ) {
    return { ok: false, error: "Pending request is no longer valid" };
  }
  if (!isRequestSigningAccount(account)) {
    return {
      ok: false,
      error: "View-only accounts cannot send transactions",
    };
  }
  return { ok: true, account };
}

export const processingTxIds = new Set<string>();

export interface FailedTxResult {
  txId: string;
  error: string;
  origin: string;
  chainId: number;
  timestamp: number;
}

export const failedTxResults = new Map<string, FailedTxResult>();
