import { MAX_TRANSACTION_NONCE } from "@/lib/transactionNonce";
import { fetchRpcEnvelope } from "../network/rpcClient";
import { getRpcUrl } from "../transactions/rpcConfig";

export type NonceFetchResult = { nonce: number } | { error: string };

async function callGetTransactionCount(
  rpcUrl: string,
  address: string,
  blockTag: "pending" | "latest",
): Promise<NonceFetchResult> {
  try {
    const json = await fetchRpcEnvelope(
      rpcUrl,
      "eth_getTransactionCount",
      [address, blockTag],
      {
        timeoutMs: 10_000,
        allowPrivateWithoutOrigin: true,
      },
    );
    if (json.error) {
      const rpcError = json.error as Record<string, unknown>;
      const message =
        typeof rpcError.message === "string"
          ? rpcError.message.slice(0, 1_000)
          : `RPC error code ${String(rpcError.code ?? "unknown")}`;
      return { error: message };
    }
    if (typeof json.result !== "string") {
      return { error: "RPC returned no result" };
    }
    try {
      const nonce = Number(BigInt(json.result));
      if (
        !Number.isSafeInteger(nonce) ||
        nonce < 0 ||
        nonce > MAX_TRANSACTION_NONCE
      ) {
        return { error: `Invalid nonce response: ${json.result}` };
      }
      return { nonce };
    } catch {
      return { error: `Invalid nonce response: ${json.result}` };
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "HttpRequestTimeoutError") {
      return { error: "RPC request timed out" };
    }
    return {
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function fetchNonceFromRpc(
  address: string,
  chainId: number,
): Promise<NonceFetchResult> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return { error: "No RPC URL configured for this chain" };

  const pendingResult = await callGetTransactionCount(
    rpcUrl,
    address,
    "pending",
  );
  if ("nonce" in pendingResult) return pendingResult;

  const unsupportedTag =
    /pending|block tag|not supported|unknown block|invalid/i.test(
      pendingResult.error,
    );
  if (!unsupportedTag) return pendingResult;

  console.warn(
    `[nonceManager] "pending" block tag rejected on chain ${chainId} ("${pendingResult.error}") — retrying with "latest"`,
  );
  return callGetTransactionCount(rpcUrl, address, "latest");
}
