/**
 * ERC20 transfer(address,uint256) detection and parsing.
 *
 * Function selector: 0xa9059cbb
 * Calldata layout: 4 bytes selector + 32 bytes recipient + 32 bytes amount
 *
 * Mirrors the shape of `erc20Approve.ts` so callers can treat the two the
 * same way (parse spender/recipient + amount in one call, refuse non-canonical
 * encodings that could hide the real address from a naive `.slice(-40)` parser).
 */

const TRANSFER_SELECTOR = "0xa9059cbb";

export interface ParsedTransfer {
  recipient: `0x${string}`;
  amount: bigint;
}

export function isErc20Transfer(data: string | undefined): boolean {
  if (!data) return false;
  return data.toLowerCase().startsWith(TRANSFER_SELECTOR);
}

export function parseTransferCalldata(data: string): ParsedTransfer | null {
  if (!isErc20Transfer(data)) return null;
  if (data.length !== 138) return null;

  try {
    const recipientWord = data.slice(10, 74).toLowerCase();
    // Upper 12 bytes MUST be zero — refuses non-canonical encodings that could
    // hide the real address from a naive `.slice(-40)` parser.
    if (!/^0{24}[0-9a-f]{40}$/.test(recipientWord)) return null;
    const recipient = `0x${recipientWord.slice(-40)}` as `0x${string}`;

    const amountHex = data.slice(74, 138);
    const amount = BigInt(`0x${amountHex}`);

    return { recipient, amount };
  } catch {
    return null;
  }
}
