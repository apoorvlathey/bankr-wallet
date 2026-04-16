"use client";

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
import { SignatureSection } from "./sections/SignatureSection";
import { BatchSection } from "./sections/BatchSection";
import { WatchAssetSection } from "./sections/WatchAssetSection";
import { ChainSection } from "./sections/ChainSection";
import { RpcProxySection } from "./sections/RpcProxySection";
import { TEST_CHAINS } from "./constants";

function SectionCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent: "red" | "blue" | "yellow" | "green";
  children: React.ReactNode;
}) {
  const accentBg = {
    red: "bauhaus.red",
    blue: "bauhaus.blue",
    yellow: "bauhaus.yellow",
    green: "bauhaus.green",
  }[accent];
  const accentFg = accent === "yellow" ? "bauhaus.black" : "white";

  return (
    <Box
      bg="white"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="6px 6px 0px 0px #121212"
      display="flex"
      flexDirection="column"
    >
      <Box bg={accentBg} px={4} py={3} borderBottom="3px solid" borderColor="bauhaus.black">
        <Text
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

export default function TestContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, chains } = useSwitchChain();

  const activeChain = TEST_CHAINS[chainId];
  const isSupportedChain = !!activeChain;

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
                <ConnectButton
                  chainStatus="none"
                  showBalance={false}
                  accountStatus="address"
                />
              </Box>
            </HStack>
          </Flex>

          {/* Section grid */}
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={5}>
            <SectionCard title="Connect & Account" accent="blue">
              <ConnectSection />
            </SectionCard>

            <SectionCard title="Send Transaction" accent="red">
              <SendTxSection />
            </SectionCard>

            <SectionCard title="Signatures" accent="yellow">
              <SignatureSection />
            </SectionCard>

            <SectionCard title="Batch (ERC-5792)" accent="green">
              <BatchSection />
            </SectionCard>

            <SectionCard title="Watch Asset" accent="blue">
              <WatchAssetSection />
            </SectionCard>

            <SectionCard title="Chain" accent="red">
              <ChainSection />
            </SectionCard>

            <SectionCard title="Read-only RPC" accent="yellow">
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
