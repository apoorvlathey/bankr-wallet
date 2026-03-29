/**
 * ERC20 approve(address,uint256) detection and parsing utilities.
 *
 * Function selector: 0x095ea7b3
 * Calldata layout: 4 bytes selector + 32 bytes spender + 32 bytes amount
 */

/** approve(address,uint256) function selector */
const APPROVE_SELECTOR = "0x095ea7b3";

/** Amounts >= 2^128 are considered "infinite" / max approvals */
const INFINITE_THRESHOLD = 2n ** 128n;

export interface ParsedApproval {
  /** The spender address (checksummed not guaranteed — lowercase hex) */
  spender: `0x${string}`;
  /** Raw approval amount as bigint */
  amount: bigint;
  /** Whether the amount is considered "infinite" (>= 2^128) */
  isInfinite: boolean;
}

/**
 * Returns true if the calldata starts with the approve(address,uint256) selector.
 */
export function isErc20Approve(data: string | undefined): boolean {
  if (!data) return false;
  return data.toLowerCase().startsWith(APPROVE_SELECTOR);
}

/**
 * Parse approve calldata into spender + amount.
 * Returns null if the data is not a valid approve call.
 */
export function parseApproveCalldata(
  data: string,
): ParsedApproval | null {
  if (!isErc20Approve(data)) return null;

  // Minimum length: 4 bytes selector + 32 bytes address + 32 bytes uint256 = 68 bytes = 138 hex chars (with 0x)
  if (data.length < 138) return null;

  try {
    // Bytes 4–36: spender address (last 20 bytes of the 32-byte word)
    const spenderWord = data.slice(10, 74); // skip "0x" + 8 hex selector chars
    const spender = `0x${spenderWord.slice(-40)}` as `0x${string}`;

    // Bytes 36–68: uint256 amount
    const amountHex = data.slice(74, 138);
    const amount = BigInt(`0x${amountHex}`);

    return {
      spender,
      amount,
      isInfinite: amount >= INFINITE_THRESHOLD,
    };
  } catch {
    return null;
  }
}

/**
 * Re-encode approve calldata with a new amount, keeping the same spender.
 */
export function encodeApproveCalldata(
  spender: `0x${string}`,
  amount: bigint,
): string {
  const spenderPadded = spender.slice(2).toLowerCase().padStart(64, "0");
  const amountHex = amount.toString(16).padStart(64, "0");
  return `${APPROVE_SELECTOR}${spenderPadded}${amountHex}`;
}

export { INFINITE_THRESHOLD };
