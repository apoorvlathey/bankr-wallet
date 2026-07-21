"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Container,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";

import { Navigation } from "../components/Navigation";
import type {
  PrivacyPoolsExplorerNetwork,
  PrivacyPoolsExplorerResult,
} from "./types";
import { VerificationResult } from "./VerificationResult";

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

type VerificationError = { error?: string };

function inferredNetwork(value: string): PrivacyPoolsExplorerNetwork | null {
  try {
    const url = new URL(value.trim());
    if (url.hostname.toLowerCase() === "sepolia.etherscan.io") return "sepolia";
    if (url.hostname.toLowerCase() === "etherscan.io") return "mainnet";
  } catch {
    // Raw hashes deliberately preserve the user's selected network.
  }
  return null;
}

function validTransactionInput(value: string): boolean {
  if (TRANSACTION_HASH.test(value.trim())) return true;
  try {
    const url = new URL(value.trim());
    return (
      ["etherscan.io", "sepolia.etherscan.io"].includes(url.hostname.toLowerCase()) &&
      /^\/tx\/0x[0-9a-fA-F]{64}\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export default function PrivacyPoolsExplorerContent() {
  const [transaction, setTransaction] = useState("");
  const [network, setNetwork] = useState<PrivacyPoolsExplorerNetwork>("mainnet");
  const [result, setResult] = useState<PrivacyPoolsExplorerResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lastAutoCheckedUrl = useRef("");
  const activeRequest = useRef(0);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const verify = useCallback(async (
    transactionOverride?: string,
    networkOverride?: PrivacyPoolsExplorerNetwork,
  ) => {
    const submittedTransaction = (transactionOverride ?? transaction).trim();
    const submittedNetwork = networkOverride ?? network;
    const requestId = ++activeRequest.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/privacy-pools-explorer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction: submittedTransaction,
          network: submittedNetwork,
        }),
      });
      const data = (await response.json()) as PrivacyPoolsExplorerResult | VerificationError;
      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Verification failed");
      }
      if (requestId !== activeRequest.current) return;
      setResult(data as PrivacyPoolsExplorerResult);
      setNow(Date.now());
    } catch (caught) {
      if (requestId !== activeRequest.current) return;
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Verification failed");
    } finally {
      if (requestId === activeRequest.current) setLoading(false);
    }
  }, [network, transaction]);

  const handleTransactionChange = (value: string) => {
    setTransaction(value);
    const detected = inferredNetwork(value);
    if (!detected) {
      lastAutoCheckedUrl.current = "";
      return;
    }

    setNetwork(detected);
    const normalizedUrl = value.trim();
    if (
      validTransactionInput(normalizedUrl) &&
      lastAutoCheckedUrl.current !== normalizedUrl
    ) {
      lastAutoCheckedUrl.current = normalizedUrl;
      void verify(normalizedUrl, detected);
    }
  };

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />
      <Container maxW="5xl" py={{ base: 8, md: 12 }}>
        <VStack spacing={8} align="stretch">
          <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={5} direction={{ base: "column", md: "row" }}>
            <HStack spacing={4} align="flex-start">
              <Flex
                w="44px"
                h="44px"
                bg="bauhaus.yellow"
                border="3px solid"
                borderColor="bauhaus.black"
                align="center"
                justify="center"
                flexShrink={0}
              >
                <ShieldCheck size={24} />
              </Flex>
              <Box>
                <Text
                  as="h1"
                  fontWeight="black"
                  fontSize={{ base: "2xl", md: "4xl" }}
                  textTransform="uppercase"
                  letterSpacing="tighter"
                  lineHeight="0.95"
                >
                  Privacy Pools Explorer
                </Text>
                <Text mt={2} color="gray.600" maxW="620px" fontSize="sm">
                  Verify a Shield deposit against the Privacy Pools ASP and its on-chain association root.
                </Text>
              </Box>
            </HStack>
            <Text
              bg="bauhaus.black"
              color="white"
              px={3}
              py={2}
              fontSize="xs"
              fontWeight="800"
              textTransform="uppercase"
              letterSpacing="widest"
            >
              Admin tool
            </Text>
          </Flex>

          <Box
            bg="white"
            border={{ base: "2px solid", md: "4px solid" }}
            borderColor="bauhaus.black"
            boxShadow={{ base: "4px 4px 0 #121212", md: "8px 8px 0 #121212" }}
          >
            <Box h="7px" bg="bauhaus.blue" />
            <Box p={{ base: 5, md: 8 }}>
              <FormControl isInvalid={Boolean(transaction) && !validTransactionInput(transaction)}>
                <FormLabel fontWeight="800" textTransform="uppercase" letterSpacing="wide" fontSize="sm">
                  Shield deposit transaction
                </FormLabel>
                <Flex align="stretch">
                  <Input
                    value={transaction}
                    onChange={(event) => handleTransactionChange(event.target.value)}
                    placeholder="0x… or Etherscan transaction URL"
                    aria-describedby="privacy-pools-input-help"
                    h="52px"
                    border="2px solid"
                    borderColor="bauhaus.black"
                    borderRadius={0}
                    fontFamily="mono"
                    fontSize={{ base: "sm", md: "md" }}
                    _focusVisible={{ boxShadow: "0 0 0 3px #1040C0", zIndex: 1 }}
                  />
                  <Select
                    value={network}
                    onChange={(event) => setNetwork(event.target.value as PrivacyPoolsExplorerNetwork)}
                    aria-label="Network"
                    w={{ base: "126px", md: "168px" }}
                    h="52px"
                    ml="-2px"
                    border="2px solid"
                    borderColor="bauhaus.black"
                    borderRadius={0}
                    bg="bauhaus.yellow"
                    fontWeight="800"
                    _focusVisible={{ boxShadow: "0 0 0 3px #1040C0", zIndex: 2 }}
                  >
                    <option value="mainnet">Mainnet</option>
                    <option value="sepolia">Sepolia</option>
                  </Select>
                </Flex>
                <Text id="privacy-pools-input-help" fontSize="xs" color="gray.500" mt={2}>
                  Etherscan links select their network and start checking automatically. Raw hashes use the selected network.
                </Text>
              </FormControl>

              <Flex mt={5} justify="flex-end" gap={3} wrap="wrap">
                {result && (
                  <Button
                    variant="outline"
                    leftIcon={<RefreshCw size={17} />}
                    onClick={() => void verify()}
                    isDisabled={loading}
                    minH="44px"
                  >
                    Refresh
                  </Button>
                )}
                <Button
                  variant="secondary"
                  leftIcon={loading ? <Spinner size="sm" /> : <Search size={17} />}
                  onClick={() => void verify()}
                  isDisabled={!validTransactionInput(transaction) || loading}
                  minH="44px"
                >
                  {loading ? "Checking" : "Check deposit"}
                </Button>
              </Flex>
            </Box>
          </Box>

          {error && (
            <Alert status="error" border="2px solid" borderColor="bauhaus.black" borderRadius={0} bg="red.50">
              <AlertIcon />
              <AlertDescription fontWeight="700">{error}</AlertDescription>
            </Alert>
          )}

          {result && <VerificationResult result={result} now={now} />}
        </VStack>
      </Container>
    </Box>
  );
}
