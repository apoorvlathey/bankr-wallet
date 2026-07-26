import { getAccountById } from "../accountStorage";
import { MAX_BATCH_CALLS } from "../provider/limits";
import type { Account } from "../types";
import {
  getCrossDappBatch,
  type CrossDappBatch,
} from "../crossDappBatch/storage";
import type { Address, Hex } from "./pimlicoTypes";
import type { FeePaymentCall } from "./userOperation";

export function getCrossDappFeePaymentRequestId(
  batch: Pick<CrossDappBatch, "createdAt">,
): string {
  return `cross-dapp-batch-${batch.createdAt}`;
}

export function feePaymentCrossDappCalls(
  batch: Pick<CrossDappBatch, "entries">,
): FeePaymentCall[] {
  if (
    batch.entries.length === 0 ||
    batch.entries.length > MAX_BATCH_CALLS
  ) {
    throw new Error("Cross-dapp batch has an invalid call count");
  }
  return batch.entries.map((entry, index) => {
    const to = entry.tx.to;
    const data = entry.tx.data ?? "0x";
    if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
      throw new Error(`Call ${index + 1} is a contract deployment`);
    }
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) {
      throw new Error(`Call ${index + 1} has invalid calldata`);
    }
    let value: bigint;
    try {
      value = BigInt(entry.tx.value ?? "0x0");
    } catch {
      throw new Error(`Call ${index + 1} has an invalid value`);
    }
    if (value < 0n) throw new Error(`Call ${index + 1} has an invalid value`);
    return {
      to: to as Address,
      value,
      data: data as Hex,
    };
  });
}

export async function resolveCrossDappFeePaymentRequest(
  requestId: string,
): Promise<{
  batch: CrossDappBatch;
  account: Extract<Account, { type: "bankr" | "privateKey" | "seedPhrase" }>;
  calls: FeePaymentCall[];
}> {
  const batch = await getCrossDappBatch();
  if (
    !batch ||
    getCrossDappFeePaymentRequestId(batch) !== requestId ||
    !batch.accountId
  ) {
    throw new Error("Cross-dapp batch request not found");
  }
  const account = await getAccountById(batch.accountId);
  if (
    !account ||
    (account.type !== "bankr" &&
      account.type !== "privateKey" &&
      account.type !== "seedPhrase") ||
    account.type !== batch.accountType ||
    account.address.toLowerCase() !== batch.fromAddress.toLowerCase()
  ) {
    throw new Error("Cross-dapp batch account is no longer available");
  }
  return {
    batch,
    account,
    calls: feePaymentCrossDappCalls(batch),
  };
}
