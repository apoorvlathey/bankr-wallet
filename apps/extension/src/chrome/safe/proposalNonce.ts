import type { SafeProposalRecord } from "./types";

const TERMINAL_STATES = new Set<SafeProposalRecord["state"]>([
  "executed",
  "cancelled",
  "replaced",
  "failed",
]);

export function futureSafeNonceError(nonce: bigint, liveNonce: bigint): string {
  return `Future Safe nonce ${nonce}; executable nonce is ${liveNonce}`;
}

export function isFutureSafeNonceError(error?: string): boolean {
  return !!error?.startsWith("Future Safe nonce ");
}

export function reservesSafeNonce(proposal: SafeProposalRecord): boolean {
  return !proposal.hiddenAt && !TERMINAL_STATES.has(proposal.state);
}

function consumedSafeNonce(proposal: SafeProposalRecord): boolean {
  return proposal.state === "executed" ||
    proposal.state === "replaced" ||
    (proposal.state === "cancelled" && !!proposal.rejectedBySafeTxHash);
}

export function isUnsignedSafeNonceEditable(proposal: SafeProposalRecord): boolean {
  const editableState = proposal.state === "draft" ||
    (proposal.state === "blocked" && isFutureSafeNonceError(proposal.error));
  return editableState &&
    !proposal.purpose &&
    proposal.confirmations.length === 0 &&
    (proposal.unsupportedConfirmations?.length ?? 0) === 0 &&
    !proposal.effectClaim &&
    !proposal.transactionHash &&
    !proposal.userOperationHash &&
    !proposal.serializedExecution;
}

/** Returns the lowest unused nonce at or above the verified onchain nonce. */
export function getNextAvailableSafeNonce(input: {
  safeAccountId: string;
  chainId: number;
  onchainNonce: bigint;
  proposals: readonly SafeProposalRecord[];
}): bigint {
  if (input.onchainNonce < 0n || input.onchainNonce > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Unsupported Safe nonce");
  }
  const scoped = input.proposals.filter((proposal) =>
    proposal.safeAccountId === input.safeAccountId &&
    proposal.chainId === input.chainId,
  );
  const consumedFloor = scoped.reduce((floor, proposal) => {
    const next = BigInt(proposal.transaction.nonce) + 1n;
    return consumedSafeNonce(proposal) && next > floor ? next : floor;
  }, input.onchainNonce);
  const reserved = new Set(scoped
    .filter(reservesSafeNonce)
    .map((proposal) => proposal.transaction.nonce));
  let candidate = consumedFloor;
  while (reserved.has(Number(candidate))) {
    candidate += 1n;
    if (candidate > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Safe nonce queue is exhausted");
    }
  }
  return candidate;
}
