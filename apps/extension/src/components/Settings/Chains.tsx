import React, { useEffect, useState } from "react";
import { Box,
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
import type { PendingAddChainRequest } from "@/chrome/pendingAddChainStorage";
import { useThemedToast } from "@/hooks/useThemedToast";
import { getChainConfig } from "@/constants/chainConfig";
import ChainIcon from "@/components/ChainIcon";
import { isDarkThemeId, ThemedCard, Decorator, useIconChipBg, useTheme } from "@/theme";
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
  const iconChipBg = useIconChipBg();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);

  return (
    <ThemedCard
      weight="medium"
      variant={network.hidden ? "sunken" : "default"}
      p={2.5}
      opacity={network.hidden ? 0.72 : 1}
      position="relative"
    >
      {/* Corner decoration — accent depends on chain type */}
      <Decorator
        corner="top-right"
        accent={network.isCustom ? "highlight" : "secondary"}
        {...(!network.isCustom && config.bg ? { bg: config.bg } : {})}
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
            bg={iconChipBg}
            border="2px solid"
            borderColor="border.default"
            borderRadius={isDarkTheme ? "md" : undefined}
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
                bg="fg.primary"
                color="surface.raised"
                border="1px solid"
                borderColor="border.default"
                fontWeight="700"
                px={1.5}
              >
                ID {network.chainId}
              </Badge>
              {isActive && (
                <Badge
                  fontSize="2xs"
                  bg="accent.secondary"
                  color="accentFg.secondary"
                  border="1px solid"
                  borderColor="border.default"
                  fontWeight="700"
                  px={1.5}
                >
                  ACTIVE
                </Badge>
              )}
              {network.isCustom && (
                <Badge
                  fontSize="2xs"
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  border="1px solid"
                  borderColor="border.default"
                  fontWeight="700"
                  px={1.5}
                >
                  CUSTOM
                </Badge>
              )}
              {network.hidden && (
                <Badge
                  fontSize="2xs"
                  bg="surface.raised"
                  color="text.secondary"
                  border="1px solid"
                  borderColor="border.default"
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
                color="accent.primary"
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
    </ThemedCard>
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

  // Delete confirmation
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [chainToDelete, setChainToDelete] = useState<string | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

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

  const toggleHidden = async (chainName: string) => {
    if (!networksInfo) return;

    const network = networksInfo[chainName];
    if (!network) return;

    const hidden = !network.hidden;
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
    } else if (activeChainName !== chainName) {
      toast({
        title: hidden ? "Chain hidden" : "Chain shown",
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
          fontWeight="600"
          pl={10}
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
          <ThemedCard weight="medium" px={4} py={5}>
            <Text fontSize="sm" fontWeight="700" color="text.secondary" textAlign="center">
              No chains match "{search.trim()}".
            </Text>
          </ThemedCard>
        )}
      </VStack>

      {/* Delete confirmation dialog */}
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
    </VStack>
  );
}

export default Chains;
