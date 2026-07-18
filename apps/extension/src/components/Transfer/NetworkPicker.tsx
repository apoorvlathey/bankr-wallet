import { NetworkSelectorScreen } from "@/components/shared/NetworkSelector";

interface NetworkPickerProps {
  chainIds: number[];
  selectedChainId: number;
  getChainName: (chainId: number) => string;
  getNativeSymbol: (chainId: number) => string | undefined;
  chainBalances: ReadonlyMap<number, number>;
  fundedChainIds: ReadonlySet<number>;
  onSelect: (chainId: number) => void;
  onBack: () => void;
}

export function NetworkPicker({
  chainIds,
  selectedChainId,
  getChainName,
  getNativeSymbol,
  chainBalances,
  fundedChainIds,
  onSelect,
  onBack,
}: NetworkPickerProps) {
  return (
    <NetworkSelectorScreen
      title="Send network"
      networks={chainIds.map((chainId) => ({
        chainId,
        name: getChainName(chainId),
        nativeSymbol: getNativeSymbol(chainId),
        balanceUsd: chainBalances.get(chainId) ?? 0,
        isFunded: fundedChainIds.has(chainId),
      }))}
      selectedChainId={selectedChainId}
      onSelect={(chainId) => {
        if (chainId !== null) onSelect(chainId);
      }}
      onBack={onBack}
    />
  );
}
