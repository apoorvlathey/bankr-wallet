import type { WalletConnectSessionSummary } from "@/types/walletConnect";
import { getAccounts } from "./accountStorage";
import type { Account } from "./types";
import type { SignatureMethod } from "./pendingSignatureStorage";

export type SigningAccount = Exclude<Account, { type: "impersonator" }>;

export const WALLETCONNECT_SUPPORTED_METHODS = [
  "eth_sendTransaction",
  "wallet_getCapabilities",
  "wallet_sendCalls",
  "wallet_getCallsStatus",
  "wallet_showCallsStatus",
  "wallet_getSupportedExecutionPermissions",
  "wallet_requestExecutionPermissions",
  "wallet_getGrantedExecutionPermissions",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "eth_accounts",
  "eth_requestAccounts",
  "eth_chainId",
  "net_version",
];

export const WALLETCONNECT_SUPPORTED_EVENTS = [
  "chainChanged",
  "accountsChanged",
];

export const WALLETCONNECT_SAFE_RPC_METHODS = new Set([
  "web3_clientVersion",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
]);

export function isSigningAccount(
  account: Account | null,
): account is SigningAccount {
  return !!account && account.type !== "impersonator";
}

export function chainIdFromCaip2(value: string | undefined): number | null {
  const raw = value?.split(":")[1];
  if (!raw) return null;
  const chainId = Number(raw);
  return Number.isInteger(chainId) && chainId > 0 ? chainId : null;
}

export function parseWalletChainId(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = value.startsWith("0x") ? parseInt(value, 16) : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function requestSignerAddress(method: string, params: any[]): string | null {
  if (method === "personal_sign") return isAddress(params?.[1]) ? params[1] : null;
  return isAddress(params?.[0]) ? params[0] : null;
}

export function isSignatureMethod(method: string): method is SignatureMethod {
  return (
    method === "personal_sign" ||
    method === "eth_sign" ||
    method === "eth_signTypedData" ||
    method === "eth_signTypedData_v3" ||
    method === "eth_signTypedData_v4"
  );
}

export function getSessionMetadata(session: any): {
  name: string;
  url: string;
  description?: string;
  icons: string[];
  icon: string | null;
} {
  const metadata = session?.peer?.metadata || {};
  const name = metadata.name || "WalletConnect Dapp";
  const url = metadata.url || "";
  const icons = Array.isArray(metadata.icons)
    ? metadata.icons.filter((icon: unknown): icon is string => typeof icon === "string")
    : [];
  return {
    name,
    url,
    description: metadata.description,
    icons,
    icon: icons[0] || null,
  };
}

export function getSessionAccounts(session: any, chainId?: number): string[] {
  const accounts = session?.namespaces?.eip155?.accounts || [];
  return accounts
    .filter((entry: unknown): entry is string => typeof entry === "string")
    .filter((entry) => !chainId || entry.startsWith(`eip155:${chainId}:`))
    .map((entry) => entry.split(":")[2])
    .filter(isAddress);
}

export async function resolveSessionSigningAccount(
  session: any,
  chainId: number,
  requestedAddress: string | null,
): Promise<SigningAccount> {
  const authorized = getSessionAccounts(session, chainId);
  const address = requestedAddress || authorized[0];
  if (!isAddress(address)) {
    throw new Error("No authorized account for this session");
  }
  if (!authorized.some((entry) => entry.toLowerCase() === address.toLowerCase())) {
    throw new Error("Requested account is not authorized for this session");
  }

  const account = (await getAccounts()).find(
    (entry) => entry.address.toLowerCase() === address.toLowerCase(),
  );
  if (!isSigningAccount(account || null)) {
    throw new Error("No signing account found for this session");
  }
  return account;
}

export function sessionSupportsChain(session: any, chainId: number): boolean {
  const caipChainId = `eip155:${chainId}`;
  const accounts = session?.namespaces?.eip155?.accounts || [];
  const chains = session?.namespaces?.eip155?.chains || [];
  return (
    accounts.some(
      (entry: unknown) =>
        typeof entry === "string" && entry.startsWith(`${caipChainId}:`),
    ) ||
    chains.some((entry: unknown) => entry === caipChainId)
  );
}

export function summarizeWalletConnectSession(
  session: any,
): WalletConnectSessionSummary {
  const metadata = getSessionMetadata(session);
  const accounts = getSessionAccounts(session);
  const chains = Array.from(
    new Set(
      (session?.namespaces?.eip155?.accounts || [])
        .map((entry: string) => chainIdFromCaip2(entry))
        .filter((chainId: number | null): chainId is number => chainId !== null),
    ),
  );

  return {
    topic: session.topic,
    name: metadata.name,
    url: metadata.url,
    description: metadata.description,
    icons: metadata.icons,
    chains,
    accounts: Array.from(new Set(accounts.map((account) => account.toLowerCase()))),
    expiry: session.expiry,
  };
}
