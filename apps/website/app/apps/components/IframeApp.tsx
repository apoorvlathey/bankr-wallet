/**
 * IframeApp — Full-screen iframe view for embedding dApps via Safe Apps SDK.
 *
 * Architecture:
 * - Uses @impersonator/iframe to present a Safe-wallet-like interface to dApps.
 *   Dapps think they're running inside a Gnosis Safe and communicate via Safe Apps SDK.
 * - Chain state is managed locally (activeChainId), NOT via wagmi's switchChain,
 *   because the Safe connector doesn't support programmatic chain switching.
 * - Changing activeChainId remounts the ImpersonatorIframeProvider (via React key),
 *   which forces the iframe to reload and re-query getSafeInfo with the new chainId.
 *
 * Loading overlay lifecycle:
 *   1. overlayMounted=true (shows bounceIn + floatBob animation)
 *   2. First SDK postMessage received OR 800ms fallback → iframeLoaded=true
 *   3. 150ms delay → dismissing=true (slideOut animation)
 *   4. 350ms → overlayMounted=false (unmounted from DOM)
 *
 * Auto-connect vs manual-connect dApps:
 * - autoConnect=true: dApp auto-initializes Safe SDK, wallet connects immediately
 * - autoConnect=false: user must manually select "Safe" wallet in the dApp's UI;
 *   a yellow hint banner is shown until the first SDK message is received (safeConnected)
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { keyframes } from "@emotion/react";
import { ArrowLeft, ExternalLink, ChevronDown } from "lucide-react";
import {
  ImpersonatorIframeProvider,
  ImpersonatorIframe,
} from "@impersonator/iframe";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient, useChainId } from "wagmi";
import { CHAIN_RPC_URLS } from "@/app/wagmiConfig";
import { CHAIN_NAMES } from "../data/dapps";
import { ChainIcon } from "./ChainIcon";

// Loading overlay animations (via @emotion/react, not Chakra — Chakra doesn't export keyframes)
const bounceIn = keyframes`
  0% { opacity: 0; transform: scale(0.3) translateY(40px); }
  50% { opacity: 1; transform: scale(1.08) translateY(-8px); }
  70% { transform: scale(0.95) translateY(2px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
`;
const floatBob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
`;
const slideOut = keyframes`
  0% { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(0.5) translateY(-30px); }
`;

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
  const { address, isConnected, status: accountStatus } = useAccount();
  const { data: walletClient } = useWalletClient();
  const walletChainId = useChainId();
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);

  // Loading overlay state machine (see docblock above for lifecycle)
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(true);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);

  // Tracks whether the dapp has connected via Safe SDK (first postMessage received).
  // Used to auto-dismiss the "select Safe wallet" hint banner for non-autoConnect dapps.
  const [safeConnected, setSafeConnected] = useState(false);

  const availableChains = supportedChains.filter(
    (id) => CHAIN_RPC_URLS[id] !== undefined
  );

  // Local chain state — independent of wagmi so it works even when
  // the wallet connector doesn't support programmatic switching (e.g. Safe)
  const [activeChainId, setActiveChainId] = useState(() => {
    if (initialChainId && availableChains.includes(initialChainId)) return initialChainId;
    if (availableChains.includes(walletChainId)) return walletChainId;
    return availableChains[0] ?? walletChainId;
  });

  // Sync URL if the resolved chain differs from the initialChainId in the URL
  useEffect(() => {
    if (initialChainId !== undefined && activeChainId !== initialChainId) {
      onChainChange?.(activeChainId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle chain switch requests from the dapp inside the iframe
  const handleChainSwitchRequest = useCallback(
    (requestedChainId: number) => {
      if (availableChains.includes(requestedChainId)) {
        setActiveChainId(requestedChainId);
      }
    },
    [availableChains]
  );

  // Update page title while dapp is open — use MutationObserver to
  // re-apply after Next.js metadata overwrites on route changes
  useEffect(() => {
    const desiredTitle = `${appName} | WalletChan`;
    document.title = desiredTitle;

    const headEl = document.querySelector("head");
    if (!headEl) return;

    // Watch for <title> element replacements in <head> (Next.js swaps the element)
    const observer = new MutationObserver(() => {
      if (document.title !== desiredTitle) {
        // Delay to let Next.js finish its batch of DOM updates
        setTimeout(() => { document.title = desiredTitle; }, 0);
      }
    });
    observer.observe(headEl, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [appName]);

  // When activeChainId changes (from dropdown or dapp request), reset the loading
  // overlay and notify the parent to update the URL. Skips the first render since
  // the initial chain is already correct. The iframe remounts via key={activeChainId}
  // on the ImpersonatorIframeProvider, forcing the dapp to re-query getSafeInfo.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setIsSwitchingChain(true);
    setIframeLoaded(false);
    setDismissing(false);
    setOverlayMounted(true);
    setSafeConnected(false);
    onChainChange?.(activeChainId);
  }, [activeChainId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss overlay on first postMessage from the iframe (dapp SDK init = first paint),
  // with a fallback timeout for dapps that don't auto-connect via Safe SDK.
  // Also track Safe SDK connection to hide the "select Safe wallet" banner.
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.method || e.data?.messageId) {
        if (!iframeLoaded) setIframeLoaded(true);
        if (!safeConnected) setSafeConnected(true);
      }
    };
    window.addEventListener("message", handleMessage);
    const fallbackTimer = !iframeLoaded
      ? setTimeout(() => setIframeLoaded(true), 800)
      : undefined;
    return () => {
      window.removeEventListener("message", handleMessage);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [iframeLoaded, safeConnected]);

  // After first paint detected, start exit animation
  useEffect(() => {
    if (!iframeLoaded) return;
    const delayTimer = setTimeout(() => setDismissing(true), 150);
    return () => clearTimeout(delayTimer);
  }, [iframeLoaded]);

  // After exit animation finishes, unmount overlay
  useEffect(() => {
    if (!dismissing) return;
    const removeTimer = setTimeout(() => setOverlayMounted(false), 350);
    return () => clearTimeout(removeTimer);
  }, [dismissing]);

  const rpcUrl = CHAIN_RPC_URLS[activeChainId] ?? `https://eth.llamarpc.com`;

  const handleTransaction = useCallback(
    async (tx: any): Promise<string> => {
      if (!walletClient) throw new Error("No wallet client");
      return walletClient.sendTransaction(tx);
    },
    [walletClient]
  );

  const handleSignMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!walletClient) throw new Error("No wallet client");
      return walletClient.signMessage({ message });
    },
    [walletClient]
  );

  const handleSignTypedData = useCallback(
    async (typedData: any): Promise<string> => {
      if (!walletClient) throw new Error("No wallet client");
      return walletClient.signTypedData(typedData);
    },
    [walletClient]
  );

  /** Resolve favicon: use provided icon or fall back to Google favicon service */
  const faviconUrl = appIconUrl || (() => {
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
        px={4}
        py={2.5}
      >
        <HStack justify="space-between" align="center">
          {/* Left: Back + App info */}
          <HStack spacing={3} flex={1} minW={0}>
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
            <VStack align="start" spacing={0} minW={0}>
              <HStack spacing={2}>
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
              <HStack spacing={1}>
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
                />
              </HStack>
            </VStack>
          </HStack>

          {/* Right: Chain selector + ConnectButton */}
          <HStack spacing={3} flexShrink={0}>
            {/* Chain selector dropdown */}
            <ChainSelectorDropdown
              availableChains={availableChains}
              selectedChain={activeChainId}
              isOpen={chainDropdownOpen}
              onToggle={() => setChainDropdownOpen(!chainDropdownOpen)}
              onClose={() => setChainDropdownOpen(false)}
              onSelect={(id) => {
                setActiveChainId(id);
                setChainDropdownOpen(false);
              }}
            />

            {/* Account button (no chain selector — we have our own) */}
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
                    h="32px"
                    px={3}
                    onClick={connected ? openAccountModal : openConnectModal}
                    _hover={{ bg: "whiteAlpha.300" }}
                    _active={{ transform: "translate(1px, 1px)" }}
                  >
                    {connected ? (
                      <HStack spacing={2}>
                        {account.ensAvatar ? (
                          <Image
                            src={account.ensAvatar}
                            alt=""
                            w="18px"
                            h="18px"
                            borderRadius="full"
                            flexShrink={0}
                          />
                        ) : (
                          <Box w="6px" h="6px" bg="green.400" borderRadius="full" flexShrink={0} />
                        )}
                        <Text>{account.displayName}</Text>
                      </HStack>
                    ) : (
                      "CONNECT"
                    )}
                  </Button>
                );
              }}
            </ConnectButton.Custom>
          </HStack>
        </HStack>
      </Box>

      {/* Hint for non-autoConnect dapps — hidden once Safe SDK connects */}
      {!autoConnect && isConnected && !safeConnected && (
        <HStack
          bg="bauhaus.yellow"
          px={4}
          py={1.5}
          spacing={2}
          justify="center"
        >
          <Image
            src="/images/walletchan-icon-nobg.png"
            alt=""
            w="18px"
            h="18px"
            objectFit="contain"
          />
          <Text fontSize="xs" fontWeight="700" color="bauhaus.black">
            Select &quot;Safe&quot; as the wallet option inside the dapp to connect
          </Text>
        </HStack>
      )}

      {/* Not connected state — only show after wagmi finishes hydrating */}
      {accountStatus === "disconnected" && (
        <VStack flex={1} justify="center" spacing={6} p={8}>
          <Text
            fontWeight="900"
            fontSize="lg"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            Connect Wallet
          </Text>
          <Text color="gray.600" fontWeight="500" textAlign="center">
            Connect your wallet to interact with {appName}
          </Text>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <Button
                variant="primary"
                size="lg"
                onClick={openConnectModal}
              >
                Connect Wallet
              </Button>
            )}
          </ConnectButton.Custom>
        </VStack>
      )}

      {/* Loading state while wagmi hydrates, or iframe when connected */}
      {accountStatus !== "disconnected" && (
        <Box flex={1} position="relative">
          {/* Loading overlay */}
          {overlayMounted && (
            <VStack
              position="absolute"
              inset={0}
              justify="center"
              bg="blackAlpha.800"
              backdropFilter={dismissing ? "blur(0px)" : "blur(12px)"}
              zIndex={1}
              opacity={dismissing ? 0 : 1}
              transition="all 0.3s ease-out"
            >
              <Image
                src="/images/walletchan-icon-nobg.png"
                alt="Loading..."
                w="120px"
                h="120px"
                objectFit="contain"
                animation={
                  dismissing
                    ? `${slideOut} 0.35s ease-in forwards`
                    : `${bounceIn} 0.5s ease-out, ${floatBob} 2s ease-in-out 0.5s infinite`
                }
              />
              <Text
                fontWeight="800"
                fontSize="sm"
                textTransform="uppercase"
                letterSpacing="wide"
                color="whiteAlpha.600"
                opacity={dismissing ? 0 : 1}
                transition="opacity 0.2s ease-out"
              >
                {isSwitchingChain ? "Switching chain..." : `Loading ${appName}...`}
              </Text>
            </VStack>
          )}
          {/* key={activeChainId} forces full remount on chain switch — the dapp
              re-initializes Safe SDK and gets the new chainId from getSafeInfo */}
          <ImpersonatorIframeProvider
            key={activeChainId}
            address={address}
            rpcUrl={rpcUrl}
            sendTransaction={handleTransaction}
            signMessage={handleSignMessage}
            signTypedData={handleSignTypedData}
            onChainSwitchRequest={handleChainSwitchRequest}
          >
            <ImpersonatorIframe
              src={appUrl}
              address={address}
              rpcUrl={rpcUrl}
              width="100%"
              height="100%"
            />
          </ImpersonatorIframeProvider>
        </Box>
      )}
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
