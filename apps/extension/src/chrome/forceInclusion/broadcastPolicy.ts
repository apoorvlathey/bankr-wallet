export interface BroadcastObservation {
  broadcastUncertain?: boolean;
  forceInclusionMeta?: { l1TxHash: string };
}

export const DEFAULT_RECEIPT_POLL_DURATION_MS = 10 * 60 * 1000;
export const FORCE_INCLUSION_L2_POLL_DURATION_MS = 15 * 60 * 1000;

/** An ambiguous lower nonce makes every higher-nonce deposit unsafe to send. */
export function shouldHaltForceInclusionTail(result: BroadcastObservation): boolean {
  return result.broadcastUncertain === true;
}

/** Missing RPC observation is not proof that an ambiguously sent tx was dropped. */
export function shouldRetainUnobservedBroadcast(
  tx: BroadcastObservation | null | undefined,
  txHash?: string,
): boolean {
  return tx?.broadcastUncertain === true || isForceInclusionL2Hash(tx, txHash);
}

/** Derived deposits do not enter the L2 mempool before sequencer inclusion. */
export function isForceInclusionL2Hash(
  tx: BroadcastObservation | null | undefined,
  txHash?: string,
): boolean {
  const l1Hash = tx?.forceInclusionMeta?.l1TxHash;
  return !!l1Hash && !!txHash && l1Hash.toLowerCase() !== txHash.toLowerCase();
}

export function getReceiptPollingWindowMs(
  tx: BroadcastObservation | null | undefined,
  txHash?: string,
): number {
  return isForceInclusionL2Hash(tx, txHash)
    ? FORCE_INCLUSION_L2_POLL_DURATION_MS
    : DEFAULT_RECEIPT_POLL_DURATION_MS;
}
