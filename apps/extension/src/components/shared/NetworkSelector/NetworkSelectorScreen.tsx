import { CheckIcon } from "@chakra-ui/icons";
import { Box } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerGroup,
  FullScreenPickerLoading,
  FullScreenPickerSearch,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
} from "@/components/ui";
import {
  sortNetworkSelectorOptions,
  type NetworkSelectorOption,
} from "./model";

interface NetworkSelectorScreenProps {
  title: string;
  networks: readonly NetworkSelectorOption[];
  selectedChainId: number | null;
  onSelect: (chainId: number | null) => void;
  onBack: () => void;
  includeAllNetworks?: boolean;
  allNetworksDescription?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchInputRef?: RefObject<HTMLInputElement>;
  isLoading?: boolean;
}

function formatUsdCompact(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}K`;
  }
  if (value >= 1) return `$${value.toFixed(2)}`;
  return "<$1";
}

function NetworkLogo({ network }: { network: NetworkSelectorOption }) {
  if (!network.iconUrl) {
    return (
      <ChainIcon
        chainId={network.chainId}
        chainName={network.name}
        size="32px"
        withChip
      />
    );
  }

  return (
    <Box
      boxSize="32px"
      borderRadius="full"
      bg={network.iconBg}
      overflow="hidden"
      flexShrink={0}
    >
      <SafeImage
        src={network.iconUrl}
        alt=""
        boxSize="32px"
        borderRadius="full"
        fallback={
          <ChainIcon
            chainId={network.chainId}
            chainName={network.name}
            size="32px"
            withChip
          />
        }
      />
    </Box>
  );
}

export function NetworkSelectorScreen({
  title,
  networks,
  selectedChainId,
  onSelect,
  onBack,
  includeAllNetworks = false,
  allNetworksDescription = "Show the complete portfolio",
  search,
  onSearchChange,
  searchInputRef,
  isLoading = false,
}: NetworkSelectorScreenProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const query = search ?? internalSearch;
  const inputRef = searchInputRef ?? internalSearchRef;
  const setQuery = onSearchChange ?? setInternalSearch;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timeoutId);
  }, [inputRef]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onBack]);

  const sortedNetworks = useMemo(
    () => sortNetworkSelectorOptions(networks),
    [networks],
  );
  const normalizedSearch = query.trim().toLowerCase();
  const filteredNetworks = normalizedSearch
    ? sortedNetworks.filter(
        (network) =>
          network.name.toLowerCase().includes(normalizedSearch) ||
          network.nativeSymbol?.toLowerCase().includes(normalizedSearch) ||
          String(network.chainId).includes(normalizedSearch),
      )
    : sortedNetworks;

  return (
    <FullScreenPicker
      title={title}
      onBack={onBack}
      controls={
        <FullScreenPickerSearch
          ref={inputRef}
          label="Search networks"
          placeholder="Search networks"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
    >
      {isLoading ? (
        <FullScreenPickerLoading label="Loading networks" />
      ) : filteredNetworks.length > 0 ||
        (includeAllNetworks && !normalizedSearch) ? (
        <FullScreenPickerGroup label="Networks">
          {includeAllNetworks && !normalizedSearch && (
            <ListItem
              interactive
              isSelected={selectedChainId === null}
              onClick={() => onSelect(null)}
            >
              <ListItemContent>
                <ListItemTitle>All networks</ListItemTitle>
                <ListItemDescription>{allNetworksDescription}</ListItemDescription>
              </ListItemContent>
              {selectedChainId === null && (
                <ListItemActions aria-label="Selected">
                  <CheckIcon color="accent.highlight" boxSize={4} />
                </ListItemActions>
              )}
            </ListItem>
          )}
          {filteredNetworks.map((network) => {
            const isSelected = network.chainId === selectedChainId;
            return (
              <ListItem
                key={network.chainId}
                interactive
                isSelected={isSelected}
                aria-pressed={isSelected}
                onClick={() => onSelect(network.chainId)}
              >
                <ListItemMedia>
                  <NetworkLogo network={network} />
                </ListItemMedia>
                <ListItemContent>
                  <ListItemTitle>{network.name}</ListItemTitle>
                  {network.nativeSymbol && (
                    <ListItemDescription>
                      Native token · {network.nativeSymbol}
                    </ListItemDescription>
                  )}
                </ListItemContent>
                {(network.balanceUsd ?? 0) > 0 && (
                  <ListItemMeta>
                    {formatUsdCompact(network.balanceUsd ?? 0)}
                  </ListItemMeta>
                )}
                {isSelected && (
                  <ListItemActions aria-label="Selected">
                    <CheckIcon color="accent.highlight" boxSize={4} />
                  </ListItemActions>
                )}
              </ListItem>
            );
          })}
        </FullScreenPickerGroup>
      ) : (
        <FullScreenPickerEmpty
          title="No networks found"
          description={`No network matches “${query.trim()}”.`}
        />
      )}
    </FullScreenPicker>
  );
}
