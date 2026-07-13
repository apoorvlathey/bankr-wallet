import type { GasData } from "../txHistoryStorage";
import { fetchRpcResult } from "../network/rpcClient";
import { OP_STACK_CHAIN_IDS } from "../../constants/networks";

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

  const gasData: GasData = {
    gasUsed: BigInt(receipt.gasUsed).toString(),
    gasLimit: gasLimit ?? BigInt(receipt.gasUsed).toString(),
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
  return gasData;
}
