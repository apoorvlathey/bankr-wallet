/**
 * IframeContent — Core iframe rendering logic extracted from IframeApp.
 *
 * Renders the ImpersonatorIframeProvider + ImpersonatorIframe + loading overlay
 * + auto-connect hint banner. Used by both the fullscreen IframeApp (mobile) and
 * the windowed Win95Window (desktop OS view).
 *
 * Chain state is managed by the parent — this component receives activeChainId
 * as a prop and calls onChainChange when a switch is needed.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, HStack, VStack, Text, Image } from "@chakra-ui/react";
import { ExternalLink } from "lucide-react";
import { keyframes } from "@emotion/react";
import {
  ImpersonatorIframeProvider,
  ImpersonatorIframe,
} from "@impersonator/iframe";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@chakra-ui/react";
import { CHAIN_RPC_URLS } from "@/app/wagmiConfig";

// Loading overlay animations
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

export interface IframeContentProps {
  appUrl: string;
  appName: string;
  activeChainId: number;
  supportedChains: number[];
  autoConnect?: boolean;
  onChainChange?: (chainId: number) => void;
  /** Called when the iframe receives its first Safe SDK message */
  onSafeConnected?: () => void;
}

export function IframeContent({
  appUrl,
  appName,
  activeChainId,
  supportedChains,
  autoConnect = true,
  onChainChange,
  onSafeConnected,
}: IframeContentProps) {
  const { address, isConnected, status: accountStatus } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Loading overlay state machine
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(true);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);
  const [safeConnected, setSafeConnected] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const availableChains = supportedChains.filter(
    (id) => CHAIN_RPC_URLS[id] !== undefined
  );

  // Handle chain switch requests from the dapp inside the iframe
  const handleChainSwitchRequest = useCallback(
    (requestedChainId: number) => {
      if (availableChains.includes(requestedChainId)) {
        onChainChange?.(requestedChainId);
      }
    },
    [availableChains, onChainChange]
  );

  // When activeChainId changes, reset loading overlay
  const prevChainIdRef = useRef(activeChainId);
  useEffect(() => {
    if (prevChainIdRef.current === activeChainId) return;
    prevChainIdRef.current = activeChainId;
    setIsSwitchingChain(true);
    setIframeLoaded(false);
    setDismissing(false);
    setOverlayMounted(true);
    setSafeConnected(false);
  }, [activeChainId]);

  // Dismiss overlay on first postMessage from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.method || e.data?.messageId) {
        if (!iframeLoaded) setIframeLoaded(true);
        if (!safeConnected) {
          setSafeConnected(true);
          onSafeConnected?.();
        }
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
  }, [iframeLoaded, safeConnected, onSafeConnected]);

  // Check if the site blocks iframe embedding via response headers
  useEffect(() => {
    setIframeBlocked(false);
    fetch(`/api/frame-check?url=${encodeURIComponent(appUrl)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.blocked) setIframeBlocked(true);
      })
      .catch(() => {});
  }, [appUrl]);

  // After first paint, start exit animation
  useEffect(() => {
    if (!iframeLoaded) return;
    const delayTimer = setTimeout(() => setDismissing(true), 150);
    return () => clearTimeout(delayTimer);
  }, [iframeLoaded]);

  // After exit animation, unmount overlay
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

  // Not connected state
  if (accountStatus === "disconnected") {
    return (
      <VStack flex={1} justify="center" spacing={6} p={8} h="100%">
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
            <Button variant="primary" size="lg" onClick={openConnectModal}>
              Connect Wallet
            </Button>
          )}
        </ConnectButton.Custom>
      </VStack>
    );
  }

  return (
    <Box flex={1} position="relative" h="100%">
      {/* Hint for non-autoConnect dapps */}
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
            Select &quot;Safe&quot; as the wallet option inside the dapp to
            connect
          </Text>
        </HStack>
      )}

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

      {/* Blocked iframe overlay */}
      {iframeBlocked && !overlayMounted && (
        <VStack
          position="absolute"
          inset={0}
          justify="center"
          spacing={4}
          bg="blackAlpha.800"
          backdropFilter="blur(12px)"
          zIndex={2}
          p={8}
        >
          <Text
            fontWeight="900"
            fontSize="lg"
            letterSpacing="wide"
            color="white"
          >
            😔 App doesn&apos;t support iframe
          </Text>
          <Box
            as="a"
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            display="inline-flex"
            alignItems="center"
            gap={2}
            px={6}
            py={3}
            bg="bauhaus.red"
            color="white"
            fontWeight="800"
            fontSize="md"
            border="3px solid"
            borderColor="bauhaus.black"
            textTransform="uppercase"
            letterSpacing="wide"
            _hover={{ opacity: 0.9 }}
          >
            Open in New Tab
            <ExternalLink size={16} />
          </Box>
        </VStack>
      )}

      {/* key includes address + chainId to force full remount on wallet connect or chain switch */}
      <ImpersonatorIframeProvider
        key={`${address}-${activeChainId}`}
        address={address}
        rpcUrl={rpcUrl}
        sendTransaction={handleTransaction}
        signMessage={handleSignMessage}
        signTypedData={handleSignTypedData}
        onChainSwitchRequest={handleChainSwitchRequest}
      >
        <ImpersonatorIframe
          src={appUrl}
          address={address as string}
          rpcUrl={rpcUrl}
          width="100%"
          height="100%"
        />
      </ImpersonatorIframeProvider>
    </Box>
  );
}
