import { getAccounts } from "../accountStorage";
import type { Account } from "../types";
import {
  WALLETCONNECT_SUPPORTED_METHODS,
  getSessionAccounts,
  isAddress,
  isSigningAccount,
  type SigningAccount,
} from "./sessionPolicy";

export type SessionAccount = SigningAccount | Extract<Account, { type: "safe" }>;

const SAFE_UNSUPPORTED_SESSION_METHODS = new Set([
  "personal_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "wallet_getSupportedExecutionPermissions",
  "wallet_requestExecutionPermissions",
  "wallet_getGrantedExecutionPermissions",
]);

const LEDGER_UNSUPPORTED_SESSION_METHODS = new Set([
  "wallet_getCapabilities",
  "wallet_sendCalls",
  "wallet_getCallsStatus",
  "wallet_showCallsStatus",
  "wallet_getSupportedExecutionPermissions",
  "wallet_requestExecutionPermissions",
  "wallet_getGrantedExecutionPermissions",
]);

export function getWalletConnectMethodsForAccount(account: SessionAccount): string[] {
  const unsupported = account.type === "safe"
    ? SAFE_UNSUPPORTED_SESSION_METHODS
    : account.type === "ledger"
      ? LEDGER_UNSUPPORTED_SESSION_METHODS
      : null;
  return unsupported
    ? WALLETCONNECT_SUPPORTED_METHODS.filter(
        (method) => !unsupported.has(method),
      )
    : [...WALLETCONNECT_SUPPORTED_METHODS];
}

export function isSessionAccount(account: Account | null): account is SessionAccount {
  return isSigningAccount(account) || account?.type === "safe";
}

export async function resolveSessionAccount(
  session: any,
  chainId: number,
  requestedAddress: string | null,
): Promise<SessionAccount> {
  const authorized = getSessionAccounts(session, chainId);
  const requested = requestedAddress || authorized[0];
  if (!isAddress(requested) || !authorized.some((entry) => entry.toLowerCase() === requested.toLowerCase())) {
    throw new Error("Requested account is not authorized for this session");
  }
  const matching = (await getAccounts()).filter(
    (entry) => entry.address.toLowerCase() === requested.toLowerCase() && isSessionAccount(entry),
  );
  if (matching.length !== 1) {
    throw new Error(matching.length > 1
      ? "Session account identity is ambiguous"
      : "No supported account found for this session");
  }
  return matching[0] as SessionAccount;
}
