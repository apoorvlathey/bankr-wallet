import { INFINITE_THRESHOLD } from "@/lib/erc20Approve";
import type { ApprovalIntent } from "./approvalIntents";
import type { ApprovalChange } from "./types";

export interface AllowanceState {
  amount: bigint;
  expiration: number | null;
}

function baseApprovalChange(
  intent: ApprovalIntent,
  values: {
    previousAmount: bigint | null;
    remainingAmount: bigint | null;
    expiration: number | null;
    verification: "verified" | "unverified";
    changeType: "increase" | "expiryExtension" | "unknown";
  },
): ApprovalChange {
  const riskAmount = values.remainingAmount ?? intent.requestedAmount;
  return {
    system: intent.system,
    tokenAddress: intent.tokenAddress,
    owner: intent.owner,
    spender: intent.spender,
    requestedAmount: intent.requestedAmount.toString(),
    previousAmount: values.previousAmount?.toString() ?? null,
    remainingAmount: values.remainingAmount?.toString() ?? null,
    expiration: values.expiration,
    verification: values.verification,
    changeType: values.changeType,
    isUnlimited: riskAmount >= INFINITE_THRESHOLD,
    symbol: `${intent.tokenAddress.slice(0, 6)}...${intent.tokenAddress.slice(-4)}`,
    name: "",
    decimals: 18,
  };
}

export function projectApprovalChange(
  intent: ApprovalIntent,
  previous: AllowanceState | null,
  remaining: AllowanceState | null,
  blockTimestamp: bigint | null,
): { change: ApprovalChange | null; incomplete: boolean } {
  if (remaining?.amount === 0n) {
    return { change: null, incomplete: previous === null };
  }
  if (!previous || !remaining) {
    if (!intent.grantLike || intent.requestedAmount === 0n) {
      return { change: null, incomplete: true };
    }
    return {
      change: baseApprovalChange(intent, {
        previousAmount: previous?.amount ?? null,
        remainingAmount: remaining?.amount ?? null,
        expiration: remaining?.expiration ?? intent.expiration,
        verification: "unverified",
        changeType: "unknown",
      }),
      incomplete: true,
    };
  }

  if (intent.system === "erc20") {
    if (remaining.amount <= previous.amount) {
      return { change: null, incomplete: false };
    }
    return {
      change: baseApprovalChange(intent, {
        previousAmount: previous.amount,
        remainingAmount: remaining.amount,
        expiration: null,
        verification: "verified",
        changeType: "increase",
      }),
      incomplete: false,
    };
  }

  if (blockTimestamp === null) {
    return {
      change: intent.grantLike
        ? baseApprovalChange(intent, {
            previousAmount: previous.amount,
            remainingAmount: remaining.amount,
            expiration: remaining.expiration,
            verification: "unverified",
            changeType: "unknown",
          })
        : null,
      incomplete: true,
    };
  }
  const timestamp = Number(blockTimestamp);
  const previousEffective =
    previous.expiration !== null && previous.expiration >= timestamp
      ? previous.amount
      : 0n;
  const remainingEffective =
    remaining.expiration !== null && remaining.expiration >= timestamp
      ? remaining.amount
      : 0n;
  if (remainingEffective > previousEffective) {
    return {
      change: baseApprovalChange(intent, {
        previousAmount: previous.amount,
        remainingAmount: remaining.amount,
        expiration: remaining.expiration,
        verification: "verified",
        changeType: "increase",
      }),
      incomplete: false,
    };
  }
  if (
    remainingEffective > 0n &&
    remaining.amount === previous.amount &&
    (remaining.expiration ?? 0) > (previous.expiration ?? 0)
  ) {
    return {
      change: baseApprovalChange(intent, {
        previousAmount: previous.amount,
        remainingAmount: remaining.amount,
        expiration: remaining.expiration,
        verification: "verified",
        changeType: "expiryExtension",
      }),
      incomplete: false,
    };
  }
  return { change: null, incomplete: false };
}

export function buildFallbackApprovalChanges(
  intents: ApprovalIntent[],
): ApprovalChange[] {
  return intents
    .filter((intent) => intent.grantLike && intent.requestedAmount > 0n)
    .map((intent) =>
      baseApprovalChange(intent, {
        previousAmount: null,
        remainingAmount: null,
        expiration: intent.expiration,
        verification: "unverified",
        changeType: "unknown",
      }),
    );
}
