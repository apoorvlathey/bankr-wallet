import type { SafeCall } from "@/chrome/safe/types";
import type { PreparedSwapTxEntry } from "./SwapConfirmation";

interface CreateSafeSwapProposalOptions {
  safeAccountId: string;
  chainId: number;
  transactions: PreparedSwapTxEntry[];
}

interface CreateSafeProposalResponse {
  success?: boolean;
  result?: { id?: string };
  error?: string;
}

export function buildSafeSwapProposalCalls(
  transactions: PreparedSwapTxEntry[],
  chainId: number,
): SafeCall[] {
  if (transactions.length < 1) throw new Error("Swap has no transactions");

  return transactions.map(({ tx }) => {
    if (tx.chainId !== chainId) {
      throw new Error("Safe swap calls must use one network");
    }
    return {
      to: tx.to as `0x${string}`,
      value: BigInt(tx.value || "0x0").toString() as `${bigint}`,
      data: (tx.data || "0x") as `0x${string}`,
      operation: 0,
    };
  });
}

export async function createSafeSwapProposal({
  safeAccountId,
  chainId,
  transactions,
}: CreateSafeSwapProposalOptions): Promise<string> {
  const calls = buildSafeSwapProposalCalls(transactions, chainId);
  const response = await new Promise<CreateSafeProposalResponse>(
    (resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "createSafeProposal",
          safeAccountId,
          chainId,
          calls,
          route: { kind: "wallet", origin: "WalletChan" },
        },
        (result: CreateSafeProposalResponse) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) reject(new Error(runtimeError.message));
          else resolve(result);
        },
      );
    },
  );

  const proposalId = response.result?.id;
  if (!response.success || !proposalId) {
    throw new Error(response.error || "Could not create Safe swap request");
  }
  return proposalId;
}
