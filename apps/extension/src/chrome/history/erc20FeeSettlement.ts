import {
  getUserOperationPaymasterFromReceipt,
  getUserOperationTokenFeeFromReceipt,
} from "../feePayment/userOperationEvent";
import type {
  AssetChangeRecord,
  AssetTransferRecord,
  CompletedTransaction,
} from "./types";

export interface Erc20FeeTransferContext {
  token: string;
  paymaster: string;
  amountWei?: string;
}

function positiveAmount(transfer: AssetTransferRecord): bigint | null {
  try {
    const amount = BigInt(transfer.amountWei);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

function exactSponsoredTransferIndices(
  transfers: AssetTransferRecord[],
  token: string,
  amountWei: string | undefined,
): Set<number> | null {
  if (!amountWei) return null;
  let expected: bigint;
  try {
    expected = BigInt(amountWei);
  } catch {
    return null;
  }
  if (expected <= 0n) return null;
  for (let index = transfers.length - 1; index >= 0; index -= 1) {
    const transfer = transfers[index]!;
    if (
      transfer.token.toLowerCase() === token &&
      transfer.direction === "out" &&
      positiveAmount(transfer) === expected
    ) return new Set([index]);
  }
  for (let debitIndex = transfers.length - 1; debitIndex >= 0; debitIndex -= 1) {
    const debit = transfers[debitIndex]!;
    const debitAmount = positiveAmount(debit);
    if (debit.token.toLowerCase() !== token || debit.direction !== "out" || !debitAmount) continue;
    for (let refundIndex = transfers.length - 1; refundIndex >= 0; refundIndex -= 1) {
      const refund = transfers[refundIndex]!;
      const refundAmount = positiveAmount(refund);
      if (
        refund.token.toLowerCase() === token &&
        refund.direction === "in" &&
        refund.counterparty.toLowerCase() === debit.counterparty.toLowerCase() &&
        refundAmount && debitAmount - refundAmount === expected
      ) return new Set([debitIndex, refundIndex]);
    }
  }
  return null;
}

export function separateErc20FeeTransfers(
  transfers: AssetTransferRecord[],
  context: Erc20FeeTransferContext,
): { transfers: AssetTransferRecord[]; amountWei?: string } {
  const token = context.token.toLowerCase();
  const paymaster = context.paymaster.toLowerCase();
  const exact = exactSponsoredTransferIndices(transfers, token, context.amountWei);
  if (exact) {
    return {
      transfers: transfers.filter((_, index) => !exact.has(index)),
      amountWei: context.amountWei,
    };
  }
  let debits = 0n;
  let refunds = 0n;
  const matched = new Set<number>();
  for (let index = 0; index < transfers.length; index += 1) {
    const transfer = transfers[index]!;
    if (
      transfer.token.toLowerCase() !== token ||
      transfer.counterparty.toLowerCase() !== paymaster
    ) continue;
    let amount: bigint;
    try {
      amount = BigInt(transfer.amountWei);
    } catch {
      continue;
    }
    if (amount <= 0n) continue;
    matched.add(index);
    if (transfer.direction === "out") debits += amount;
    else refunds += amount;
  }
  const charged = debits - refunds;
  if (debits === 0n || charged <= 0n) return { transfers };
  return {
    transfers: transfers.filter((_, index) => !matched.has(index)),
    amountWei: charged.toString(),
  };
}

export function settleErc20FeeRecord(
  record: AssetChangeRecord,
  context?: Erc20FeeTransferContext,
): {
  record: AssetChangeRecord;
  payment?: NonNullable<CompletedTransaction["erc20FeePayment"]>;
} {
  if (!context) return { record };
  const separated = separateErc20FeeTransfers(record.erc20Transfers, context);
  return {
    record: separated.transfers === record.erc20Transfers
      ? record
      : { ...record, erc20Transfers: separated.transfers },
    payment: separated.amountWei
      ? { token: context.token.toLowerCase(), amountWei: separated.amountWei }
      : undefined,
  };
}

export function settleErc20FeeRecordFromReceipt(
  record: AssetChangeRecord | null,
  payment: CompletedTransaction["erc20FeePayment"],
  userOperationHash: string | undefined,
  sender: string,
  receipt: any,
): { record: AssetChangeRecord | null; payment?: NonNullable<typeof payment> } {
  if (!record || !payment || !userOperationHash) return { record };
  const sponsored = getUserOperationTokenFeeFromReceipt(
    receipt,
    userOperationHash,
    sender,
    payment.token,
  );
  const paymaster = getUserOperationPaymasterFromReceipt(
    receipt,
    userOperationHash,
    sender,
  );
  if (!paymaster) return { record };
  return settleErc20FeeRecord(record, {
    token: payment.token,
    paymaster,
    amountWei: sponsored?.amountWei,
  });
}
