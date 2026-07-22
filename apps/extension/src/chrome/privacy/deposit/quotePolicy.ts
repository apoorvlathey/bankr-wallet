import { parseUnits } from "viem";

import {
  MAX_PRIVACY_SHIELD_AMOUNT_WEI,
  privacyShieldGrossAmountForAvailableWei,
  privacyShieldGrossAmountWei,
  privacyShieldNetAmountWei,
} from "../../../lib/privacyShieldAmounts";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";

const ETH_DECIMALS = 18;
const MAX_AMOUNT_INPUT_LENGTH = 80;
const CANONICAL_ETH_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const SERIALIZED_WEI = /^(?:0|[1-9]\d{0,79})$/;

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
  if (amountWei > MAX_PRIVACY_SHIELD_AMOUNT_WEI) {
    throw new PrivacyShieldQuoteError("invalid-amount");
  }
  return amountWei;
}

export function grossPrivacyShieldAmount(
  shieldedAmountWei: bigint,
): bigint {
  try {
    return privacyShieldGrossAmountWei(
      shieldedAmountWei,
      PRIVACY_POOLS_DEPLOYMENT.assetConfig.vettingFeeBPS,
    );
  } catch {
    throw new PrivacyShieldQuoteError("invalid-amount");
  }
}

export function parsePrivacyShieldGrossAmount(
  amountWei: unknown,
  expectedShieldedAmountWei: bigint,
): bigint {
  if (typeof amountWei !== "string" || !SERIALIZED_WEI.test(amountWei)) {
    throw new PrivacyShieldQuoteError("invalid-amount");
  }
  try {
    const parsed = BigInt(amountWei);
    if (
      privacyShieldNetAmountWei(
        parsed,
        PRIVACY_POOLS_DEPLOYMENT.assetConfig.vettingFeeBPS,
      ) !== expectedShieldedAmountWei
    ) {
      throw new Error("Gross amount does not match shielded amount");
    }
    return parsed;
  } catch {
    throw new PrivacyShieldQuoteError("invalid-amount");
  }
}

export function createPrivacyShieldQuoteValues(input: {
  shieldedAmountWei: bigint;
  amountWei?: bigint;
  balanceWei: bigint;
  gasLimit: bigint;
  maxFeePerGas: bigint;
}): PrivacyShieldQuoteValues {
  const deployment = PRIVACY_POOLS_DEPLOYMENT;
  const { shieldedAmountWei, balanceWei, gasLimit, maxFeePerGas } = input;
  if (
    shieldedAmountWei < deployment.assetConfig.minimumDepositAmount ||
    shieldedAmountWei > MAX_PRIVACY_SHIELD_AMOUNT_WEI ||
    balanceWei < 0n ||
    gasLimit <= 0n ||
    maxFeePerGas <= 0n
  ) {
    throw new PrivacyShieldQuoteError("quote-unavailable");
  }

  const gasReserveWei = gasLimit * maxFeePerGas;
  const balanceAfterGas =
    balanceWei > gasReserveWei ? balanceWei - gasReserveWei : 0n;
  const maxShieldableWei = privacyShieldNetAmountWei(
    balanceAfterGas,
    deployment.assetConfig.vettingFeeBPS,
  );
  let amountWei: bigint;
  try {
    amountWei = input.amountWei ?? privacyShieldGrossAmountForAvailableWei(
      shieldedAmountWei,
      deployment.assetConfig.vettingFeeBPS,
      balanceAfterGas,
    );
    if (
      amountWei > MAX_PRIVACY_SHIELD_AMOUNT_WEI ||
      privacyShieldNetAmountWei(
        amountWei,
        deployment.assetConfig.vettingFeeBPS,
      ) !== shieldedAmountWei
    ) {
      throw new Error("Gross amount does not match shielded amount");
    }
  } catch {
    throw new PrivacyShieldQuoteError("quote-unavailable");
  }
  const protocolFeeWei = amountWei - shieldedAmountWei;
  const totalRequiredWei = amountWei + gasReserveWei;

  return Object.freeze({
    chainId: deployment.chainId,
    amountWei: amountWei.toString(),
    balanceWei: balanceWei.toString(),
    minimumAmountWei: deployment.assetConfig.minimumDepositAmount.toString(),
    protocolFeeWei: protocolFeeWei.toString(),
    shieldedAmountWei: shieldedAmountWei.toString(),
    gasReserveWei: gasReserveWei.toString(),
    totalRequiredWei: totalRequiredWei.toString(),
    maxShieldableWei: maxShieldableWei.toString(),
    vettingFeeBPS: deployment.assetConfig.vettingFeeBPS.toString(),
    canAfford: totalRequiredWei <= balanceWei,
  });
}
