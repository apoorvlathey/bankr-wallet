/**
 * Render an Ethereum address as `0x1234…abcd` for display. Returns "" for
 * empty input so callers can use it on optional fields without guards.
 */
export function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
