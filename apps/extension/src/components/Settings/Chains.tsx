import React, { useEffect, useState } from "react";
import {
  Box,
  HStack,
  Spacer,
  VStack,
  Text,
  IconButton,
  Badge,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useDisclosure,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  ChevronRightIcon,
  ViewIcon,
  ViewOffIcon,
  DeleteIcon,
  AddIcon,
  Search2Icon,
} from "@chakra-ui/icons";
import { useNetworks } from "@/contexts/NetworksContext";
import { NetworksInfo } from "@/types";
import type { AccountType } from "@/chrome/types";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import { getChainConfig } from "@/constants/chainConfig";
import ChainIcon from "@/components/ChainIcon";
import { getVisibleChains } from "@/lib/chains";
import EditChain from "./EditChain";
import AddChain from "./AddChain";

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
  const config = getChainConfig(network.chainId);
  const rpcDisplay = getRpcDisplay(network.rpcUrl);

  return (
    <Box
      bg={network.hidden ? "bg.muted" : "bauhaus.white"}
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow={network.hidden ? "none" : "4px 4px 0px 0px #121212"}
      p={2.5}
      opacity={network.hidden ? 0.72 : 1}
      position="relative"
      transition="all 0.2s ease-out"
    >
      {/* Corner decoration */}
      <Box
        position="absolute"
        top="-3px"
        right="-3px"
        w="8px"
        h="8px"
        bg={network.isCustom ? "bauhaus.yellow" : config.bg || "bauhaus.blue"}
        border="2px solid"
        borderColor="bauhaus.black"
      />

      <VStack align="stretch" spacing={2}>
        <HStack
          spacing={3}
          align="start"
          cursor="pointer"
          onClick={openEditChain}
          _hover={{ opacity: 0.88 }}
        >
          <Box
            bg="bauhaus.white"
            border="2px solid"
            borderColor="bauhaus.black"
            p={1.5}
            flexShrink={0}
          >
            <ChainIcon chainId={network.chainId} chainName={chainName} size="22px" />
          </Box>
          <VStack align="start" spacing={1} flex={1} minW={0}>
            <HStack spacing={1.5} flexWrap="wrap">
              <Text fontWeight="800" color="text.primary" noOfLines={1} fontSize="sm">
                {chainName}
              </Text>
              <Badge
                fontSize="2xs"
                bg="bauhaus.black"
                color="bauhaus.white"
                border="1px solid"
                borderColor="bauhaus.black"
                fontWeight="700"
                px={1.5}
              >
                ID {network.chainId}
              </Badge>
              {isActive && (
                <Badge
                  fontSize="2xs"
                  bg="bauhaus.blue"
                  color="bauhaus.white"
                  border="1px solid"
                  borderColor="bauhaus.black"
                  fontWeight="700"
                  px={1.5}
                >
                  ACTIVE
                </Badge>
              )}
              {network.isCustom && (
                <Badge
                  fontSize="2xs"
                  bg="bauhaus.yellow"
                  color="bauhaus.black"
                  border="1px solid"
                  borderColor="bauhaus.black"
                  fontWeight="700"
                  px={1.5}
                >
                  CUSTOM
                </Badge>
              )}
              {network.hidden && (
                <Badge
                  fontSize="2xs"
                  bg="bauhaus.white"
                  color="text.secondary"
                  border="1px solid"
                  borderColor="bauhaus.black"
                  fontWeight="700"
                  px={1.5}
                >
                  HIDDEN
                </Badge>
              )}
            </HStack>
            <Text
              fontSize="xs"
              color="text.tertiary"
              noOfLines={1}
              fontWeight="600"
              title={network.rpcUrl}
            >
              {rpcDisplay}
            </Text>
          </VStack>
        </HStack>

        <HStack justify="space-between" spacing={2}>
          <HStack spacing={1.5}>
            <IconButton
              aria-label={network.hidden ? "Show chain" : "Hide chain"}
              icon={network.hidden ? <ViewOffIcon /> : <ViewIcon />}
              size="xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onToggleHidden();
              }}
            />
            <Text fontSize="2xs" color="text.tertiary" fontWeight="700" textTransform="uppercase" letterSpacing="wide">
              {network.hidden ? "Hidden in selector" : "Visible in selector"}
            </Text>
          </HStack>
          <HStack spacing={1}>
            {network.isCustom && onDelete && (
              <IconButton
                aria-label="Delete chain"
                icon={<DeleteIcon />}
                size="xs"
                variant="ghost"
                color="bauhaus.red"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              />
            )}
            <Button
              size="xs"
              variant="secondary"
              onClick={openEditChain}
              px={2.5}
              rightIcon={<ChevronRightIcon />}
            >
              Edit
            </Button>
          </HStack>
        </HStack>
      </VStack>
    </Box>
  );
}

function Chains({
  close,
  initialTab = "list",
  initialEditChainName,
  onChainSaved,
}: {
  close: () => void;
  initialTab?: "list" | "add";
  initialEditChainName?: string;
  onChainSaved?: (chain: { chainName: string; chainId: number }) => void;
}) {
  const { networksInfo, setNetworksInfo } = useNetworks();
  const toast = useBauhausToast();

  const [tab, setTab] = useState<React.ReactElement>();
  const [pendingInitialEditChainName, setPendingInitialEditChainName] = useState(initialEditChainName);
  const [activeAccountType, setActiveAccountType] = useState<AccountType | null>(
    null,
  );
  const [activeChainName, setActiveChainName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Delete confirmation
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [chainToDelete, setChainToDelete] = useState<string | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (initialTab === "add") {
      setTab(<AddChain back={() => setTab(undefined)} />);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!pendingInitialEditChainName || !networksInfo?.[pendingInitialEditChainName]) return;
    setTab(
      <EditChain
        back={() => setTab(undefined)}
        chainName={pendingInitialEditChainName}
        onSaved={onChainSaved}
      />,
    );
    setPendingInitialEditChainName(undefined);
  }, [pendingInitialEditChainName, networksInfo, onChainSaved]);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "getActiveAccount" }, (account) => {
      if (chrome.runtime.lastError) return;
      setActiveAccountType(account?.type ?? null);
    });

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

  const getFallbackChainName = (
    nextNetworksInfo: NetworksInfo,
    excludedChainName?: string,
  ): string | null => {
    const visibleChains = getVisibleChains(nextNetworksInfo, activeAccountType).filter(
      (chain) => chain.name !== excludedChainName,
    );
    return visibleChains[0]?.name ?? null;
  };

  const applyNetworkUpdate = async (
    nextNetworksInfo: NetworksInfo,
    options?: { hiddenChainName?: string; deletedChainName?: string },
  ) => {
    const hiddenChainName = options?.hiddenChainName;
    const deletedChainName = options?.deletedChainName;
    const invalidatedChainName = deletedChainName || hiddenChainName;
    const shouldSwitch =
      !!activeChainName &&
      !!invalidatedChainName &&
      activeChainName === invalidatedChainName;

    const fallbackChainName = shouldSwitch
      ? getFallbackChainName(nextNetworksInfo, deletedChainName)
      : null;

    if (shouldSwitch && !fallbackChainName) {
      toast({
        title: deletedChainName ? "Cannot delete chain" : "Cannot hide chain",
        description: "This is the last visible chain for the current account.",
        status: "error",
        duration: 3000,
      });
      return false;
    }

    setNetworksInfo(nextNetworksInfo);

    if (fallbackChainName) {
      await chrome.storage.sync.set({ chainName: fallbackChainName });
      setActiveChainName(fallbackChainName);
      toast({
        title: deletedChainName
          ? "Active chain deleted"
          : "Active chain hidden",
        description: `Switched to ${fallbackChainName}.`,
        status: "info",
        duration: 2500,
      });
    }

    return true;
  };

  const toggleHidden = async (chainName: string) => {
    if (!networksInfo) return;

    const nextNetworksInfo = {
      ...networksInfo,
      [chainName]: {
        ...networksInfo[chainName],
        hidden: !networksInfo[chainName].hidden,
      },
    };

    const switched = await applyNetworkUpdate(nextNetworksInfo, {
      hiddenChainName: nextNetworksInfo[chainName].hidden ? chainName : undefined,
    });
    if (switched && activeChainName !== chainName) {
      toast({
        title: nextNetworksInfo[chainName].hidden ? "Chain hidden" : "Chain shown",
        description: chainName,
        status: "success",
        duration: 1800,
      });
    }
  };

  const confirmDelete = (chainName: string) => {
    setChainToDelete(chainName);
    onOpen();
  };

  const doDelete = async () => {
    if (chainToDelete && networksInfo) {
      const next = { ...networksInfo };
      delete next[chainToDelete];
      const deleted = await applyNetworkUpdate(next, {
        deletedChainName: chainToDelete,
      });
      if (!deleted) return;
    }
    setChainToDelete(null);
    onClose();
  };

  if (tab !== undefined) {
    return tab;
  }

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

  return (
    <VStack spacing={4} align="stretch">
      {/* Header */}
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={close}
        />
        <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
          Chains
        </Text>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary" fontWeight="500">
        Manage networks, edit RPC endpoints, and add custom chains.
      </Text>

      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none">
          <Search2Icon color="text.tertiary" boxSize={3.5} />
        </InputLeftElement>
        <Input
          ref={searchInputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chains"
          border="3px solid"
          borderColor="bauhaus.black"
          borderRadius="0"
          bg="bauhaus.white"
          fontWeight="600"
          pl={10}
          _hover={{ borderColor: "bauhaus.black" }}
          _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
        />
      </InputGroup>

      {/* Add Chain button */}
      <Button
        variant="primary"
        size="sm"
        leftIcon={<AddIcon />}
        onClick={() =>
          setTab(<AddChain back={() => setTab(undefined)} />)
        }
        fontWeight="700"
        justifyContent="center"
      >
        Add Custom Chain
      </Button>

      {/* Chain List */}
      <VStack spacing={3} align="stretch">
        {filteredChainEntries.map(([chainName, network]) => (
            <Chain
              key={chainName}
              chainName={chainName}
              network={network}
              isActive={activeChainName === chainName}
              openEditChain={() =>
                setTab(
                  <EditChain
                    back={() => setTab(undefined)}
                    chainName={chainName}
                    onSaved={onChainSaved}
                  />
                )
              }
              onToggleHidden={() => toggleHidden(chainName)}
              onDelete={
                networksInfo[chainName].isCustom
                  ? () => confirmDelete(chainName)
                  : undefined
              }
            />
          ))}
        {filteredChainEntries.length === 0 && (
          <Box
            bg="bauhaus.white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            px={4}
            py={5}
          >
            <Text fontSize="sm" fontWeight="700" color="text.secondary" textAlign="center">
              No chains match "{search.trim()}".
            </Text>
          </Box>
        )}
      </VStack>

      {/* Delete confirmation dialog */}
      <AlertDialog
        isOpen={isOpen}
        leastDestructiveRef={cancelRef}
        onClose={onClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent
            bg="bauhaus.white"
            border="3px solid"
            borderColor="bauhaus.black"
            borderRadius="0"
            boxShadow="6px 6px 0px 0px #121212"
          >
            <AlertDialogHeader fontWeight="900" textTransform="uppercase">
              Delete Chain
            </AlertDialogHeader>
            <AlertDialogBody>
              Remove <strong>{chainToDelete}</strong> from your networks? This cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                bg="bauhaus.red"
                color="bauhaus.white"
                border="2px solid"
                borderColor="bauhaus.black"
                borderRadius="0"
                fontWeight="700"
                _hover={{ opacity: 0.9 }}
                onClick={doDelete}
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </VStack>
  );
}

export default Chains;
