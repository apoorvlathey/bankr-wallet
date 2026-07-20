import {
  createPublicClient,
  TransactionReceiptNotFoundError,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { RPC_URLS, VIEM_CHAINS } from "@/constants/chainRegistry";
import { getStoredRpcUrl } from "@/lib/chains";
import { secureHttpTransport } from "../network/rpcClient";
import { SAFE_EXECUTION_RPC_WARNING } from "./executionStatus";

export class SafeExecutionReceiptRpcError extends Error {
  constructor(cause?: unknown) {
    super(SAFE_EXECUTION_RPC_WARNING);
    this.name = "SafeExecutionReceiptRpcError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export interface SafeExecutionReceiptLookup {
  client: PublicClient;
  receipt: TransactionReceipt | null;
  rpcUrl: string;
}

export async function lookupReceiptAcrossRpcUrls<TClient, TReceipt>(input: {
  rpcUrls: readonly string[];
  createClient: (rpcUrl: string) => TClient;
  getReceipt: (client: TClient) => Promise<TReceipt>;
  isNotFound: (error: unknown) => boolean;
}): Promise<{ client: TClient; receipt: TReceipt | null; rpcUrl: string }> {
  let available: { client: TClient; rpcUrl: string } | null = null;
  let lastFailure: unknown;
  for (const rpcUrl of [...new Set(input.rpcUrls)]) {
    try {
      const client = input.createClient(rpcUrl);
      try {
        return { client, receipt: await input.getReceipt(client), rpcUrl };
      } catch (error) {
        if (!input.isNotFound(error)) throw error;
        available ??= { client, rpcUrl };
      }
    } catch (error) {
      lastFailure = error;
    }
  }
  if (available) return { ...available, receipt: null };
  throw new SafeExecutionReceiptRpcError(lastFailure);
}

async function reconciliationRpcUrls(chainId: number): Promise<string[]> {
  const configured = await getStoredRpcUrl(chainId);
  const builtIn = RPC_URLS[chainId];
  const canonical = VIEM_CHAINS[chainId]?.rpcUrls.default.http ?? [];
  return [...new Set(
    [configured, builtIn, ...canonical]
      .filter((rpcUrl): rpcUrl is string => typeof rpcUrl === "string" && !!rpcUrl),
  )];
}

/**
 * Receipt reconciliation is a read-only recovery path. It tries the selected
 * network RPC first, then WalletChan's pinned built-in/canonical endpoints so
 * one provider outage cannot strand a transaction in a pending display state.
 */
export async function lookupSafeExecutionReceipt(
  chainId: number,
  hash: Hash,
): Promise<SafeExecutionReceiptLookup> {
  return lookupReceiptAcrossRpcUrls({
    rpcUrls: await reconciliationRpcUrls(chainId),
    createClient: (rpcUrl) => createPublicClient({
      transport: secureHttpTransport(rpcUrl, { timeout: 12_000, retryCount: 1 }),
    }) as PublicClient,
    getReceipt: (client) => client.getTransactionReceipt({ hash }),
    isNotFound: (error) => error instanceof TransactionReceiptNotFoundError,
  });
}
