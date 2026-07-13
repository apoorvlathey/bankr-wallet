export interface Eip1559FeePair {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/**
 * Preserve a dapp's legacy `gasPrice` when the wallet broadcasts an EIP-1559
 * transaction. Legacy gasPrice is the total price per gas, not the tip. The
 * equivalent priority cap is therefore only the amount left after base fee.
 */
export function convertLegacyGasPriceToEip1559(
  gasPrice: bigint,
  baseFee: bigint,
): Eip1559FeePair {
  return {
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice > baseFee ? gasPrice - baseFee : 0n,
  };
}
