import { FLASHBLOCKS_CHAIN_IDS } from "../../constants/networks";
import { fetchRpcResult } from "../network/rpcClient";

const SETTLEMENT_ATTEMPTS = 10;
const SETTLEMENT_DELAY_MS = 500;

type RpcCall = (method: string, params: unknown[]) => Promise<unknown>;

interface SettlementDependencies {
  rpcCall?: RpcCall;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
}

function receiptBlockNumber(receipt: any): bigint | null {
  try {
    return BigInt(receipt?.blockNumber);
  } catch {
    return null;
  }
}

function sameHash(left: unknown, right: unknown): boolean {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

/**
 * Flashblocks RPCs may expose a preconfirmed receipt before its L2 block seals.
 * Wait for one following block, then require the receipt hash to match the
 * canonical block before using fee fields for durable history calculations.
 */
export async function fetchSettledReceiptAtRpcUrl(
  rpcUrl: string,
  txHash: string,
  chainId: number,
  initialReceipt?: any,
  dependencies: SettlementDependencies = {},
): Promise<any | null> {
  const rpcCall: RpcCall =
    dependencies.rpcCall ??
    ((method, params) =>
      fetchRpcResult(rpcUrl, method, params, {
        allowPrivateWithoutOrigin: true,
      }));
  const wait = dependencies.sleep ?? sleep;
  let receipt = initialReceipt;

  if (!FLASHBLOCKS_CHAIN_IDS.has(chainId)) {
    return receipt ?? (await rpcCall("eth_getTransactionReceipt", [txHash]));
  }

  const attempts = dependencies.attempts ?? SETTLEMENT_ATTEMPTS;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      receipt ??= await rpcCall("eth_getTransactionReceipt", [txHash]);
      const blockNumber = receiptBlockNumber(receipt);
      if (blockNumber === null) throw new Error("Receipt is not mined");
      const head = await rpcCall("eth_blockNumber", []);
      if (BigInt(head as string) > blockNumber) {
        const blockHex = `0x${blockNumber.toString(16)}`;
        const [block, refreshed] = await Promise.all([
          rpcCall("eth_getBlockByNumber", [blockHex, false]),
          rpcCall("eth_getTransactionReceipt", [txHash]),
        ]);
        if (
          sameHash((block as any)?.hash, (refreshed as any)?.blockHash) &&
          receiptBlockNumber(refreshed) === blockNumber
        ) {
          return refreshed;
        }
      }
    } catch {
      // Retry until the provider exposes a canonical sealed block.
    }
    receipt = undefined;
    if (attempt < attempts - 1) await wait(SETTLEMENT_DELAY_MS);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
