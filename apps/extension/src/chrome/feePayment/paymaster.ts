import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";

import type {
  Address,
  PackedUserOperationV07,
  PimlicoTokenQuote,
} from "./pimlicoTypes";
import type { FeePaymentCall } from "./userOperation";

const EXCHANGE_RATE_SCALE = 10n ** 18n;

function quantity(value: `0x${string}`, label: string): bigint {
  const parsed = BigInt(value);
  if (parsed < 0n) throw new Error(`${label} cannot be negative`);
  return parsed;
}

export function getUserOperationMaxGas(
  userOperation: PackedUserOperationV07,
): bigint {
  return (
    quantity(userOperation.preVerificationGas, "preVerificationGas") +
    quantity(userOperation.callGasLimit, "callGasLimit") +
    quantity(userOperation.verificationGasLimit, "verificationGasLimit") +
    quantity(
      userOperation.paymasterVerificationGasLimit ?? "0x0",
      "paymasterVerificationGasLimit",
    ) +
    quantity(
      userOperation.paymasterPostOpGasLimit ?? "0x0",
      "paymasterPostOpGasLimit",
    )
  );
}

/**
 * Pimlico singleton-paymaster maximum token charge formula. `postOpGas` is
 * added separately because it is quoted by Pimlico and is not part of the
 * UserOperation gas fields returned by the bundler.
 */
export function getMaxTokenCost(
  userOperation: PackedUserOperationV07,
  quote: PimlicoTokenQuote,
): bigint {
  const maxFeePerGas = quantity(userOperation.maxFeePerGas, "maxFeePerGas");
  const postOpGas = quantity(quote.postOpGas, "postOpGas");
  const exchangeRate = quantity(quote.exchangeRate, "exchangeRate");
  if (maxFeePerGas === 0n || exchangeRate === 0n) {
    throw new Error("Pimlico quote cannot produce a zero maximum token cost");
  }
  const maxCostInWei =
    (getUserOperationMaxGas(userOperation) + postOpGas) * maxFeePerGas;
  const maxCostInToken =
    (maxCostInWei * exchangeRate) / EXCHANGE_RATE_SCALE;
  if (maxCostInToken === 0n) {
    throw new Error("Pimlico maximum token cost rounded to zero");
  }
  return maxCostInToken;
}

export function createTokenApprovalCall(
  token: Address,
  paymaster: Address,
  amount: bigint,
): FeePaymentCall {
  if (amount <= 0n) throw new Error("Fee-token approval must be positive");
  return {
    to: token,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [paymaster, amount],
    }),
  };
}

/** Used only for estimation and replaced before signing/submission. */
export function createDummyTokenApprovalCall(
  token: Address,
  paymaster: Address,
): FeePaymentCall {
  return createTokenApprovalCall(token, paymaster, maxUint256);
}

export function addBoundedTokenApproval(
  calls: readonly FeePaymentCall[],
  params: {
    token: Address;
    quote: PimlicoTokenQuote;
    estimatedUserOperation: PackedUserOperationV07;
    currentAllowance: bigint;
  },
): {
  calls: FeePaymentCall[];
  maximumTokenCost: bigint;
  approvalAdded: boolean;
} {
  if (params.currentAllowance < 0n) {
    throw new Error("Fee-token allowance cannot be negative");
  }
  if (params.quote.token.toLowerCase() !== params.token.toLowerCase()) {
    throw new Error("Pimlico quote token does not match the selected fee token");
  }
  const maximumTokenCost = getMaxTokenCost(
    params.estimatedUserOperation,
    params.quote,
  );
  const approvalAdded = params.currentAllowance < maximumTokenCost;
  return {
    calls: approvalAdded
      ? [
          createTokenApprovalCall(
            params.token,
            params.quote.paymaster,
            maximumTokenCost,
          ),
          ...calls,
        ]
      : [...calls],
    maximumTokenCost,
    approvalAdded,
  };
}

// Compatibility exports for older tests and callers while the domain moves
// from its original USDC-only implementation to exact catalog tokens.
export const createUsdcApprovalCall = createTokenApprovalCall;
export const createDummyUsdcApprovalCall = createDummyTokenApprovalCall;
export function addBoundedUsdcApproval(
  calls: readonly FeePaymentCall[],
  params: {
    usdc: Address;
    quote: PimlicoTokenQuote;
    estimatedUserOperation: PackedUserOperationV07;
    currentAllowance: bigint;
  },
) {
  return addBoundedTokenApproval(calls, {
    ...params,
    token: params.usdc,
  });
}
