import type { GasData } from "../txHistoryStorage";
import { fetchRpcResult } from "../network/rpcClient";
import { buildHistoryGasData } from "../history/receiptGasData";

export async function fetchTxByHash(
  rpcUrl: string,
  txHash: string,
): Promise<any | null> {
  return (
    (await fetchRpcResult(rpcUrl, "eth_getTransactionByHash", [txHash], {
      allowPrivateWithoutOrigin: true,
    })) ?? null
  );
}

export async function fetchReceipt(
  rpcUrl: string,
  txHash: string,
): Promise<any | null> {
  return (
    (await fetchRpcResult(rpcUrl, "eth_getTransactionReceipt", [txHash], {
      allowPrivateWithoutOrigin: true,
    })) || null
  );
}

export async function fetchLatestAccountNonce(
  rpcUrl: string,
  address: string,
): Promise<bigint | null> {
  const result = await fetchRpcResult(
    rpcUrl,
    "eth_getTransactionCount",
    [address, "latest"],
    { allowPrivateWithoutOrigin: true },
  );
  if (typeof result !== "string" || !/^0x[0-9a-f]+$/iu.test(result)) {
    return null;
  }
  return BigInt(result);
}

export async function buildReceiptGasData(
  rpcUrl: string | undefined,
  txHash: string,
  receipt: any,
  chainId: number,
  signedGasLimit?: bigint | string,
): Promise<GasData> {
  let gasLimit: string | undefined;
  if (signedGasLimit !== undefined) {
    gasLimit = BigInt(signedGasLimit).toString();
  } else if (rpcUrl) {
    try {
      const transaction = (await fetchRpcResult(
        rpcUrl,
        "eth_getTransactionByHash",
        [txHash],
        { allowPrivateWithoutOrigin: true },
      )) as { gas?: string } | null;
      if (transaction?.gas) gasLimit = BigInt(transaction.gas).toString();
    } catch {
      // Gas-limit enrichment is non-critical.
    }
  }

  return buildHistoryGasData(receipt, chainId, gasLimit);
}
