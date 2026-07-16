import {
  FOURBYTE_DIRECTORY_API_URL,
  FOURBYTE_SOURCIFY_LOOKUP_URL,
} from "@/constants/externalUrls";
import { fetchJsonBounded } from "../network/boundedHttp";
import { fetchRpcResult } from "../network/rpcClient";
import { buildHistoryGasData } from "../history/receiptGasData";
import { fetchSettledReceiptAtRpcUrl } from "../history/receiptSettlement";
import { updateTxInHistory } from "../txHistoryStorage";
import { getRpcUrl } from "./rpcConfig";

/** Best-effort human-readable selector lookup for transaction history. */
export async function lookupFunctionName(
  calldata: string,
): Promise<string | null> {
  if (!calldata || calldata.length < 10) return null;
  const selector = calldata.slice(0, 10);

  try {
    const url = new URL(FOURBYTE_SOURCIFY_LOOKUP_URL);
    url.searchParams.append("function", selector);
    const { response, data } = await fetchJsonBounded(
      url,
      { method: "GET" },
      { timeoutMs: 5_000, maxBytes: 256 * 1024 },
    );
    if (!response.ok || !data || typeof data !== "object") {
      throw new Error("Sourcify lookup failed");
    }
    const payload = data as any;
    if (payload?.ok && payload.result?.function?.[selector]?.[0]?.name) {
      return payload.result.function[selector][0].name.split("(")[0];
    }
  } catch {
    // Best-effort metadata only.
  }

  try {
    const url = new URL(FOURBYTE_DIRECTORY_API_URL);
    url.searchParams.append("hex_signature", selector);
    const { response, data } = await fetchJsonBounded(
      url,
      { method: "GET" },
      { timeoutMs: 5_000, maxBytes: 256 * 1024 },
    );
    if (!response.ok || !data || typeof data !== "object") {
      throw new Error("4byte lookup failed");
    }
    const payload = data as any;
    if (payload?.count > 0 && payload.results?.[0]?.text_signature) {
      return payload.results[0].text_signature.split("(")[0];
    }
  } catch {
    // Best-effort metadata only.
  }

  return null;
}

/** Best-effort gas receipt enrichment for a completed history entry. */
export async function fetchAndStoreGasData(
  txId: string,
  txHash: string,
  chainId: number,
): Promise<void> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return;

  try {
    const rpcCall = (method: string, params: any[]) =>
      fetchRpcResult(rpcUrl, method, params, {
        allowPrivateWithoutOrigin: true,
      });
    const [txData, receipt] = await Promise.all([
      rpcCall("eth_getTransactionByHash", [txHash]),
      rpcCall("eth_getTransactionReceipt", [txHash]),
    ]);
    if (!receipt) return;
    const settledReceipt = await fetchSettledReceiptAtRpcUrl(
      rpcUrl,
      txHash,
      chainId,
      receipt,
    );
    if (!settledReceipt) return;
    const txRecord = txData as { gas?: string } | null;
    const gasData = buildHistoryGasData(
      settledReceipt,
      chainId,
      txRecord?.gas,
    );
    await updateTxInHistory(txId, { gasData });
  } catch {
    // Gas enrichment never changes the transaction's terminal state.
  }
}
