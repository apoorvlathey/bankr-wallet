import type { GasEstimate } from "@/chrome/gasEstimation";

export function parseWei(value?: string): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function getBatchedNativeOutlayWei(
  outerValue: string | undefined,
  innerValues: readonly (string | undefined)[],
): bigint {
  const outer = parseWei(outerValue);
  const inner = innerValues.reduce<bigint>(
    (sum, value) => sum + parseWei(value),
    0n,
  );
  return inner > outer ? inner : outer;
}

export function applyBatchedNativeOutlayBalance(
  results: readonly (GasEstimate | null)[],
  nativeOutlayWei: bigint,
  enabled: boolean,
): (GasEstimate | null)[] {
  if (!enabled || results.length !== 1) return [...results];
  return results.map((result) => {
    if (!result) return result;
    return {
      ...result,
      insufficientBalance:
        parseWei(result.accountBalance) <
        parseWei(result.estimatedCostWei) + nativeOutlayWei,
    };
  });
}

export function applyForceInclusionBalanceTotals(
  results: readonly (GasEstimate | null)[],
  l2NativeOutlayWei: bigint,
): (GasEstimate | null)[] {
  const valid = results.filter((result): result is GasEstimate => !!result);
  if (valid.length === 0) return [...results];

  const totalL1GasCost = valid.reduce(
    (sum, result) => sum + parseWei(result.estimatedCostWei),
    0n,
  );
  const knownL2Balance = valid.find(
    (result) => result.transactionValueBalance !== undefined,
  )?.transactionValueBalance;
  const insufficientGasBalance =
    parseWei(valid[0].accountBalance) < totalL1GasCost;
  const insufficientTransactionValueBalance =
    knownL2Balance !== undefined
      ? parseWei(knownL2Balance) < l2NativeOutlayWei
      : valid.some(
          (result) => result.insufficientTransactionValueBalance === true,
        );

  return results.map((result) =>
    result
      ? {
          ...result,
          insufficientGasBalance,
          insufficientTransactionValueBalance,
          insufficientBalance:
            insufficientGasBalance || insufficientTransactionValueBalance,
        }
      : result,
  );
}

export function getInsufficientBalanceMessage(
  estimates: readonly GasEstimate[],
): string | null {
  const valueInsufficient = estimates.some(
    (estimate) => estimate.insufficientTransactionValueBalance === true,
  );
  const gasInsufficient = estimates.some(
    (estimate) =>
      estimate.insufficientGasBalance ??
      (estimate.insufficientBalance &&
        !estimate.insufficientTransactionValueBalance),
  );
  const gasChain = estimates.find((estimate) => estimate.gasBalanceChainName)
    ?.gasBalanceChainName;
  const valueChain = estimates.find(
    (estimate) => estimate.transactionValueChainName,
  )?.transactionValueChainName;

  if (gasInsufficient && valueInsufficient) {
    return `Insufficient ${gasChain || "source-chain"} balance for gas and ${valueChain || "destination-chain"} balance for transaction value`;
  }
  if (valueInsufficient) {
    return `Insufficient ${valueChain || "destination-chain"} balance for transaction value`;
  }
  if (!gasInsufficient) return null;
  return gasChain
    ? `Insufficient ${gasChain} balance for gas`
    : "Insufficient balance for gas";
}
