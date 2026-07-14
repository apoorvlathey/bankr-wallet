import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import { encodeBatchCalls } from "@/chrome/batchTxHandlers";
import { detectAbiEncodingError } from "@/lib/calldataValidation";
import { normalizeTransactionValue } from "@/chrome/transactionValidation";

type BatchCalls = PendingBatchTxRequest["params"]["calls"];

export function getOriginHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

export function findMalformedValue(calls: BatchCalls) {
  for (let index = 0; index < calls.length; index++) {
    const result = normalizeTransactionValue(calls[index].value);
    if (!result.ok) return { index, reason: result.error };
  }
  return null;
}

export function sumNativeValue(calls: BatchCalls): bigint {
  let total = 0n;
  for (const call of calls) {
    if (!call.value || call.value === "0x" || call.value === "0x0") continue;
    try {
      total += BigInt(call.value);
    } catch {
      // The malformed-value guard owns user-facing validation.
    }
  }
  return total;
}

export function findMalformedCalldata(calls: BatchCalls) {
  for (let index = 0; index < calls.length; index++) {
    const result = detectAbiEncodingError(calls[index].data);
    if (result.malformed) return { index, ...result };
  }
  return null;
}

export function tryEncodeBatch(calls: BatchCalls, fromAddress: string) {
  try {
    return {
      encodedBatch: encodeBatchCalls(calls, fromAddress),
      encodingError: null,
    };
  } catch (error) {
    return {
      encodedBatch: {
        to: fromAddress,
        data: "0x" as `0x${string}`,
        value: "0x0",
      },
      encodingError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getBatchEncodingBlockedReason(encodingError: string): string {
  if (encodingError.includes("self-recursion")) {
    return "WalletChan blocked this batch because the call targeting your own account could bypass authorization. Remove or edit that call to continue.";
  }

  if (encodingError.includes("contract deployments")) {
    return "Contract deployments can't be included in a batch. Remove the deployment call to continue.";
  }

  return "WalletChan couldn't safely prepare this batch. Remove or edit the flagged call, then try again.";
}

export function emptyEncodedBatch(fromAddress: string) {
  return {
    encodedBatch: {
      to: fromAddress,
      data: "0x" as `0x${string}`,
      value: "0x0",
    },
    encodingError: null,
  };
}

export function makeSyntheticTxRequest(
  batchRequest: PendingBatchTxRequest,
  fromAddress: string,
  encodedBatch: { to: string; data: string; value: string },
): PendingTxRequest {
  return {
    id: batchRequest.id,
    tx: {
      from: fromAddress,
      to: encodedBatch.to,
      data: encodedBatch.data,
      value: encodedBatch.value,
      chainId: batchRequest.chainId,
    },
    origin: batchRequest.origin,
    favicon: batchRequest.favicon,
    chainName: batchRequest.chainName,
    timestamp: batchRequest.timestamp,
  };
}

export function makeTenderlyUrl(
  fromAddress: string,
  chainId: number,
  encodedBatch: { to: string; data: string; value: string },
): string {
  const params = new URLSearchParams({
    from: fromAddress,
    value: encodedBatch.value || "0",
    rawFunctionInput: encodedBatch.data || "0x",
    network: String(chainId),
    contractAddress: encodedBatch.to,
  });
  return `https://dashboard.tenderly.co/simulator/new?${params}`;
}
