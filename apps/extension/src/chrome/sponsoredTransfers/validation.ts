import { isAddress, parseUnits } from "viem";

export const BASE_USDC_DECIMALS = 6;

export type SponsoredTransferIntentValidation =
  | {
      valid: true;
      from: `0x${string}`;
      to: `0x${string}`;
      value: bigint;
    }
  | { valid: false; error: string };

/**
 * Pin a sponsored Base-USDC authorization to the live account and the token's
 * canonical 6-decimal unit. Renderer-provided address/decimal fields are only
 * assertions; they never choose the signer or amount scaling.
 */
export function validateSponsoredTransferIntent(
  accountAddress: string,
  input: {
    fromAddress: string;
    to: string;
    amount: string;
    decimals: number;
  },
): SponsoredTransferIntentValidation {
  if (
    !isAddress(accountAddress) ||
    !isAddress(input.fromAddress) ||
    accountAddress.toLowerCase() !== input.fromAddress.toLowerCase()
  ) {
    return {
      valid: false,
      error: "Transfer account no longer matches the active account",
    };
  }
  if (!isAddress(input.to)) {
    return { valid: false, error: "Invalid recipient address" };
  }
  if (input.decimals !== BASE_USDC_DECIMALS) {
    return { valid: false, error: "Invalid USDC decimals" };
  }

  let value: bigint;
  try {
    value = parseUnits(input.amount, BASE_USDC_DECIMALS);
  } catch {
    return { valid: false, error: "Invalid transfer amount" };
  }
  if (value <= 0n) {
    return {
      valid: false,
      error: "Transfer amount must be greater than zero",
    };
  }

  return {
    valid: true,
    from: accountAddress as `0x${string}`,
    to: input.to as `0x${string}`,
    value,
  };
}
