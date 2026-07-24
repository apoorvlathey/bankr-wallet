import type { WalletConnectSessionSummary } from "@/types/walletConnect";
import { getAccounts } from "../accountStorage";
import type { Account } from "../types";
import { parseProviderChainId } from "../provider/chainBoundary";
import type { SignatureMethod } from "../requests/pendingSignatureStorage";
import { sanitizeUntrustedImageUrl } from "@/lib/remoteImagePolicy";

const MAX_WALLETCONNECT_NAME_CHARS = 200;
const MAX_WALLETCONNECT_DESCRIPTION_CHARS = 500;
const MAX_WALLETCONNECT_URL_CHARS = 2_048;
const MAX_WALLETCONNECT_ICONS = 5;

export function boundedWalletConnectText(
  value: unknown,
  fallback: string,
  maxChars: number,
): string {
  return typeof value === "string" && value.trim()
    ? value.slice(0, maxChars)
    : fallback;
}

export function sanitizeWalletConnectMetadataUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_WALLETCONNECT_URL_CHARS) {
    return "";
  }
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
      ? value
      : "";
  } catch {
    return "";
  }
}

export type SigningAccount = Extract<
  Account,
  { type: "bankr" | "privateKey" | "seedPhrase" | "ledger" }
>;

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
  return !!account && (
    account.type === "bankr" ||
    account.type === "privateKey" ||
    account.type === "seedPhrase" ||
    account.type === "ledger"
  );
}

export function chainIdFromCaip2(value: string | undefined): number | null {
  const match = typeof value === "string" ? value.match(/^eip155:([1-9][0-9]*)$/) : null;
  return match ? parseProviderChainId(match[1]) : null;
}

export function parseWalletChainId(value: unknown): number | null {
  return typeof value === "string" ? parseProviderChainId(value) : null;
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
  const name = boundedWalletConnectText(
    metadata.name,
    "WalletConnect Dapp",
    MAX_WALLETCONNECT_NAME_CHARS,
  );
  const url = sanitizeWalletConnectMetadataUrl(metadata.url);
  const icons = Array.isArray(metadata.icons)
    ? metadata.icons
        .slice(0, MAX_WALLETCONNECT_ICONS)
        .map(sanitizeUntrustedImageUrl)
        .filter((icon: string | null): icon is string => icon !== null)
    : [];
  const description = boundedWalletConnectText(
    metadata.description,
    "",
    MAX_WALLETCONNECT_DESCRIPTION_CHARS,
  );
  return {
    name,
    url,
    description: description || undefined,
    icons,
    icon: icons[0] || null,
  };
}

export function getSessionAccounts(session: any, chainId?: number): string[] {
  const rawAccounts = session?.namespaces?.eip155?.accounts;
  const accounts: unknown[] = Array.isArray(rawAccounts) ? rawAccounts : [];
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

  const matching = (await getAccounts()).filter(
    (entry) => entry.address.toLowerCase() === address.toLowerCase(),
  );
  if (matching.some((entry) => entry.type === "safe")) {
    throw new Error("Safe smart-account message signing is not supported");
  }
  const signers = matching.filter(isSigningAccount);
  if (signers.length !== 1) {
    throw new Error("No signing account found for this session");
  }
  return signers[0];
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

export function sessionSupportsMethod(session: any, method: string): boolean {
  const methods = session?.namespaces?.eip155?.methods;
  return (
    Array.isArray(methods) &&
    methods.some((entry: unknown) => entry === method)
  );
}

export function summarizeWalletConnectSession(
  session: any,
): WalletConnectSessionSummary {
  const metadata = getSessionMetadata(session);
  const accounts = getSessionAccounts(session);
  const rawNamespaceAccounts = session?.namespaces?.eip155?.accounts;
  const namespaceAccounts: unknown[] = Array.isArray(rawNamespaceAccounts)
    ? rawNamespaceAccounts
    : [];
  const chains = Array.from(
    new Set(
      namespaceAccounts
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => chainIdFromCaip2(entry))
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
