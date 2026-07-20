/** Prepare/sign once and cross the raw-RPC effect boundary safely. */

import { keccak256, type TransactionReceipt } from "viem";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import type {
  BeforeLocalTransactionBroadcast,
  PrepareAndSignClient,
  RawBroadcastClient,
  SignedTransaction,
} from "./types";

const SYNC_SEND_TIMEOUT_MS = 5_000;

function validTransactionHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Retrying identical signed bytes is transaction-idempotent. Re-preparing
 * after an ambiguous response is forbidden because it can create a new tx.
 */
export async function broadcastSerializedTransaction(
  client: RawBroadcastClient,
  serializedTransaction: `0x${string}`,
  options: { chainId: number; supportsSyncSend: boolean },
): Promise<SignedTransaction> {
  const localHash = keccak256(serializedTransaction);

  if (options.supportsSyncSend) {
    try {
      const rawReceipt = await client.request(
        {
          method: "eth_sendRawTransactionSync" as any,
          params: [serializedTransaction, SYNC_SEND_TIMEOUT_MS] as any,
        } as any,
        { retryCount: 0 },
      );
      const receipt = rawReceipt as TransactionReceipt & {
        transactionHash?: unknown;
        status: any;
      };
      if (!validTransactionHash(receipt?.transactionHash)) {
        throw new Error("Sync-send response did not include a transaction hash");
      }
      if (receipt.transactionHash.toLowerCase() !== localHash.toLowerCase()) {
        throw new Error("Sync-send response transaction hash mismatch");
      }
      return { txHash: localHash, receipt };
    } catch (error) {
      console.warn(
        `[WalletChan] sync send failed on chain ${options.chainId}; retrying the same signed bytes asynchronously:`,
        error,
      );
    }
  }

  try {
    const rpcHash = await client.request(
      {
        method: "eth_sendRawTransaction" as any,
        params: [serializedTransaction] as any,
      } as any,
      { retryCount: 0 },
    );
    if (!validTransactionHash(rpcHash)) {
      throw new Error("Raw-transaction response did not include a valid hash");
    }
    if (rpcHash.toLowerCase() !== localHash.toLowerCase()) {
      throw new Error("Raw-transaction response hash mismatch");
    }
    return { txHash: localHash };
  } catch (error) {
    // The node may have accepted bytes before the transport failed. Preserve
    // the deterministic hash and let receipt polling resolve the outcome.
    console.warn(
      `[WalletChan] transaction broadcast outcome is uncertain on chain ${options.chainId}; tracking local hash ${localHash}:`,
      error,
    );
    return { txHash: localHash, broadcastUncertain: true };
  }
}

export async function prepareSignAndBroadcastTransaction(
  client: PrepareAndSignClient,
  txParams: Parameters<PrepareAndSignClient["prepareTransactionRequest"]>[0],
  options: {
    chainId: number;
    supportsSyncSend: boolean;
    beforeBroadcast?: BeforeLocalTransactionBroadcast;
  },
): Promise<SignedTransaction> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const prepared = await client.prepareTransactionRequest(txParams as any);
    const serializedTransaction = await client.signTransaction(prepared as any);
    await options.beforeBroadcast?.({
      serializedTransaction,
      transactionHash: keccak256(serializedTransaction),
    });
    const result = await broadcastSerializedTransaction(
      client,
      serializedTransaction,
      options,
    );
    return { ...result, signedGasLimit: prepared.gas };
  });
}

export function isBroadcastOutcomeUncertain(
  result: Pick<SignedTransaction, "broadcastUncertain">,
): boolean {
  return result.broadcastUncertain === true;
}
