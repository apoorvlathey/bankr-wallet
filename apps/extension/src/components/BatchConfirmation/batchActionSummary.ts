import type { ERC5792Call } from "@/chrome/erc5792Types";
import { parseApproveCalldata } from "@/lib/erc20Approve";
import { formatTransactionAction } from "@/components/TransactionConfirmation/transactionPresentation";

const ACTION_PREFIXES: Array<[RegExp, string]> = [
  [/^(swap|exact input|exact output)/i, "Swap"],
  [/^approve/i, "Approve"],
  [/^revoke/i, "Revoke"],
  [/^(send|transfer)/i, "Send"],
  [/^withdraw/i, "Withdraw"],
  [/^deposit/i, "Deposit"],
  [/^bridge/i, "Bridge"],
  [/^claim/i, "Claim"],
  [/^unstake/i, "Unstake"],
  [/^stake/i, "Stake"],
];

function hasPositiveValue(value?: string): boolean {
  if (!value) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

export function compactBatchActionName(name: string): string {
  const formatted = formatTransactionAction(name);
  const known = ACTION_PREFIXES.find(([pattern]) => pattern.test(formatted));
  if (known) return known[1];
  return formatted.split(" ").slice(0, 3).join(" ");
}

export function getBatchActionSummary({
  calls,
  clearSigningActionNames,
  decodedFunctionNames,
}: {
  calls: ERC5792Call[];
  clearSigningActionNames: Record<number, string>;
  decodedFunctionNames: Record<number, string>;
}): string | null {
  const labels = calls.map((call, index) => {
    const approval = call.data ? parseApproveCalldata(call.data) : null;
    if (approval) return approval.isRevoke ? "Revoke" : "Approve";

    const clearSigningAction = clearSigningActionNames[index]?.trim();
    if (clearSigningAction) return compactBatchActionName(clearSigningAction);

    if ((!call.data || call.data === "0x") && hasPositiveValue(call.value)) {
      return "Send";
    }

    const decodedFunction = decodedFunctionNames[index];
    return decodedFunction ? compactBatchActionName(decodedFunction) : null;
  });

  if (labels.length === 0 || labels.some((label) => !label)) return null;
  return labels.join(" + ");
}
