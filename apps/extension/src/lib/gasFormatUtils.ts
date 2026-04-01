/**
 * Shared gas formatting utilities
 * Used by both TxDetailModal (post-tx) and GasEstimateDisplay (pre-tx)
 */

export function formatEth(wei: string, symbol = "ETH"): string {
  const eth = Number(BigInt(wei)) / 1e18;
  if (eth === 0) return `0 ${symbol}`;
  const formatted = eth.toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
  return `${formatted} ${symbol}`;
}

export function formatGwei(wei: string): string {
  const gwei = Number(BigInt(wei)) / 1e9;
  if (gwei === 0) return "0 Gwei";
  const formatted = gwei.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  return `${formatted} Gwei`;
}

export function formatNumber(value: string): string {
  return Number(value).toLocaleString();
}
