import { fetchRpcResult } from "../network/rpcClient";
import { toHistoryBigInt } from "./assetTransferParser";

const BALANCE_RETRY_ATTEMPTS = 3;
const BALANCE_RETRY_DELAY_MS = 2_000;

async function historyRpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  return fetchRpcResult(rpcUrl, method, params, {
    allowPrivateWithoutOrigin: true,
  });
}

export async function fetchReceiptAtRpcUrl(
  rpcUrl: string,
  txHash: string,
): Promise<any | null> {
  try {
    const result = await historyRpcCall(
      rpcUrl,
      "eth_getTransactionReceipt",
      [txHash],
    );
    return result || null;
  } catch {
    return null;
  }
}

export async function fetchTxAtRpcUrl(
  rpcUrl: string,
  txHash: string,
): Promise<any | null> {
  try {
    const result = await historyRpcCall(rpcUrl, "eth_getTransactionByHash", [
      txHash,
    ]);
    return result || null;
  } catch {
    return null;
  }
}

export async function fetchBalanceAtBlock(
  rpcUrl: string,
  address: string,
  blockHex: string,
): Promise<bigint | null> {
  for (let attempt = 0; attempt < BALANCE_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await historyRpcCall(rpcUrl, "eth_getBalance", [
        address,
        blockHex,
      ]);
      if (typeof result === "string") return BigInt(result);
    } catch {
      // A load-balanced RPC may briefly lag the block observed in a receipt.
    }
    if (attempt < BALANCE_RETRY_ATTEMPTS - 1) {
      await sleep(BALANCE_RETRY_DELAY_MS);
    }
  }
  return null;
}

/**
 * Returns sibling sender costs that also appear in the block-level balance
 * delta, allowing extraction to attribute only the selected transaction.
 * This intentionally assumes sibling transactions do not internally return
 * native value to the sender; when that rare case occurs, omitting a native
 * row is safer than presenting sibling gas/value as this transaction's flow.
 */
export async function sumSiblingSenderTxCosts(
  rpcUrl: string,
  blockNumberHex: string,
  sender: string,
  ourTxHash: string,
): Promise<bigint> {
  let block: any;
  try {
    block = await historyRpcCall(rpcUrl, "eth_getBlockByNumber", [
      blockNumberHex,
      true,
    ]);
  } catch {
    return 0n;
  }

  const txs: any[] = Array.isArray(block?.transactions) ? block.transactions : [];
  const senderLower = sender.toLowerCase();
  const ourHashLower = ourTxHash.toLowerCase();
  const siblings = txs.filter(
    (tx) =>
      typeof tx?.from === "string" &&
      tx.from.toLowerCase() === senderLower &&
      typeof tx?.hash === "string" &&
      tx.hash.toLowerCase() !== ourHashLower,
  );
  if (siblings.length === 0) return 0n;

  let total = 0n;
  await Promise.all(
    siblings.map(async (sibling) => {
      let valueWei = 0n;
      try {
        valueWei = BigInt(sibling.value ?? "0x0");
      } catch {
        // Malformed values contribute no native value.
      }
      const receipt = await fetchReceiptAtRpcUrl(rpcUrl, sibling.hash);
      if (!receipt) {
        total += valueWei;
        return;
      }
      try {
        const gasUsed = toHistoryBigInt(receipt.gasUsed);
        const effectiveGasPrice = toHistoryBigInt(receipt.effectiveGasPrice);
        const l1Fee = receipt.l1Fee ? toHistoryBigInt(receipt.l1Fee) : 0n;
        total += valueWei + gasUsed * effectiveGasPrice + l1Fee;
      } catch {
        total += valueWei;
      }
    }),
  );
  return total;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
