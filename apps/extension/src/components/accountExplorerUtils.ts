const ETHERSCAN_URL = "https://etherscan.io";

export function getDefaultAccountExplorerUrl(address: string): string {
  return `${ETHERSCAN_URL}/address/${address}`;
}
