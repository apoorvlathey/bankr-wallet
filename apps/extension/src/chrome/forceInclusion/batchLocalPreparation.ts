import type { Account, Chain, PublicClient } from "viem";
import type { ForceInclusionChainInfo } from "@/constants/chainRegistry";
import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import type { TransactionParams } from "../bankr/client";
import type { PendingBatchTxRequest } from "../erc5792Types";
import { estimateFees } from "../feeEstimation";
import type { GasEstimate } from "../gasEstimation";
import { addTxToHistory } from "../txHistoryStorage";
import { buildL1DepositTxParams } from "./deposit";
import type { PreparedForceInclusionDeposit } from "./batchTypes";
import type { ForceInclusionAccount } from "./types";

export interface PreparedLocalForceInclusionBatch {
  deposits: PreparedForceInclusionDeposit[];
  l1GasLimits: bigint[];
  l1Fees: Awaited<ReturnType<typeof estimateFees>> | null;
  l1PublicClient: PublicClient;
  l1Chain: Chain;
  l1RpcUrl: string;
  viemAccount: Account;
}

export async function prepareLocalForceInclusionBatch(args: {
  bundleId: string;
  pending: PendingBatchTxRequest;
  account: ForceInclusionAccount;
  info: ForceInclusionChainInfo;
  privateKey: `0x${string}`;
  functionNames?: string[];
  precomputedL2GasEstimates?: GasEstimate[];
}): Promise<PreparedLocalForceInclusionBatch> {
  const {
    bundleId,
    pending,
    account,
    info,
    privateKey,
    functionNames,
    precomputedL2GasEstimates,
  } = args;
  const { privateKeyToAccount } = await import("viem/accounts");
  const { createL1PublicClient, getL1Chain, getL1RpcUrl } = await import(
    "./l1Client"
  );
  const l1RpcUrl = await getL1RpcUrl(info.l1ChainId);
  const l1Chain = getL1Chain(info.l1ChainId);
  const viemAccount = privateKeyToAccount(privateKey);
  const l1PublicClient = createL1PublicClient(l1RpcUrl);
  const { calls } = pending.params;

  let l2GasEstimates: GasEstimate[];
  if (precomputedL2GasEstimates?.length === calls.length) {
    l2GasEstimates = precomputedL2GasEstimates;
  } else {
    const { estimateBatchGasSequential } = await import("../batchGasEstimation");
    l2GasEstimates = await estimateBatchGasSequential(
      calls.map((call) => ({
        to: call.to || "0x0000000000000000000000000000000000000000",
        data: call.data || "0x",
        value: call.value || "0x0",
      })),
      account.address,
      pending.chainId,
    );
  }

  const depositParams = await Promise.all(
    calls.map((call, index) => {
      const syntheticTx: TransactionParams = {
        from: account.address,
        to: call.to || "0x0000000000000000000000000000000000000000",
        data: call.data || "0x",
        value: call.value || "0x0",
        chainId: pending.chainId,
      };
      const estimate = l2GasEstimates[index];
      return buildL1DepositTxParams(
        syntheticTx,
        info,
        estimate?.estimationFailed ? undefined : BigInt(estimate.gasLimit),
      );
    }),
  );
  const [startNonce, l1Fees] = await Promise.all([
    l1PublicClient.getTransactionCount({
      address: viemAccount.address,
      blockTag: "pending",
    }),
    estimateFees(l1PublicClient, info.l1ChainId).catch(() => null),
  ]);
  logBatchStart(
    bundleId,
    l1RpcUrl,
    info.l1ChainId,
    calls.length,
    startNonce,
    l1Fees,
  );

  const deposits: PreparedForceInclusionDeposit[] = [];
  for (let index = 0; index < calls.length; index++) {
    const call = calls[index];
    const txId = `${bundleId}:${index}`;
    const functionName =
      functionNames?.[index] || `Batch call ${index + 1}/${calls.length}`;
    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: {
        from: account.address,
        to: call.to || "0x0000000000000000000000000000000000000000",
        data: call.data || "0x",
        value: call.value || "0x0",
        chainId: pending.chainId,
      },
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.chainId,
      createdAt: pending.timestamp,
      accountType: account.type as "privateKey" | "seedPhrase",
      functionName,
      forceInclusionMeta: {
        l1TxHash: "",
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.chainId,
        l2Confirmed: false,
      },
    });
    attachClearSignedMetaToHistory(
      txId,
      { to: call.to, data: call.data, value: call.value },
      pending.chainId,
    );
    deposits.push({
      txId,
      nonce: startNonce + index,
      l1TxParams: depositParams[index],
      functionName,
    });
  }

  const l1GasLimits = await Promise.all(
    deposits.map(async (deposit) => {
      const value =
        deposit.l1TxParams.value && deposit.l1TxParams.value !== "0x0"
          ? BigInt(deposit.l1TxParams.value)
          : 0n;
      try {
        const estimated = await l1PublicClient.estimateGas({
          account: viemAccount.address,
          to: deposit.l1TxParams.to as `0x${string}`,
          data: deposit.l1TxParams.data as `0x${string}`,
          value,
        });
        return (estimated * 120n) / 100n;
      } catch (error) {
        console.warn(
          `[ForceInclusion] L1 gas estimation failed for ${deposit.txId}, using 1M fallback:`,
          error,
        );
        return 1_000_000n;
      }
    }),
  );
  return {
    deposits,
    l1GasLimits,
    l1Fees,
    l1PublicClient,
    l1Chain,
    l1RpcUrl,
    viemAccount,
  };
}

function logBatchStart(
  bundleId: string,
  rpcUrl: string,
  chainId: number,
  callCount: number,
  nonce: number,
  fees: Awaited<ReturnType<typeof estimateFees>> | null,
): void {
  try {
    console.log(
      `[ForceInclusion] batch start: bundleId=${bundleId} l1Host=${new URL(rpcUrl).host} l1ChainId=${chainId} calls=${callCount} startNonce=${nonce} maxFeePerGas=${fees?.maxFeePerGas?.toString() ?? "auto"} maxPriorityFeePerGas=${fees?.maxPriorityFeePerGas?.toString() ?? "auto"}`,
    );
  } catch {
    // URL parsing is diagnostic only.
  }
}
