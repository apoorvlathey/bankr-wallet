export interface NetworkSelectorOption {
  chainId: number;
  name: string;
  nativeSymbol?: string;
  balanceUsd?: number;
  isFunded?: boolean;
  isSelectable?: boolean;
  iconUrl?: string;
  iconBg?: string;
}

export function sortNetworkSelectorOptions<T extends NetworkSelectorOption>(
  networks: readonly T[],
): T[] {
  return [...networks].sort((a, b) => {
    const aSelectable = a.isSelectable !== false;
    const bSelectable = b.isSelectable !== false;
    if (aSelectable !== bSelectable) return aSelectable ? -1 : 1;
    const aFunded = a.isFunded ?? (a.balanceUsd ?? 0) > 0;
    const bFunded = b.isFunded ?? (b.balanceUsd ?? 0) > 0;
    if (aFunded !== bFunded) return aFunded ? -1 : 1;
    if (aFunded && bFunded) {
      const balanceDifference = (b.balanceUsd ?? 0) - (a.balanceUsd ?? 0);
      if (balanceDifference !== 0) return balanceDifference;
      return a.name.localeCompare(b.name);
    }
    if (a.chainId === 1 && b.chainId !== 1) return -1;
    if (b.chainId === 1 && a.chainId !== 1) return 1;
    return a.name.localeCompare(b.name);
  });
}
