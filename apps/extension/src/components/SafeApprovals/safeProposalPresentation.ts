import { formatUnits } from "viem";
import type { SafeProposalRecord } from "@/chrome/safe/types";
import { formatActivityAmount, formatActivityFunctionName } from "@/components/Activity/activityModel";
import { detectAbiEncodingError } from "@/lib/calldataValidation";
import { parseApproveCalldata } from "@/lib/erc20Approve";
import { parseTransferCalldata } from "@/lib/erc20Transfer";

export type SafeProposalStatusTone = "success" | "info" | "warning" | "error" | "muted";

export interface SafeProposalPresentation {
  intent: string;
  context: string;
  status: string;
  statusTone: SafeProposalStatusTone;
  isProgressing: boolean;
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function addressName(
  value: string,
  labels: ReadonlyMap<string, string> | undefined,
) {
  return labels?.get(value.toLowerCase()) ?? shortAddress(value);
}

function requestAction(
  item: SafeProposalRecord,
  nativeSymbol: string,
  nativeDecimals: number,
  addressLabels: ReadonlyMap<string, string> | undefined,
) {
  if (item.purpose === "rejection") {
    return {
      intent: "Reject transaction",
      counterparty: `Safe nonce ${item.transaction.nonce}`,
    };
  }
  if (item.calls.length !== 1) {
    return {
      intent: `${item.calls.length}-action request`,
      counterparty: null,
    };
  }

  const call = item.calls[0];
  if (call.data === "0x") {
    if (BigInt(call.value) > 0n) {
      const amount = formatActivityAmount(
        formatUnits(BigInt(call.value), nativeDecimals),
        true,
      );
      return {
        intent: `Send ${amount} ${nativeSymbol}`,
        counterparty: `To ${addressName(call.to, addressLabels)}`,
      };
    }
    return {
      intent: "Contract interaction",
      counterparty: `With ${addressName(call.to, addressLabels)}`,
    };
  }

  const transfer = parseTransferCalldata(call.data);
  if (transfer) {
    return {
      intent: "Send tokens",
      counterparty: `To ${addressName(transfer.recipient, addressLabels)}`,
    };
  }

  const approval = parseApproveCalldata(call.data);
  if (approval) {
    return {
      intent: approval.isRevoke
        ? "Revoke token approval"
        : approval.isInfinite
          ? "Approve unlimited token spending"
          : "Approve token spending",
      counterparty: `For ${addressName(approval.spender, addressLabels)}`,
    };
  }

  const knownCall = detectAbiEncodingError(call.data).functionName;
  return {
    intent: knownCall
      ? formatActivityFunctionName(knownCall)
      : call.operation === 1
        ? "Advanced contract action"
        : "Contract interaction",
    counterparty: `With ${addressName(call.to, addressLabels)}`,
  };
}

function requestStatus(
  item: SafeProposalRecord,
  threshold: number | undefined,
  blockedByNonce: number | undefined,
  rejectionPending: boolean,
): Pick<SafeProposalPresentation, "status" | "statusTone" | "isProgressing"> {
  const approvalCount = item.confirmations.length;
  const approvalProgress = threshold
    ? `${approvalCount} of ${threshold} approved`
    : `${approvalCount} approved`;

  if (rejectionPending) {
    return {
      status: "Rejection in progress",
      statusTone: "warning",
      isProgressing: true,
    };
  }

  switch (item.state) {
    case "draft":
      return { status: "Needs approval", statusTone: "warning", isProgressing: false };
    case "authorizing":
      return { status: "Adding approval", statusTone: "info", isProgressing: true };
    case "approvedLocally":
      return { status: "Approval saved", statusTone: "info", isProgressing: false };
    case "publishing":
      return { status: "Sharing approval", statusTone: "info", isProgressing: true };
    case "awaitingApprovals":
      return { status: approvalProgress, statusTone: "warning", isProgressing: false };
    case "readyToExecute":
      return {
        status: "Ready to execute",
        statusTone: "success",
        isProgressing: false,
      };
    case "executing":
      return { status: "Executing", statusTone: "info", isProgressing: true };
    case "executed":
      return { status: "Executed", statusTone: "success", isProgressing: false };
    case "ambiguous":
      return { status: "Confirming execution", statusTone: "info", isProgressing: true };
    case "cancelled":
      return { status: "Cancelled", statusTone: "muted", isProgressing: false };
    case "stale":
      return { status: "Safe changed", statusTone: "warning", isProgressing: false };
    case "replaced":
      return { status: "Replaced", statusTone: "muted", isProgressing: false };
    case "blocked":
      return {
        status: blockedByNonce !== undefined
          ? `Blocked · Execute nonce #${blockedByNonce} first`
          : "Blocked",
        statusTone: "error",
        isProgressing: false,
      };
    case "failed":
      return { status: "Failed", statusTone: "error", isProgressing: false };
  }
}

export function getSafeProposalPresentation(
  item: SafeProposalRecord,
  options: {
    nativeSymbol?: string;
    nativeDecimals?: number;
    threshold?: number;
    conflict?: boolean;
    rejectionPending?: boolean;
    blockedByNonce?: number;
    addressLabels?: ReadonlyMap<string, string>;
  },
): SafeProposalPresentation {
  const action = requestAction(
    item,
    options.nativeSymbol ?? "ETH",
    options.nativeDecimals ?? 18,
    options.addressLabels,
  );
  const status = requestStatus(
    item,
    options.threshold,
    options.blockedByNonce,
    options.rejectionPending ?? false,
  );
  const context = action.counterparty ?? "Multiple contract calls";

  if (options.conflict && item.purpose !== "rejection") {
    return {
      ...action,
      context: `${context} · Nonce conflict`,
      status: "Conflicting request",
      statusTone: "warning",
      isProgressing: false,
    };
  }

  return { ...action, context, ...status };
}
