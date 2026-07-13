export interface BroadcastObservation {
  broadcastUncertain?: boolean;
}

/** An ambiguous lower nonce makes every higher-nonce deposit unsafe to send. */
export function shouldHaltForceInclusionTail(
  result: BroadcastObservation,
): boolean {
  return result.broadcastUncertain === true;
}

/** Missing RPC observation is not proof that an ambiguously sent tx was dropped. */
export function shouldRetainUnobservedBroadcast(
  tx: BroadcastObservation | null | undefined,
): boolean {
  return tx?.broadcastUncertain === true;
}
