import { parseUnits } from "viem";

import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";

const ETH_DECIMALS = 18;
const BASIS_POINTS_SCALE = 10_000n;
const MAX_AMOUNT_INPUT_LENGTH = 80;
const MAX_UINT256 = (1n << 256n) - 1n;
const CANONICAL_ETH_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

export type PrivacyShieldQuoteErrorCode =
  | "invalid-request"
  | "account-unavailable"
  | "view-only-account"
  | "invalid-amount"
  | "amount-below-minimum"
  | "quote-unavailable";

export class PrivacyShieldQuoteError extends Error {
  constructor(readonly code: PrivacyShieldQuoteErrorCode) {
    super(code);
    this.name = "PrivacyShieldQuoteError";
  }
}

export interface PrivacyShieldQuoteValues {
  readonly chainId: number;
  readonly amountWei: string;
  readonly balanceWei: string;
  readonly minimumAmountWei: string;
  readonly protocolFeeWei: string;
  readonly shieldedAmountWei: string;
  readonly gasReserveWei: string;
  readonly totalRequiredWei: string;
  readonly maxShieldableWei: string;
  readonly vettingFeeBPS: string;
  readonly canAfford: boolean;
}

export function parsePrivacyShieldAmount(amount: unknown): bigint {
  if (
    typeof amount !== "string" ||
    amount.length === 0 ||
    amount.length > MAX_AMOUNT_INPUT_LENGTH ||
    !CANONICAL_ETH_AMOUNT.test(amount)
  ) {
    throw new PrivacyShieldQuoteError("invalid-amount");
  }

  let amountWei: bigint;
  try {
    amountWei = parseUnits(amount, ETH_DECIMALS);
  } catch {
    throw new PrivacyShieldQuoteError("invalid-amount");
  }

  const { minimumDepositAmount } =
    PRIVACY_POOLS_DEPLOYMENT.assetConfig;
  if (amountWei < minimumDepositAmount) {
    throw new PrivacyShieldQuoteError("amount-below-minimum");
  }
  if (amountWei > MAX_UINT256) {
    throw new PrivacyShieldQuoteError("invalid-amount");
  }
  return amountWei;
}

export function createPrivacyShieldQuoteValues(input: {
  amountWei: bigint;
  balanceWei: bigint;
  gasLimit: bigint;
  maxFeePerGas: bigint;
}): PrivacyShieldQuoteValues {
  const deployment = PRIVACY_POOLS_DEPLOYMENT;
  const { amountWei, balanceWei, gasLimit, maxFeePerGas } = input;
  if (
    amountWei < deployment.assetConfig.minimumDepositAmount ||
    amountWei > MAX_UINT256 ||
    balanceWei < 0n ||
    gasLimit <= 0n ||
    maxFeePerGas <= 0n
  ) {
    throw new PrivacyShieldQuoteError("quote-unavailable");
  }

  const protocolFeeWei =
    (amountWei * deployment.assetConfig.vettingFeeBPS) /
    BASIS_POINTS_SCALE;
  const shieldedAmountWei = amountWei - protocolFeeWei;
  const gasReserveWei = gasLimit * maxFeePerGas;
  const totalRequiredWei = amountWei + gasReserveWei;
  const balanceAfterGas =
    balanceWei > gasReserveWei ? balanceWei - gasReserveWei : 0n;

  return Object.freeze({
    chainId: deployment.chainId,
    amountWei: amountWei.toString(),
    balanceWei: balanceWei.toString(),
    minimumAmountWei: deployment.assetConfig.minimumDepositAmount.toString(),
    protocolFeeWei: protocolFeeWei.toString(),
    shieldedAmountWei: shieldedAmountWei.toString(),
    gasReserveWei: gasReserveWei.toString(),
    totalRequiredWei: totalRequiredWei.toString(),
    maxShieldableWei: balanceAfterGas.toString(),
    vettingFeeBPS: deployment.assetConfig.vettingFeeBPS.toString(),
    canAfford: totalRequiredWei <= balanceWei,
  });
}
