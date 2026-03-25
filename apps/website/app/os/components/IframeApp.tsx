/**
 * IframeApp — Full-screen iframe view for embedding dApps via Safe Apps SDK.
 * Used as the mobile/fullscreen fallback. The desktop OS view uses Win95Window
 * + IframeContent directly.
 *
 * This is a thin wrapper around IframeContent that adds the fullscreen toolbar
 * (back button, app info, chain selector, ConnectButton).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  HStack,
  VStack,
  Text,
  IconButton,
  Image,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  Button,
} from "@chakra-ui/react";
import { ArrowLeft, ExternalLink, ChevronDown } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId } from "wagmi";
import { CHAIN_RPC_URLS } from "@/app/wagmiConfig";
import { CHAIN_NAMES } from "../data/dapps";
import { ChainIcon } from "./ChainIcon";
import { IframeContent } from "./IframeContent";

interface IframeAppProps {
  appUrl: string;
  appName: string;
  appIconUrl?: string;
  supportedChains: number[];
  autoConnect?: boolean;
  initialChainId?: number;
  onChainChange?: (chainId: number) => void;
  onBack: () => void;
}

export function IframeApp({
  appUrl,
  appName,
  appIconUrl,
  supportedChains,
  autoConnect = true,
  initialChainId,
  onChainChange,
  onBack,
}: IframeAppProps) {
  const walletChainId = useChainId();
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);

  const availableChains = supportedChains.filter(
    (id) => CHAIN_RPC_URLS[id] !== undefined
  );

  // Local chain state — independent of wagmi
  const [activeChainId, setActiveChainId] = useState(() => {
    if (initialChainId && availableChains.includes(initialChainId))
      return initialChainId;
    if (availableChains.includes(walletChainId)) return walletChainId;
    return availableChains[0] ?? walletChainId;
  });

  // Sync URL if the resolved chain differs from initialChainId
  useEffect(() => {
    if (initialChainId !== undefined && activeChainId !== initialChainId) {
      onChainChange?.(activeChainId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update page title while dapp is open
  useEffect(() => {
    const desiredTitle = `${appName} | WalletChan`;
    document.title = desiredTitle;

    const headEl = document.querySelector("head");
    if (!headEl) return;

    const observer = new MutationObserver(() => {
      if (document.title !== desiredTitle) {
        setTimeout(() => {
          document.title = desiredTitle;
        }, 0);
      }
    });
    observer.observe(headEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [appName]);

  // Notify parent on chain change (skip first render)
  const handleChainChange = useCallback(
    (chainId: number) => {
      setActiveChainId(chainId);
      onChainChange?.(chainId);
    },
    [onChainChange]
  );

  /** Resolve favicon */
  const faviconUrl =
    appIconUrl ||
    (() => {
      try {
        return `https://www.google.com/s2/favicons?domain=${new URL(appUrl).hostname}&sz=64`;
      } catch {
        return undefined;
      }
    })();

  /** Format URL for display */
  const displayUrl = (() => {
    try {
      const urlObj = new URL(appUrl);
      const full = `${urlObj.hostname}${urlObj.pathname === "/" ? "" : urlObj.pathname}`;
      return full.length > 50 ? full.substring(0, 47) + "..." : full;
    } catch {
      return appUrl;
    }
  })();

  return (
    <Box h="100vh" display="flex" flexDirection="column">
      {/* Toolbar */}
      <Box
        bg="bauhaus.black"
        borderBottom="4px solid"
        borderColor="bauhaus.black"
        px={3}
        py={2}
      >
        {/* Row 1: Back + App name + Connect */}
        <HStack justify="space-between" align="center" mb={1.5}>
          <HStack spacing={2} flex={1} minW={0}>
            <IconButton
              aria-label="Back to apps"
              icon={<ArrowLeft size={16} />}
              size="sm"
              variant="ghost"
              color="white"
              _hover={{ bg: "whiteAlpha.200" }}
              onClick={onBack}
              flexShrink={0}
            />
            {faviconUrl && (
              <Image
                src={faviconUrl}
                alt=""
                w="16px"
                h="16px"
                borderRadius="3px"
                flexShrink={0}
              />
            )}
            <Text
              color="white"
              fontWeight="900"
              fontSize="sm"
              textTransform="uppercase"
              letterSpacing="wide"
              noOfLines={1}
            >
              {appName}
            </Text>
          </HStack>

          <ConnectButton.Custom>
            {({ account, openAccountModal, openConnectModal, mounted }) => {
              const connected = mounted && account;
              return (
                <Button
                  size="sm"
                  bg="whiteAlpha.200"
                  color="white"
                  border="2px solid"
                  borderColor="whiteAlpha.300"
                  borderRadius="0"
                  fontWeight="700"
                  fontSize="xs"
                  letterSpacing="wide"
                  h="28px"
                  px={2.5}
                  flexShrink={0}
                  onClick={connected ? openAccountModal : openConnectModal}
                  _hover={{ bg: "whiteAlpha.300" }}
                  _active={{ transform: "translate(1px, 1px)" }}
                >
                  {connected ? (
                    <HStack spacing={1.5}>
                      {account.ensAvatar ? (
                        <Image
                          src={account.ensAvatar}
                          alt=""
                          w="16px"
                          h="16px"
                          borderRadius="full"
                          flexShrink={0}
                        />
                      ) : (
                        <Box
                          w="6px"
                          h="6px"
                          bg="green.400"
                          borderRadius="full"
                          flexShrink={0}
                        />
                      )}
                      <Text fontSize="xs">{account.displayName}</Text>
                    </HStack>
                  ) : (
                    "CONNECT"
                  )}
                </Button>
              );
            }}
          </ConnectButton.Custom>
        </HStack>

        {/* Row 2: URL (left) + Chain selector (right) */}
        <HStack spacing={2} align="center" justify="space-between">
          <HStack spacing={1} flex={1} minW={0}>
            <Text
              color="whiteAlpha.500"
              fontSize="xs"
              fontFamily="mono"
              noOfLines={1}
            >
              {displayUrl}
            </Text>
            <IconButton
              aria-label="Open in new tab"
              icon={<ExternalLink size={12} />}
              size="xs"
              variant="ghost"
              color="whiteAlpha.500"
              minW="auto"
              h="auto"
              p={0.5}
              _hover={{ color: "white" }}
              as="a"
              href={appUrl}
              target="_blank"
              flexShrink={0}
            />
          </HStack>
          <ChainSelectorDropdown
            availableChains={availableChains}
            selectedChain={activeChainId}
            isOpen={chainDropdownOpen}
            onToggle={() => setChainDropdownOpen(!chainDropdownOpen)}
            onClose={() => setChainDropdownOpen(false)}
            onSelect={(id) => {
              handleChainChange(id);
              setChainDropdownOpen(false);
            }}
          />
        </HStack>
      </Box>

      {/* Iframe content */}
      <IframeContent
        appUrl={appUrl}
        appName={appName}
        activeChainId={activeChainId}
        supportedChains={supportedChains}
        autoConnect={autoConnect}
        onChainChange={handleChainChange}
      />
    </Box>
  );
}

/** Chain selector dropdown with logos */
function ChainSelectorDropdown({
  availableChains,
  selectedChain,
  isOpen,
  onToggle,
  onClose,
  onSelect,
}: {
  availableChains: number[];
  selectedChain: number;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (chainId: number) => void;
}) {
  return (
    <Popover isOpen={isOpen} onClose={onClose} placement="bottom-end" isLazy>
      <PopoverTrigger>
        <Button
          size="sm"
          bg="whiteAlpha.200"
          color="white"
          border="2px solid"
          borderColor="whiteAlpha.300"
          borderRadius="0"
          fontWeight="700"
          fontSize="xs"
          textTransform="uppercase"
          letterSpacing="wide"
          h="32px"
          px={3}
          onClick={onToggle}
          _hover={{ bg: "whiteAlpha.300" }}
          _active={{ transform: "translate(1px, 1px)" }}
          leftIcon={<ChainIcon chainId={selectedChain} size="14px" />}
          rightIcon={<ChevronDown size={12} />}
        >
          {CHAIN_NAMES[selectedChain] || `Chain ${selectedChain}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        bg="bauhaus.black"
        border="2px solid"
        borderColor="whiteAlpha.300"
        borderRadius="0"
        boxShadow="6px 6px 0px 0px rgba(0,0,0,0.3)"
        w="200px"
        _focus={{ outline: "none" }}
      >
        <PopoverBody p={0} maxH="280px" overflowY="auto">
          {availableChains.map((id) => (
            <Box
              key={id}
              as="button"
              w="full"
              textAlign="left"
              px={3}
              py={2}
              bg={selectedChain === id ? "whiteAlpha.200" : "transparent"}
              color="white"
              fontWeight={selectedChain === id ? "800" : "600"}
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="wide"
              borderBottom="1px solid"
              borderColor="whiteAlpha.100"
              _hover={{ bg: "whiteAlpha.200" }}
              onClick={() => onSelect(id)}
              transition="all 0.1s"
            >
              <HStack spacing={2}>
                <ChainIcon chainId={id} size="14px" />
                <Text>{CHAIN_NAMES[id] || `Chain ${id}`}</Text>
              </HStack>
            </Box>
          ))}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
