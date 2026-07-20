export interface ReplacementFeeMinimums {
  minimumMaxFeePerGas: string;
  minimumMaxPriorityFeePerGas: string;
}

export interface ReplacementGasSelection {
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

const PRIORITY_BUMP_NUMERATOR = 1_125n;
const MAX_FEE_BUMP_NUMERATOR = 1_300n;
const BUMP_DENOMINATOR = 1_000n;

function ceilMultiply(value: bigint, numerator: bigint): bigint {
  if (value === 0n) return 0n;
  return (value * numerator + BUMP_DENOMINATOR - 1n) / BUMP_DENOMINATOR;
}

export function replacementFeeMinimums(input: {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const legacyPrice = input.gasPrice;
  const maxFee = input.maxFeePerGas ?? legacyPrice;
  const priorityFee = input.maxPriorityFeePerGas ?? legacyPrice;
  if (maxFee === undefined || priorityFee === undefined) {
    throw new Error("Pending transaction has no replaceable gas fee");
  }
  return {
    maxFeePerGas: ceilMultiply(maxFee, MAX_FEE_BUMP_NUMERATOR),
    maxPriorityFeePerGas: ceilMultiply(
      priorityFee,
      PRIORITY_BUMP_NUMERATOR,
    ),
  };
}

export function replacementGasSelectionError(
  minimums: ReplacementFeeMinimums | undefined,
  selection: ReplacementGasSelection | null | undefined,
): string | null {
  if (!minimums) return null;
  if (!selection) return "Replacement gas fees are required";
  try {
    if (BigInt(selection.gasLimit) <= 0n) return "Gas limit must be positive";
    if (
      BigInt(selection.maxPriorityFeePerGas) <
      BigInt(minimums.minimumMaxPriorityFeePerGas)
    ) {
      return "Priority fee is below the replacement minimum";
    }
    if (
      BigInt(selection.maxFeePerGas) < BigInt(minimums.minimumMaxFeePerGas)
    ) {
      return "Max fee is below the replacement minimum";
    }
    return null;
  } catch {
    return "Replacement gas fees are invalid";
  }
}
