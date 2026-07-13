import {
  FOURBYTE_DIRECTORY_API_URL,
  FOURBYTE_SOURCIFY_LOOKUP_URL,
} from "@/constants/externalUrls";
import { OP_STACK_CHAIN_IDS } from "../../constants/networks";
import { fetchJsonBounded } from "../boundedHttpResponse";
import { fetchRpcResult } from "../rpcHttpClient";
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

    const gasData: import("../txHistoryStorage").GasData = {
      gasUsed: BigInt(receipt.gasUsed).toString(),
      gasLimit: txData?.gas
        ? BigInt(txData.gas).toString()
        : BigInt(receipt.gasUsed).toString(),
      effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
    };
    if (OP_STACK_CHAIN_IDS.has(chainId)) {
      if (receipt.l1Fee) gasData.l1Fee = BigInt(receipt.l1Fee).toString();
      if (receipt.l1GasUsed) {
        gasData.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
      }
      if (receipt.l1GasPrice) {
        gasData.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
      }
    }
    await updateTxInHistory(txId, { gasData });
  } catch {
    // Gas enrichment never changes the transaction's terminal state.
  }
}
