/**
 * Strict ABI-encoding validator for well-known ERC20-family selectors.
 *
 * Background: ethers/viem parsers expose non-canonical ABI errors only as
 * "deferred" errors — they surface lazily on field access, so a wallet that
 * never reads `args[i]` will happily render a "clean" approval card from
 * calldata whose address slot has non-zero high bytes. Signing such calldata
 * blindly is a known footgun (see external bug report 2026-05).
 *
 * This module performs an explicit, eager check on the few selectors that
 * appear in our structured display surfaces (approve / transfer / transferFrom
 * / increaseAllowance / decreaseAllowance). The high 12 bytes of every
 * `address`-typed slot must be zero — otherwise the calldata is rejected and
 * the tx-confirmation UI blocks signing.
 *
 * We do NOT validate every possible selector here; for arbitrary calldata the
 * generic `CalldataDecoder` already shows "Could not decode" when ethers'
 * deferred error fires. The job of this validator is specifically to refuse
 * to sign a transaction whose calldata WILL be displayed by one of our
 * structured cards or matches a high-value selector.
 */

const ZERO_PAD_24 = "0".repeat(24);

interface AddressSlotConfig {
  /** Human-readable function name (used in the warning banner). */
  name: string;
  /** Indices of 32-byte argument slots that must encode addresses. */
  addressSlots: number[];
  /** Total number of required argument slots. */
  arity: number;
}

/**
 * Map of well-known selectors → slot layout. All entries are static-layout
 * (no dynamic types), so the calldata is exactly `4 + arity * 32` bytes.
 */
const ADDRESS_SLOT_CONFIG: Record<string, AddressSlotConfig> = {
  // approve(address spender, uint256 amount)
  "0x095ea7b3": { name: "approve", addressSlots: [0], arity: 2 },
  // transfer(address to, uint256 amount)
  "0xa9059cbb": { name: "transfer", addressSlots: [0], arity: 2 },
  // transferFrom(address from, address to, uint256 amount)
  "0x23b872dd": { name: "transferFrom", addressSlots: [0, 1], arity: 3 },
  // increaseAllowance(address spender, uint256 addedValue)
  "0x39509351": { name: "increaseAllowance", addressSlots: [0], arity: 2 },
  // decreaseAllowance(address spender, uint256 subtractedValue)
  "0xa457c2d7": { name: "decreaseAllowance", addressSlots: [0], arity: 2 },
};

export interface CalldataValidationResult {
  malformed: boolean;
  /** Lower-cased 4-byte selector (e.g. "0x095ea7b3") when recognised. */
  selector?: string;
  /** Friendly function name from the known-selector table. */
  functionName?: string;
  /** Short, user-facing reason describing why we refused. */
  reason?: string;
}

/**
 * Returns `{ malformed: true, … }` when `data` starts with a known ERC20-family
 * selector but is not canonically ABI-encoded (wrong length, non-zero address
 * padding). Returns `{ malformed: false }` for unknown selectors and for
 * canonical encodings — callers should still rely on the generic decoder for
 * non-validated selectors.
 */
export function detectAbiEncodingError(
  data: string | undefined,
): CalldataValidationResult {
  if (!data || typeof data !== "string") return { malformed: false };
  const lower = data.toLowerCase();
  if (!lower.startsWith("0x") || lower.length < 10) return { malformed: false };

  const selector = lower.slice(0, 10);
  const config = ADDRESS_SLOT_CONFIG[selector];
  if (!config) return { malformed: false };

  const expectedLength = 2 + 8 + config.arity * 64;
  if (lower.length !== expectedLength) {
    return {
      malformed: true,
      selector,
      functionName: config.name,
      reason: `Calldata for ${config.name}(...) has the wrong length — ABI requires exactly ${config.arity} 32-byte arguments.`,
    };
  }

  // Only hex characters are allowed past the selector.
  if (!/^[0-9a-f]+$/.test(lower.slice(2))) {
    return {
      malformed: true,
      selector,
      functionName: config.name,
      reason: `Calldata for ${config.name}(...) contains non-hex characters.`,
    };
  }

  for (const slotIdx of config.addressSlots) {
    const start = 10 + slotIdx * 64;
    const word = lower.slice(start, start + 64);
    if (!word.startsWith(ZERO_PAD_24)) {
      return {
        malformed: true,
        selector,
        functionName: config.name,
        reason: `Non-zero high bytes in the address argument of ${config.name}(...) — the upper 12 bytes of an ABI-encoded address must be zero. This calldata is non-canonical and may be an attempt to hide the real recipient.`,
      };
    }
  }

  return { malformed: false, selector, functionName: config.name };
}
