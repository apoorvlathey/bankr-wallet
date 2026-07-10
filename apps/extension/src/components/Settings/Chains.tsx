import React, { useEffect, useState } from "react";
import { Box,
  IconButton,
  Badge,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  FormControl,
  FormLabel,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useDisclosure,
} from "@chakra-ui/react";
import {
  ViewIcon,
  ViewOffIcon,
  DeleteIcon,
  AddIcon,
  Search2Icon,
} from "@chakra-ui/icons";
import { useNetworks } from "@/contexts/NetworksContext";
import { NetworksInfo } from "@/types";
import type { PendingAddChainRequest } from "@/chrome/pendingAddChainStorage";
import { useThemedToast } from "@/hooks/useThemedToast";
import ChainIcon from "@/components/ChainIcon";
import EditChain from "./EditChain";
import AddChain from "./AddChain";
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
  isActive,
  openEditChain,
  onToggleHidden,
  onDelete,
}: {
  chainName: string;
  network: NetworksInfo[string];
  isActive: boolean;
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
        <ListItemDescription title={network.rpcUrl}>
          Chain ID {network.chainId} · {rpcDisplay}
        </ListItemDescription>
        <Box mt={1} display="flex" gap={1} flexWrap="wrap">
          {isActive && <Badge colorScheme="blue">Active</Badge>}
          {network.isCustom && <Badge>Custom</Badge>}
          {network.hidden && <Badge>Hidden</Badge>}
        </Box>
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

  const chainEntries = networksInfo
    ? Object.entries(networksInfo).sort(([nameA, networkA], [nameB, networkB]) => {
        const score = (name: string, network: NetworksInfo[string]) => {
          if (name === activeChainName) return 0;
          if (network.hidden) return 3;
          if (network.isCustom) return 2;
          return 1;
        };

        const diff = score(nameA, networkA) - score(nameB, networkB);
        if (diff !== 0) return diff;
        return nameA.localeCompare(nameB);
      })
    : [];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredChainEntries = normalizedSearch
    ? chainEntries.filter(([name, network]) => {
        const rpcDisplay = getRpcDisplay(network.rpcUrl).toLowerCase();
        return (
          name.toLowerCase().includes(normalizedSearch) ||
          String(network.chainId).includes(normalizedSearch) ||
          rpcDisplay.includes(normalizedSearch)
        );
      })
    : chainEntries;

  const deleteDialog = (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
    >
      <AlertDialogOverlay bg="surface.overlay">
        <AlertDialogContent mx={4} maxW="320px" w="calc(100% - 2rem)">
          <AlertDialogHeader
            fontWeight="900"
            fontSize="md"
            textTransform="uppercase"
            color="fg.primary"
            borderBottomWidth="1px"
            borderColor="border.subtle"
          >
            Delete Chain
          </AlertDialogHeader>
          <AlertDialogBody color="text.secondary" py={4} fontSize="sm" fontWeight="500">
            Remove <strong>{chainToDelete}</strong> from your networks? This
            cannot be undone.
          </AlertDialogBody>
          <AlertDialogFooter gap={2} borderTopWidth="1px" borderColor="border.subtle">
            <Button ref={cancelRef} variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={doDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
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
          title="Network connections"
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
        <ScreenBody pb={6}>
          <FormControl mb={4}>
            <FormLabel htmlFor="network-search">Search networks</FormLabel>
            <InputGroup>
              <InputLeftElement pointerEvents="none">
                <Search2Icon color="fg.muted" />
              </InputLeftElement>
              <Input
                id="network-search"
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, chain ID, or RPC host"
                pl={10}
              />
            </InputGroup>
          </FormControl>

          <ListSurface aria-label="Networks">
        {filteredChainEntries.map(([chainName, network]) => (
            <Chain
              key={chainName}
              chainName={chainName}
              network={network}
              isActive={activeChainName === chainName}
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
                <EmptyStateTitle>No matching networks</EmptyStateTitle>
                <EmptyStateDescription>
                  Try another network name, chain ID, or RPC host.
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
