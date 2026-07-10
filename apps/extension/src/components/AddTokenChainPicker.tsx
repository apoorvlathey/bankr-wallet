import { useEffect, useRef } from "react";
import { CheckIcon, ChevronRightIcon } from "@chakra-ui/icons";

import ChainIcon from "@/components/ChainIcon";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerSearch,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";

export interface AddTokenChainOption {
  chainId: number;
  name: string;
}

interface AddTokenChainPickerProps {
  chains: AddTokenChainOption[];
  selectedChainId: number;
  search: string;
  onSearchChange: (value: string) => void;
  onBack: () => void;
  onSelect: (chainId: number) => void;
}

export default function AddTokenChainPicker({
  chains,
  selectedChainId,
  search,
  onSearchChange,
  onBack,
  onSelect,
}: AddTokenChainPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const filteredChains = chains.filter((chain) =>
    chain.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelector<HTMLElement>("[data-screen-heading]")
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <FullScreenPicker
      ref={pickerRef}
      title="Choose network"
      onBack={onBack}
      controls={
        <FullScreenPickerSearch
          label="Search networks"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Network name"
        />
      }
    >
      {filteredChains.length === 0 ? (
        <FullScreenPickerEmpty
          title="No networks found"
          description="Try another network name."
        />
      ) : (
        <ListSurface>
          {filteredChains.map((chain) => (
            <ListItem
              key={chain.chainId}
              interactive
              isSelected={chain.chainId === selectedChainId}
              onClick={() => onSelect(chain.chainId)}
            >
              <ListItemMedia>
                <ChainIcon
                  chainId={chain.chainId}
                  chainName={chain.name}
                  size="24px"
                  withChip
                />
              </ListItemMedia>
              <ListItemContent>
                <ListItemTitle>{chain.name}</ListItemTitle>
              </ListItemContent>
              <ListItemActions>
                {chain.chainId === selectedChainId ? (
                  <CheckIcon color="accent.secondary" boxSize={4} />
                ) : (
                  <ChevronRightIcon color="fg.muted" boxSize={5} />
                )}
              </ListItemActions>
            </ListItem>
          ))}
        </ListSurface>
      )}
    </FullScreenPicker>
  );
}
