"use client";

import { useEffect, useRef } from "react";
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { Navigation } from "../components/Navigation";
import { Footer } from "../components/Footer";
import { ConnectSection } from "./sections/ConnectSection";
import { SendTxSection } from "./sections/SendTxSection";
import { ApprovalSection } from "./sections/ApprovalSection";
import { SignatureSection } from "./sections/SignatureSection";
import { DelegationsSection } from "./sections/DelegationsSection";
import { BatchSection } from "./sections/BatchSection";
import { WatchAssetSection } from "./sections/WatchAssetSection";
import { ChainSection } from "./sections/ChainSection";
import { RpcProxySection } from "./sections/RpcProxySection";
import { ClearSigningSection } from "./sections/ClearSigningSection";
import { TEST_CHAINS } from "./constants";
import {
  TestSectionNav,
  type TestSectionAccent,
  type TestSectionLink,
} from "./TestSectionNav";

function SectionCard({
  id,
  title,
  accent,
  children,
}: {
  id: string;
  title: string;
  accent: TestSectionAccent;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  const accentBg = {
    red: "bauhaus.red",
    blue: "bauhaus.blue",
    yellow: "bauhaus.yellow",
    green: "bauhaus.green",
  }[accent];
  const accentFg = accent === "yellow" ? "bauhaus.black" : "white";

  return (
    <Box
      as="section"
      id={id}
      aria-labelledby={headingId}
      scrollMarginTop="76px"
      bg="white"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="6px 6px 0px 0px #121212"
      display="flex"
      flexDirection="column"
    >
      <Box bg={accentBg} px={4} py={3} borderBottom="3px solid" borderColor="bauhaus.black">
        <Text
          as="h2"
          id={headingId}
          fontSize="sm"
          fontWeight="900"
          textTransform="uppercase"
          letterSpacing="wider"
          color={accentFg}
        >
          {title}
        </Text>
      </Box>
      <VStack spacing={3} align="stretch" p={4}>
        {children}
      </VStack>
    </Box>
  );
}

// Base is the preferred chain for testing: the ERC-7730 registry covers more
// of our test surface on Base (Aave V3, Permit2) and gas is cheap enough to
// burn through the full clear-signing matrix. Default to Base on first
// connect; respect manual switches afterwards.
const PREFERRED_TEST_CHAIN_ID = 8453;

const TEST_SECTION_LINKS = [
  { id: "connect-account", label: "Account", accent: "blue" },
  { id: "send-transaction", label: "Transaction", accent: "red" },
  { id: "approval-detection", label: "Approvals", accent: "red" },
  { id: "signatures", label: "Signatures", accent: "yellow" },
  { id: "delegations", label: "Delegations", accent: "blue" },
  { id: "batch", label: "Batch", accent: "green" },
  { id: "clear-signing", label: "Clear signing", accent: "yellow" },
  { id: "watch-asset", label: "Watch asset", accent: "blue" },
  { id: "chain", label: "Chain", accent: "red" },
  { id: "read-only-rpc", label: "RPC", accent: "yellow" },
] as const satisfies readonly TestSectionLink[];

export default function TestContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, chains } = useSwitchChain();

  const activeChain = TEST_CHAINS[chainId];
  const isSupportedChain = !!activeChain;

  // One-shot switch to Base on first render after a wallet connect. Tracks
  // "have we already nudged" via a ref so the user can manually switch to
  // another chain without us bouncing them back.
  const autoSwitchedRef = useRef(false);
  useEffect(() => {
    if (!isConnected) {
      autoSwitchedRef.current = false;
      return;
    }
    if (autoSwitchedRef.current) return;
    autoSwitchedRef.current = true;
    if (chainId !== PREFERRED_TEST_CHAIN_ID) {
      try {
        switchChain({ chainId: PREFERRED_TEST_CHAIN_ID });
      } catch {
        // Wallet may reject (e.g. chain not added) — leave the user where they are.
      }
    }
  }, [isConnected, chainId, switchChain]);

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />

      <Container maxW="7xl" pt={8} pb={24}>
        <VStack spacing={6} align="stretch">
          {/* Header */}
          <VStack spacing={2} textAlign="center">
            <HStack spacing={3} justify="center">
              <Box
                w="14px"
                h="14px"
                bg="bauhaus.red"
                border="2px solid"
                borderColor="bauhaus.black"
              />
              <Heading as="h1" size="xl">
                Test Dapp
              </Heading>
              <Box
                w="14px"
                h="14px"
                bg="bauhaus.blue"
                border="2px solid"
                borderColor="bauhaus.black"
                borderRadius="full"
              />
            </HStack>
            <Text fontSize="sm" color="gray.600" fontWeight="500" maxW="600px">
              Manual QA harness — click any button to trigger a JSON-RPC method
              and eyeball the wallet&apos;s confirmation UI.
            </Text>
          </VStack>

          {/* Connect + status bar */}
          <Flex
            direction={{ base: "column", md: "row" }}
            gap={3}
            justify="space-between"
            align={{ base: "stretch", md: "center" }}
            bg="white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            p={4}
          >
            <VStack align="flex-start" spacing={1} flex={1}>
              <Text
                fontSize="2xs"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wider"
                color="gray.500"
              >
                Connection
              </Text>
              {isConnected && address ? (
                <HStack spacing={3} flexWrap="wrap">
                  <Text fontSize="sm" fontWeight="700" fontFamily="mono">
                    {address}
                  </Text>
                  <Text fontSize="sm" fontWeight="700" color="bauhaus.blue">
                    {activeChain?.name ?? `Chain ${chainId}`}
                    {!isSupportedChain && " (unmapped)"}
                  </Text>
                </HStack>
              ) : (
                <Text fontSize="sm" fontWeight="700" color="gray.600">
                  Not connected
                </Text>
              )}
            </VStack>

            <HStack spacing={2} flexWrap="wrap" justify={{ base: "flex-start", md: "flex-end" }}>
              {isConnected &&
                Object.values(TEST_CHAINS).map((c) => (
                  <Button
                    key={c.chainId}
                    size="xs"
                    variant={c.chainId === chainId ? "secondary" : "outline"}
                    onClick={() => switchChain({ chainId: c.chainId })}
                    isDisabled={!chains.some((chain) => chain.id === c.chainId)}
                  >
                    {c.name}
                  </Button>
                ))}
              <Box
                sx={{
                  "& button": {
                    borderRadius: "0 !important",
                    fontWeight: "bold !important",
                    textTransform: "uppercase",
                    fontFamily: "'Outfit', sans-serif !important",
                  },
                }}
              >
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    mounted,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                  }) => {
                    const connected = mounted && account && chain;
                    const isWrongNetwork = connected && chain.unsupported;

                    return (
                      <Button
                        size="sm"
                        variant={connected ? "outline" : "primary"}
                        onClick={
                          !connected
                            ? openConnectModal
                            : isWrongNetwork
                              ? openChainModal
                              : openAccountModal
                        }
                        minW="150px"
                      >
                        {!connected
                          ? "Connect Wallet"
                          : isWrongNetwork
                            ? "Wrong Network"
                            : "Manage Wallet"}
                      </Button>
                    );
                  }}
                </ConnectButton.Custom>
              </Box>
            </HStack>
          </Flex>

          <TestSectionNav sections={TEST_SECTION_LINKS} />

          {/* Section grid */}
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={5}>
            <SectionCard id="connect-account" title="Connect & Account" accent="blue">
              <ConnectSection />
            </SectionCard>

            <SectionCard id="send-transaction" title="Send Transaction" accent="red">
              <SendTxSection />
            </SectionCard>

            <SectionCard id="approval-detection" title="Approval Detection" accent="red">
              <ApprovalSection />
            </SectionCard>

            <SectionCard id="signatures" title="Signatures" accent="yellow">
              <SignatureSection />
            </SectionCard>

            <SectionCard id="delegations" title="Delegations (ERC-7715)" accent="blue">
              <DelegationsSection />
            </SectionCard>

            <SectionCard id="batch" title="Batch (ERC-5792)" accent="green">
              <BatchSection />
            </SectionCard>

            <SectionCard id="clear-signing" title="Clear Signing (ERC-7730)" accent="yellow">
              <ClearSigningSection />
            </SectionCard>

            <SectionCard id="watch-asset" title="Watch Asset" accent="blue">
              <WatchAssetSection />
            </SectionCard>

            <SectionCard id="chain" title="Chain" accent="red">
              <ChainSection />
            </SectionCard>

            <SectionCard id="read-only-rpc" title="Read-only RPC" accent="yellow">
              <RpcProxySection />
            </SectionCard>
          </SimpleGrid>

          {!isConnected && (
            <Box
              bg="bauhaus.yellow"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              p={4}
              textAlign="center"
            >
              <Text fontWeight="800" textTransform="uppercase" letterSpacing="wider">
                Connect a wallet to start testing
              </Text>
            </Box>
          )}
        </VStack>
      </Container>

      <Footer />
    </Box>
  );
}
