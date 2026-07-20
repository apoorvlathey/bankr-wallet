export const PRIVACY_SHIELD_BASIS_POINTS = 10_000n;
export const MAX_PRIVACY_SHIELD_AMOUNT_WEI = (1n << 256n) - 1n;

function assertAmountAndFee(amountWei: bigint, feeBPS: bigint): void {
  if (
    amountWei < 0n ||
    amountWei > MAX_PRIVACY_SHIELD_AMOUNT_WEI ||
    feeBPS < 0n ||
    feeBPS >= PRIVACY_SHIELD_BASIS_POINTS
  ) {
    throw new RangeError("Invalid Privacy Shield amount or fee");
  }
}

/** Return the protocol fee deducted from a gross Entrypoint deposit. */
export function privacyShieldProtocolFeeWei(
  grossAmountWei: bigint,
  feeBPS: bigint,
): bigint {
  assertAmountAndFee(grossAmountWei, feeBPS);
  return (grossAmountWei * feeBPS) / PRIVACY_SHIELD_BASIS_POINTS;
}

/** Return the pool commitment value created from a gross deposit. */
export function privacyShieldNetAmountWei(
  grossAmountWei: bigint,
  feeBPS: bigint,
): bigint {
  return grossAmountWei - privacyShieldProtocolFeeWei(grossAmountWei, feeBPS);
}

/**
 * Return the canonical upper gross deposit whose fee-deducted value exactly
 * equals the amount the user chose to shield. At a one-wei fee-rounding
 * boundary, a balance-aware quote may deliberately select the lower gross
 * value instead so Max can consume the exact post-gas balance.
 */
export function privacyShieldGrossAmountWei(
  shieldedAmountWei: bigint,
  feeBPS: bigint,
): bigint {
  assertAmountAndFee(shieldedAmountWei, feeBPS);
  if (shieldedAmountWei === 0n) return 0n;

  const netBasisPoints = PRIVACY_SHIELD_BASIS_POINTS - feeBPS;
  const grossAmountWei =
    (shieldedAmountWei * PRIVACY_SHIELD_BASIS_POINTS) / netBasisPoints;
  if (
    grossAmountWei > MAX_PRIVACY_SHIELD_AMOUNT_WEI ||
    privacyShieldNetAmountWei(grossAmountWei, feeBPS) !== shieldedAmountWei
  ) {
    throw new RangeError("Privacy Shield amount cannot be grossed up");
  }
  return grossAmountWei;
}

/** Prefer an exact available gross balance when it produces the chosen net. */
export function privacyShieldGrossAmountForAvailableWei(
  shieldedAmountWei: bigint,
  feeBPS: bigint,
  availableGrossAmountWei: bigint,
): bigint {
  assertAmountAndFee(availableGrossAmountWei, feeBPS);
  if (
    privacyShieldNetAmountWei(availableGrossAmountWei, feeBPS) ===
    shieldedAmountWei
  ) {
    return availableGrossAmountWei;
  }
  return privacyShieldGrossAmountWei(shieldedAmountWei, feeBPS);
}
