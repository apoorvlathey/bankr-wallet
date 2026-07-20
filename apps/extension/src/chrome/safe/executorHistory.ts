import { getStoredResolvedChainById } from "@/lib/chains";
import {
  addTxToHistoryIfAbsent,
  getTxById,
  updateTxInHistory,
  type CompletedTransaction,
} from "../txHistoryStorage";
import {
  applyReceiptToHistory,
  startReceiptPolling,
} from "../forceInclusion/receiptPoller";
import type { SignedTransaction } from "../localSigner";
import { buildSafeExecutionData } from "./executionData";
import type {
  SafeExecutionExecutor,
  SafeProposalRecord,
} from "./types";

const EXECUTOR_HISTORY_PREFIX = "safe-executor:";

export function getSafeExecutorHistoryId(proposalId: string): string {
  return `${EXECUTOR_HISTORY_PREFIX}${proposalId}`;
}

export function buildSafeExecutionExecutor(
  account: Pick<SafeExecutionExecutor, "accountId" | "accountType" | "address">,
  gas: {
    gas: `${bigint}`;
    maxFeePerGas: `${bigint}`;
    maxPriorityFeePerGas: `${bigint}`;
  } | undefined,
  preparedAt: number,
): SafeExecutionExecutor {
  return {
    ...account,
    preparedAt,
    gasOverrides: gas
      ? {
          gasLimit: gas.gas,
          maxFeePerGas: gas.maxFeePerGas,
          maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
        }
      : undefined,
  };
}

export function buildSafeExecutorHistoryEntry(
  proposal: SafeProposalRecord,
  chainName: string,
  broadcastUncertain = true,
): CompletedTransaction | null {
  const executor = proposal.executor;
  if (!executor || !proposal.transactionHash) return null;

  return {
    id: getSafeExecutorHistoryId(proposal.id),
    status: "pending",
    tx: {
      from: executor.address,
      to: proposal.safeAddress,
      data: buildSafeExecutionData(proposal),
      value: "0",
      chainId: proposal.chainId,
      gas: executor.gasOverrides?.gasLimit,
      maxFeePerGas: executor.gasOverrides?.maxFeePerGas,
      maxPriorityFeePerGas:
        executor.gasOverrides?.maxPriorityFeePerGas,
    },
    origin: proposal.route.origin || "WalletChan",
    favicon: null,
    chainName,
    chainId: proposal.chainId,
    createdAt: executor.preparedAt,
    txHash: proposal.transactionHash,
    broadcastUncertain,
    accountType: executor.accountType,
    accountId: executor.accountId,
    functionName: "Contract interaction",
  };
}

async function resolveChainName(proposal: SafeProposalRecord): Promise<string> {
  try {
    const chain = await getStoredResolvedChainById(proposal.chainId);
    return chain?.name || `Chain ${proposal.chainId}`;
  } catch {
    return `Chain ${proposal.chainId}`;
  }
}

export async function ensureSafeExecutorHistory(
  proposal: SafeProposalRecord,
  broadcastUncertain = true,
): Promise<CompletedTransaction | null> {
  const entry = buildSafeExecutorHistoryEntry(
    proposal,
    await resolveChainName(proposal),
    broadcastUncertain,
  );
  if (!entry) return null;
  return addTxToHistoryIfAbsent(entry);
}

export async function trackSafeExecutorBroadcast(
  proposal: SafeProposalRecord,
  result: SignedTransaction,
  rpcUrl: string,
): Promise<void> {
  const entry = await ensureSafeExecutorHistory(
    proposal,
    result.broadcastUncertain === true,
  );
  if (!entry) return;

  if (result.receipt) {
    await applyReceiptToHistory(
      entry.id,
      result.txHash,
      proposal.chainId,
      result.receipt,
      { rpcUrl, signedGasLimit: result.signedGasLimit },
    );
    return;
  }

  await updateTxInHistory(entry.id, {
    status: "pending",
    txHash: result.txHash,
    broadcastUncertain: result.broadcastUncertain === true,
  });
  startReceiptPolling(entry.id, result.txHash, proposal.chainId);
}

/** Repairs and resumes the normal EOA history path after an MV3 restart. */
export async function resumeSafeExecutorHistory(
  proposal: SafeProposalRecord,
): Promise<void> {
  const entry = await ensureSafeExecutorHistory(
    proposal,
    proposal.state === "ambiguous",
  );
  if (!entry || !proposal.transactionHash) return;

  const current = await getTxById(entry.id);
  if (!current || current.status === "success" || current.status === "failed") {
    return;
  }
  if (
    current.status !== "pending" ||
    current.txHash !== proposal.transactionHash ||
    current.broadcastUncertain !== (proposal.state === "ambiguous")
  ) {
    await updateTxInHistory(entry.id, {
      status: "pending",
      txHash: proposal.transactionHash,
      broadcastUncertain: proposal.state === "ambiguous",
    });
  }
  startReceiptPolling(entry.id, proposal.transactionHash, proposal.chainId);
}
