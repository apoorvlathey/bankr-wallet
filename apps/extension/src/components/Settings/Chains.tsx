import React, { useEffect, useState } from "react";
import { Box,
  IconButton,
  Badge,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  FormControl,
  FormLabel,
  Tabs,
  TabList,
  Tab,
  useDisclosure,
} from "@chakra-ui/react";
import {
  ViewIcon,
  ViewOffIcon,
  DeleteIcon,
  AddIcon,
  Search2Icon,
  SmallCloseIcon,
} from "@chakra-ui/icons";
import { useNetworks } from "@/contexts/NetworksContext";
import { NetworksInfo } from "@/types";
import type { PendingAddChainRequest } from "@/chrome/requests/pendingAddChainStorage";
import { useThemedToast } from "@/hooks/useThemedToast";
import ChainIcon from "@/components/ChainIcon";
import EditChain from "./EditChain";
import AddChain from "./AddChain";
import ChainDeleteDialog from "./ChainDeleteDialog";
import {
  getChainEntriesForTab,
  getChainVisibilityCounts,
  type ChainVisibilityTab,
} from "./chainsModel";
import {
  AppHeader,
  AppScreen,
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  ScreenBody,
} from "@/components/ui";

function getRpcDisplay(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return rpcUrl;
  }
}

function Chain({
  chainName,
  network,
  openEditChain,
  onToggleHidden,
  onDelete,
}: {
  chainName: string;
  network: NetworksInfo[string];
  openEditChain: () => void;
  onToggleHidden: () => void;
  onDelete?: () => void;
  }) {
  const rpcDisplay = getRpcDisplay(network.rpcUrl);

  return (
    <ListItem
      opacity={network.hidden ? 0.72 : 1}
    >
      <ListItemMedia>
        <ChainIcon chainId={network.chainId} chainName={chainName} size="28px" withChip />
      </ListItemMedia>
      <ListItemContent>
        <ListItemTitle>{chainName}</ListItemTitle>
        <ListItemDescription>Chain ID {network.chainId}</ListItemDescription>
        <ListItemDescription title={network.rpcUrl} display="block" w="full" minW={0} isTruncated sx={{ overflowWrap: "normal" }}>
          {rpcDisplay}
        </ListItemDescription>
        {(network.isCustom || network.hidden) && (
          <Box mt={1} display="flex" gap={1} flexWrap="wrap">
            {network.isCustom && <Badge>Custom</Badge>}
            {network.hidden && <Badge>Hidden</Badge>}
          </Box>
        )}
      </ListItemContent>
      <ListItemActions>
        <IconButton
          aria-label={network.hidden ? `Show ${chainName}` : `Hide ${chainName}`}
          title={network.hidden ? "Show network" : "Hide network"}
          icon={network.hidden ? <ViewOffIcon /> : <ViewIcon />}
          size="sm"
          variant="ghost"
          onClick={onToggleHidden}
        />
        {network.isCustom && onDelete && (
          <IconButton
            aria-label={`Delete ${chainName}`}
            title="Delete network"
            icon={<DeleteIcon />}
            size="sm"
            variant="ghost"
            color="status.error.fg"
            onClick={onDelete}
          />
        )}
        <Button size="sm" variant="ghost" onClick={openEditChain}>Edit</Button>
      </ListItemActions>
    </ListItem>
  );
}

function Chains({
  close,
  initialTab = "list",
  initialAddChainRequest,
  initialEditChainName,
  onChainSaved,
  onInitialAddChainCancelled,
}: {
  close: () => void;
  initialTab?: "list" | "add";
  initialAddChainRequest?: PendingAddChainRequest;
  initialEditChainName?: string;
  onChainSaved?: (chain: { chainName: string; chainId: number }) => void;
  onInitialAddChainCancelled?: () => void;
}) {
  const { networksInfo } = useNetworks();
  const toast = useThemedToast();

  const [tab, setTab] = useState<React.ReactElement>();
  const [pendingInitialEditChainName, setPendingInitialEditChainName] = useState(initialEditChainName);
  const [activeChainName, setActiveChainName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibilityTab, setVisibilityTab] =
    useState<ChainVisibilityTab>("active");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const networksInfoRef = React.useRef(networksInfo);
  const activeChainNameRef = React.useRef(activeChainName);
  networksInfoRef.current = networksInfo;
  activeChainNameRef.current = activeChainName;

  // Delete confirmation
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [chainToDelete, setChainToDelete] = useState<string | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const toggleHidden = React.useCallback(async (chainName: string, nextHidden?: boolean) => {
    const currentNetworksInfo = networksInfoRef.current;
    if (!currentNetworksInfo) return;

    const network = currentNetworksInfo[chainName];
    if (!network) return;

    const hidden = nextHidden ?? !network.hidden;
    const result = await new Promise<{
      success: boolean;
      error?: string;
      fallbackChainName?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "setNetworkHidden",
          chainName,
          hidden,
        },
        (response) =>
          resolve(
            response ?? {
              success: false,
              error: chrome.runtime.lastError?.message || "Network update failed.",
            },
          ),
      );
    });

    if (!result.success) {
      toast({
        title: hidden ? "Cannot hide chain" : "Cannot show chain",
        description: result.error || "Network update failed.",
        status: "error",
        duration: 3000,
      });
      return;
    }

    if (result.fallbackChainName) {
      setActiveChainName(result.fallbackChainName);
      toast({
        title: "Active chain hidden",
        description: `Switched to ${result.fallbackChainName}.`,
        status: "info",
        duration: 2500,
      });
    } else if (activeChainNameRef.current !== chainName) {
      toast({
        title: hidden ? "Chain hidden" : "Chain shown",
        description: chainName,
        status: "success",
        duration: 1800,
      });
    }
  }, [toast]);

  const confirmDelete = React.useCallback((chainName: string) => {
    setChainToDelete(chainName);
    onOpen();
  }, [onOpen]);

  const openEditChain = React.useCallback((chainName: string) => {
    setTab(
      <EditChain
        back={() => setTab(undefined)}
        chainName={chainName}
        onSaved={onChainSaved}
        onToggleHidden={(hidden) => toggleHidden(chainName, hidden)}
        onDelete={
          networksInfo?.[chainName]?.isCustom
            ? () => confirmDelete(chainName)
            : undefined
        }
      />,
    );
  }, [confirmDelete, networksInfo, onChainSaved, toggleHidden]);

  const doDelete = React.useCallback(async () => {
    if (chainToDelete) {
      const result = await new Promise<{
        success: boolean;
        error?: string;
        fallbackChainName?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "deleteNetwork",
            chainName: chainToDelete,
          },
          (response) =>
            resolve(
              response ?? {
                success: false,
                error: chrome.runtime.lastError?.message || "Network update failed.",
              },
            ),
        );
      });
      if (!result.success) {
        toast({
          title: "Cannot delete chain",
          description: result.error || "Network update failed.",
          status: "error",
          duration: 3000,
        });
        return;
      }
      if (result.fallbackChainName) {
        setActiveChainName(result.fallbackChainName);
        toast({
          title: "Active chain deleted",
          description: `Switched to ${result.fallbackChainName}.`,
          status: "info",
          duration: 2500,
        });
      }
      setTab(undefined);
    }
    setChainToDelete(null);
    onClose();
  }, [chainToDelete, onClose, toast]);

  useEffect(() => {
    if (initialTab === "add") {
      setTab(
        <AddChain
          back={(options) => {
            if (!options?.added) onInitialAddChainCancelled?.();
            setTab(undefined);
          }}
          initialRequest={initialAddChainRequest}
          onAdded={
            onChainSaved
              ? (chainName, chainId) => onChainSaved({ chainName, chainId })
              : undefined
          }
        />,
      );
    }
  }, [
    initialAddChainRequest,
    initialTab,
    onChainSaved,
    onInitialAddChainCancelled,
  ]);

  useEffect(() => {
    if (!pendingInitialEditChainName || !networksInfo?.[pendingInitialEditChainName]) return;
    openEditChain(pendingInitialEditChainName);
    setPendingInitialEditChainName(undefined);
  }, [pendingInitialEditChainName, networksInfo, openEditChain]);

  useEffect(() => {
    chrome.storage.sync.get("chainName").then(({ chainName }) => {
      setActiveChainName(chainName ?? null);
    });

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "sync" && changes.chainName) {
        setActiveChainName(changes.chainName.newValue ?? null);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const visibilityCounts = getChainVisibilityCounts(networksInfo);
  const filteredChainEntries = getChainEntriesForTab({
    networksInfo,
    activeChainName,
    visibilityTab,
    search,
  });

  const deleteDialog = (
    <ChainDeleteDialog
      chainName={chainToDelete}
      isOpen={isOpen}
      cancelRef={cancelRef}
      onClose={onClose}
      onDelete={doDelete}
    />
  );

  if (tab !== undefined) {
    return (
      <>
        {tab}
        {deleteDialog}
      </>
    );
  }

  return (
    <>
    <Box flex="1 1 auto" minH={0} mx={-4} my={-4} w="calc(100% + 2rem)" h="calc(100% + 2rem)">
      <AppScreen>
        <AppHeader
          title="Chains"
          onBack={close}
          trailing={
            <IconButton
              aria-label="Add network"
              title="Add network"
              icon={<AddIcon />}
              variant="ghost"
              minW="44px"
              h="44px"
              onClick={() => setTab(<AddChain back={() => setTab(undefined)} />)}
            />
          }
        />
        <ScreenBody pt={4} pb={6}>
          <FormControl mb={4}>
            <FormLabel htmlFor="network-search">Search networks</FormLabel>
            <InputGroup>
              <InputLeftElement pointerEvents="none" h="full">
                <Search2Icon color="fg.muted" />
              </InputLeftElement>
              <Input
                id="network-search"
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, chain ID, or RPC host"
                pl={10}
                pr={search ? 12 : undefined}
              />
              {search && (
                <InputRightElement h="full" w="44px">
                  <IconButton
                    aria-label="Clear search"
                    icon={<SmallCloseIcon boxSize={4} />}
                    variant="ghost"
                    minW="40px"
                    w="40px"
                    h="40px"
                    onClick={() => {
                      setSearch("");
                      searchInputRef.current?.focus();
                    }}
                  />
                </InputRightElement>
              )}
            </InputGroup>
          </FormControl>

          <Tabs
            index={visibilityTab === "active" ? 0 : 1}
            onChange={(index) => setVisibilityTab(index === 0 ? "active" : "hidden")}
            variant="line"
            mb={4}
          >
            <TabList aria-label="Chain visibility">
              <Tab>Active ({visibilityCounts.active})</Tab>
              <Tab>Hidden ({visibilityCounts.hidden})</Tab>
            </TabList>
          </Tabs>

          <ListSurface
            aria-label={`${visibilityTab === "active" ? "Active" : "Hidden"} networks`}
          >
        {filteredChainEntries.map(([chainName, network]) => (
            <Chain
              key={chainName}
              chainName={chainName}
              network={network}
              openEditChain={() =>
                openEditChain(chainName)
              }
              onToggleHidden={() => toggleHidden(chainName)}
              onDelete={
                network.isCustom
                  ? () => confirmDelete(chainName)
                  : undefined
              }
            />
          ))}
          </ListSurface>
          {filteredChainEntries.length === 0 && (
            <EmptyState mt={4}>
              <EmptyStateHeader>
                <EmptyStateTitle>{search.trim()
                  ? "No matching networks"
                  : `No ${visibilityTab} networks`}</EmptyStateTitle>
                <EmptyStateDescription>
                  {search.trim()
                    ? "Try another network name, chain ID, or RPC host."
                    : visibilityTab === "hidden"
                      ? "Networks you hide will appear here."
                      : "Show a hidden network to make it active."}
                </EmptyStateDescription>
              </EmptyStateHeader>
            </EmptyState>
          )}
        </ScreenBody>
      </AppScreen>
    </Box>
    {deleteDialog}
    </>
  );
}

export default Chains;
