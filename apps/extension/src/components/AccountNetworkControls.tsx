import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  Text,
} from "@chakra-ui/react";
import {
  AddIcon,
  CheckIcon,
  ChevronRightIcon,
} from "@chakra-ui/icons";
import type { Account } from "@/chrome/types";
import AccountSwitcher from "@/components/AccountSwitcher";
import ChainIcon from "@/components/ChainIcon";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerGroup,
  FullScreenPickerSearch,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import { sortNetworkSelectorOptions } from "@/components/shared/NetworkSelector";
import type { ResolvedChain } from "@/lib/chains";

interface AccountNetworkControlsProps {
  accounts: Account[];
  activeAccount: Account | null;
  selectedChain: ResolvedChain | undefined;
  visibleChains: ResolvedChain[];
  selectableChainIds?: ReadonlySet<number>;
  onAccountSelect: (account: Account) => void;
  onAddAccount: () => void;
  onAccountSettings: (account: Account) => void;
  onShowQr?: () => void;
  onChainSelect: (chainName: string) => void;
  onAddChain: () => void;
  showNetworkSelector?: boolean;
  isAccountPickerOpen?: boolean;
  onAccountPickerOpenChange?: (isOpen: boolean) => void;
  onAccountsReordered?: (accounts: Account[]) => void;
}

function AccountNetworkControls({
  accounts,
  activeAccount,
  selectedChain,
  visibleChains,
  selectableChainIds,
  onAccountSelect,
  onAddAccount,
  onAccountSettings,
  onShowQr,
  onChainSelect,
  onAddChain,
  showNetworkSelector = true,
  isAccountPickerOpen,
  onAccountPickerOpenChange,
  onAccountsReordered,
}: AccountNetworkControlsProps) {
  const [isNetworkPickerOpen, setIsNetworkPickerOpen] = useState(false);
  const [chainSearch, setChainSearch] = useState("");
  const [highlightedChainIndex, setHighlightedChainIndex] = useState(0);
  const networkTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedChainItemRef = useRef<HTMLElement | null>(null);

  const normalizedChainSearch = chainSearch.trim().toLowerCase();
  const orderedVisibleChains = useMemo(
    () => {
      const chains = visibleChains.map((chain) => ({
        ...chain,
        isSelectable:
          !selectableChainIds || selectableChainIds.has(chain.chainId),
      }));
      return selectableChainIds
        ? sortNetworkSelectorOptions(chains)
        : chains;
    },
    [selectableChainIds, visibleChains],
  );
  const filteredVisibleChains = useMemo(
    () =>
      normalizedChainSearch
        ? orderedVisibleChains.filter(
            (chain) =>
              chain.name.toLowerCase().includes(normalizedChainSearch) ||
              String(chain.chainId).includes(normalizedChainSearch) ||
              chain.nativeCurrency.symbol
                .toLowerCase()
                .includes(normalizedChainSearch),
          )
        : orderedVisibleChains,
    [normalizedChainSearch, orderedVisibleChains],
  );

  useEffect(() => {
    setHighlightedChainIndex(0);
  }, [chainSearch, isNetworkPickerOpen]);

  const closeNetworkPicker = useCallback((restoreFocus = true) => {
    setIsNetworkPickerOpen(false);
    setChainSearch("");
    setHighlightedChainIndex(0);
    if (restoreFocus) {
      requestAnimationFrame(() => networkTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isNetworkPickerOpen) return;

    const focusFrame = requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelector<HTMLElement>("[data-screen-heading]")
        ?.focus();
    });
    const scrollTimer = window.setTimeout(() => {
      if (!normalizedChainSearch) {
        selectedChainItemRef.current?.scrollIntoView({ block: "center" });
      }
    }, 120);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNetworkPicker();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      window.clearTimeout(scrollTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeNetworkPicker, isNetworkPickerOpen, normalizedChainSearch]);

  const selectChain = (chainName: string) => {
    const chain = orderedVisibleChains.find(
      (candidate) => candidate.name === chainName,
    );
    if (!chain?.isSelectable) return;
    onChainSelect(chainName);
    closeNetworkPicker();
  };

  const addChain = () => {
    onAddChain();
    closeNetworkPicker(false);
  };

  return (
    <>
      <Box
        w="full"
        overflow="hidden"
        bg="surface.raised"
        border="1px solid"
        borderColor="border.default"
        borderRadius="lg"
      >
        {accounts.length > 0 && (
          <AccountSwitcher
            accounts={accounts}
            activeAccount={activeAccount}
            explorerChains={visibleChains}
            onAccountSelect={onAccountSelect}
            onAddAccount={onAddAccount}
            onAccountSettings={onAccountSettings}
            onShowQr={onShowQr}
            isPickerOpen={isAccountPickerOpen}
            onPickerOpenChange={onAccountPickerOpenChange}
            onAccountsReordered={onAccountsReordered}
          />
        )}
      </Box>

      {showNetworkSelector && <Button
        ref={networkTriggerRef}
        aria-haspopup="listbox"
        aria-expanded={isNetworkPickerOpen}
        aria-label="Choose network"
        variant="ghost"
        w="full"
        h="auto"
        minH="48px"
        mt={1}
        px={2}
        py={2}
        borderRadius="md"
        justifyContent="flex-start"
        _hover={{ bg: "surface.raisedHover" }}
        _active={{ bg: "surface.sunken" }}
        onClick={() => setIsNetworkPickerOpen(true)}
      >
        {selectedChain ? (
          <HStack w="full" minW={0} spacing={2}>
            <ChainIcon
              chainId={selectedChain.chainId}
              chainName={selectedChain.name}
              size="20px"
            />
            <Text
              minW={0}
              flex={1}
              color="fg.primary"
              fontSize="sm"
              fontWeight="600"
              lineHeight="1.25"
              textAlign="start"
              noOfLines={2}
            >
              {selectedChain.name}
            </Text>
            <ChevronRightIcon
              boxSize={5}
              color="fg.primary"
              opacity={0.72}
              flexShrink={0}
            />
          </HStack>
        ) : (
          <HStack w="full" justify="space-between">
            <Text color="fg.secondary" fontSize="sm">Network</Text>
            <ChevronRightIcon
              boxSize={5}
              color="fg.primary"
              opacity={0.72}
              flexShrink={0}
            />
          </HStack>
        )}
      </Button>}

      {showNetworkSelector && isNetworkPickerOpen && (
        <FullScreenPickerLayer>
          <FullScreenPicker
            ref={pickerRef}
            title="Choose network"
            onBack={() => closeNetworkPicker()}
            controls={
              <FullScreenPickerSearch
                label="Search networks"
                placeholder="Name, chain ID, or symbol"
                value={chainSearch}
                onChange={(event) => setChainSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (filteredVisibleChains.length > 0) {
                      setHighlightedChainIndex((current) =>
                        Math.min(current + 1, filteredVisibleChains.length - 1),
                      );
                    }
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (filteredVisibleChains.length > 0) {
                      setHighlightedChainIndex((current) => Math.max(current - 1, 0));
                    }
                  } else if (event.key === "Enter") {
                    const highlighted = filteredVisibleChains[highlightedChainIndex];
                    if (highlighted) {
                      event.preventDefault();
                      selectChain(highlighted.name);
                    }
                  }
                }}
              />
            }
          >
            {filteredVisibleChains.length > 0 ? (
              <FullScreenPickerGroup
                label="Networks"
                description={`${visibleChains.length} available`}
              >
                {filteredVisibleChains.map((chain, index) => (
                  <ListItem
                    key={chain.chainId}
                    ref={
                      chain.chainId === selectedChain?.chainId
                        ? (node) => {
                            selectedChainItemRef.current = node;
                          }
                        : undefined
                    }
                    interactive
                    isDisabled={!chain.isSelectable}
                    isSelected={chain.chainId === selectedChain?.chainId}
                    onMouseEnter={() => setHighlightedChainIndex(index)}
                    bg={
                      index === highlightedChainIndex
                        ? "surface.raisedHover"
                        : undefined
                    }
                    onClick={() => selectChain(chain.name)}
                  >
                    <ListItemMedia>
                      <ChainIcon
                        chainId={chain.chainId}
                        chainName={chain.name}
                        size="32px"
                        withChip
                      />
                    </ListItemMedia>
                    <ListItemContent>
                      <ListItemTitle>{chain.name}</ListItemTitle>
                      <ListItemDescription>
                        {chain.isSelectable
                          ? `Chain ${chain.chainId} · ${chain.nativeCurrency.symbol}`
                          : "Safe not deployed"}
                      </ListItemDescription>
                    </ListItemContent>
                    {chain.chainId === selectedChain?.chainId &&
                    chain.isSelectable ? (
                      <CheckIcon boxSize={4} color="accent.secondary" />
                    ) : chain.isSelectable ? (
                      <ChevronRightIcon boxSize={5} color="fg.muted" />
                    ) : null}
                  </ListItem>
                ))}
              </FullScreenPickerGroup>
            ) : (
              <FullScreenPickerEmpty
                title="No networks found"
                description={`No network matches “${chainSearch.trim()}”. Try a name, chain ID, or currency symbol.`}
              />
            )}

            {activeAccount?.type !== "bankr" && (
              <FullScreenPickerGroup label="Manage">
                <ListItem interactive onClick={addChain}>
                  <ListItemMedia>
                    <Flex
                      boxSize="32px"
                      align="center"
                      justify="center"
                      bg="surface.sunken"
                      borderRadius="md"
                      color="accent.secondary"
                    >
                      <AddIcon boxSize={3.5} />
                    </Flex>
                  </ListItemMedia>
                  <ListItemContent>
                    <ListItemTitle>Add network</ListItemTitle>
                    <ListItemDescription>
                      Configure a custom network connection
                    </ListItemDescription>
                  </ListItemContent>
                  <ChevronRightIcon boxSize={5} color="fg.muted" />
                </ListItem>
              </FullScreenPickerGroup>
            )}
          </FullScreenPicker>
        </FullScreenPickerLayer>
      )}
    </>
  );
}

export default memo(AccountNetworkControls);
