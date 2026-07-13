import { CheckIcon } from "@chakra-ui/icons";
import { useEffect, useRef, useState } from "react";
import ChainIcon from "@/components/ChainIcon";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerGroup,
  FullScreenPickerSearch,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
} from "@/components/ui";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";

interface NetworkPickerProps {
  chainIds: number[];
  selectedChainId: number;
  getChainName: (chainId: number) => string;
  onSelect: (chainId: number) => void;
  onBack: () => void;
}

export function NetworkPicker({
  chainIds,
  selectedChainId,
  getChainName,
  onSelect,
  onBack,
}: NetworkPickerProps) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredChains = normalizedSearch
    ? chainIds.filter((chainId) => {
        const name = getChainName(chainId);
        return (
          name.toLowerCase().includes(normalizedSearch) ||
          String(chainId).includes(normalizedSearch)
        );
      })
    : chainIds;

  return (
    <FullScreenPicker
      title="Choose network"
      onBack={onBack}
      controls={(
        <FullScreenPickerSearch
          ref={searchInputRef}
          label="Search networks"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Network name or chain ID"
        />
      )}
    >
      {filteredChains.length > 0 ? (
        <FullScreenPickerGroup
          label="Available networks"
          description="The transfer will be prepared on the network you choose."
        >
          {filteredChains.map((chainId) => {
            const name = getChainName(chainId);
            const environment = getChainEnvironmentLabel(chainId, name);
            const isSelected = chainId === selectedChainId;
            return (
              <ListItem
                key={chainId}
                interactive
                isSelected={isSelected}
                onClick={() => onSelect(chainId)}
              >
                <ListItemMedia>
                  <ChainIcon
                    chainId={chainId}
                    chainName={name}
                    size="28px"
                    withChip
                  />
                </ListItemMedia>
                <ListItemContent>
                  <ListItemTitle>{name}</ListItemTitle>
                  <ListItemDescription>
                    {environment || `Chain ID ${chainId}`}
                  </ListItemDescription>
                </ListItemContent>
                <ListItemMeta
                  color={isSelected ? "accent.secondary" : "fg.muted"}
                >
                  {isSelected ? (
                    <CheckIcon aria-label="Selected" />
                  ) : (
                    chainId
                  )}
                </ListItemMeta>
              </ListItem>
            );
          })}
        </FullScreenPickerGroup>
      ) : (
        <FullScreenPickerEmpty
          title="No networks found"
          description={`No network matches “${search.trim()}”.`}
        />
      )}
    </FullScreenPicker>
  );
}
