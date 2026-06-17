"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
  Link,
  useToast,
} from "@chakra-ui/react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ExternalLink, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { formatUnits } from "viem";
import { Navigation } from "../components/Navigation";
import { TG_BOT_API_URL, WCHAN_VAULT_INDEXER_API_URL } from "../constants";
import { useSiteNav } from "../lib/useSiteNav";

const MotionBox = motion(Box);

interface VerifyInfo {
  valid: boolean;
  threshold: string;
  thresholdFormatted: string;
  error?: string;
}

function VerifyContent() {
  const toast = useToast();
  const { href } = useSiteNav();
  const stakeHref = href("/stake");
  const stakeIsExternal = stakeHref.startsWith("http");
  const headingRef = useRef(null);
  const isHeadingInView = useInView(headingRef, { once: true });

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState<VerifyInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Read token from URL on mount (avoids useSearchParams + Suspense)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
    setTokenChecked(true);
  }, []);

  // Fetch verify info once token is known
  useEffect(() => {
    if (!tokenChecked) return;
    if (!token) {
      setIsLoadingInfo(false);
      return;
    }

    fetch(`${TG_BOT_API_URL}/api/verify-info?token=${token}`)
      .then((res) => res.json())
      .then((data) => setVerifyInfo(data))
      .catch(() => setVerifyInfo({ valid: false, threshold: "0", thresholdFormatted: "0", error: "Failed to connect to verification server" }))
      .finally(() => setIsLoadingInfo(false));
  }, [token, tokenChecked]);

  // Fetch balance when wallet connects
  const fetchBalance = useCallback(async () => {
    if (!address) return;
    setIsLoadingBalance(true);
    try {
      const res = await fetch(
        `${WCHAN_VAULT_INDEXER_API_URL}/balances/${address.toLowerCase()}`
      );
      if (res.ok) {
        const data = await res.json();
        setBalance(BigInt(data.shares));
      } else {
        setBalance(0n);
      }
    } catch {
      setBalance(0n);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      fetchBalance();
    }
  }, [isConnected, address, fetchBalance]);

  const threshold = verifyInfo ? BigInt(verifyInfo.threshold) : 0n;
  const hasEnoughStake = balance !== null && balance >= threshold;

  const handleVerify = async () => {
    if (!token || !address) return;

    setIsSigning(true);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `Verify Telegram account for WalletChan\nToken: ${token}\nTimestamp: ${timestamp}`;

      const signature = await signMessageAsync({ message });

      const res = await fetch(`${TG_BOT_API_URL}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signature, address, timestamp }),
      });

      const data = await res.json();

      if (data.success) {
        setIsVerified(true);
        setInviteLink(data.inviteLink);
        toast({
          title: "Verification successful!",
          description: "Check your Telegram DMs for the invite link.",
          status: "success",
          duration: 10000,
          isClosable: true,
          position: "bottom-right",
        });
      } else {
        toast({
          title: "Verification failed",
          description: data.error || "Unknown error",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom-right",
        });
      }
    } catch (err: any) {
      toast({
        title: "Verification failed",
        description: err?.message?.split("\n")[0] || "Failed to sign message",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-right",
      });
    } finally {
      setIsSigning(false);
    }
  };

  const formatBalance = (raw: bigint): string => {
    const formatted = formatUnits(raw, 18);
    const num = parseFloat(formatted);
    if (num === 0) return "0";
    if (num < 0.01) return "<0.01";
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // No token in URL
  if (!token) {
    return (
      <Container maxW="lg" pt={10} pb={40}>
        <Box
          bg="white"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          p={8}
          textAlign="center"
        >
          <AlertTriangle size={48} style={{ margin: "0 auto 16px" }} />
          <Text fontSize="lg" fontWeight="900" textTransform="uppercase">
            Missing Token
          </Text>
          <Text fontSize="sm" color="gray.600" mt={2}>
            Please use the /verify command in the Telegram bot to get a
            verification link.
          </Text>
          <Link
            href="https://t.me/WalletChanBot?start=verify"
            isExternal
            display="inline-flex"
            alignItems="center"
            gap={1}
            mt={4}
            bg="bauhaus.blue"
            color="white"
            px={6}
            py={3}
            fontWeight="900"
            textTransform="uppercase"
            letterSpacing="wider"
            _hover={{ opacity: 0.9, textDecoration: "none" }}
          >
            Open Bot
            <ExternalLink size={14} />
          </Link>
        </Box>
      </Container>
    );
  }

  // Loading
  if (isLoadingInfo) {
    return (
      <Container maxW="lg" pt={10} pb={40}>
        <VStack spacing={4}>
          <Spinner size="xl" color="bauhaus.blue" thickness="4px" />
          <Text fontWeight="700" textTransform="uppercase" letterSpacing="wider">
            Loading...
          </Text>
        </VStack>
      </Container>
    );
  }

  // Invalid token
  if (!verifyInfo?.valid) {
    return (
      <Container maxW="lg" pt={10} pb={40}>
        <Box
          bg="white"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          p={8}
          textAlign="center"
        >
          <AlertTriangle size={48} style={{ margin: "0 auto 16px", color: "#D02020" }} />
          <Text fontSize="lg" fontWeight="900" textTransform="uppercase" color="bauhaus.red">
            Invalid or Expired Token
          </Text>
          <Text fontSize="sm" color="gray.600" mt={2}>
            This verification link has expired or has already been used.
            Use /verify in the Telegram bot to get a new link.
          </Text>
          <Link
            href="https://t.me/WalletChanBot?start=verify"
            isExternal
            display="inline-flex"
            alignItems="center"
            gap={1}
            mt={4}
            bg="bauhaus.blue"
            color="white"
            px={6}
            py={3}
            fontWeight="900"
            textTransform="uppercase"
            letterSpacing="wider"
            _hover={{ opacity: 0.9, textDecoration: "none" }}
          >
            Get New Link
            <ExternalLink size={14} />
          </Link>
        </Box>
      </Container>
    );
  }

  // Verified successfully
  if (isVerified) {
    return (
      <Container maxW="lg" pt={10} pb={40}>
        <Box
          bg="white"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          p={8}
          textAlign="center"
        >
          <CheckCircle size={48} style={{ margin: "0 auto 16px", color: "#16a34a" }} />
          <Text fontSize="xl" fontWeight="900" textTransform="uppercase" color="green.600">
            Verified!
          </Text>
          <Text fontSize="sm" color="gray.600" mt={2}>
            Check your Telegram DMs for the invite link to the private group.
          </Text>
          {inviteLink && (
            <Link
              href={inviteLink}
              isExternal
              display="inline-flex"
              alignItems="center"
              gap={1}
              mt={4}
              bg="bauhaus.blue"
              color="white"
              px={6}
              py={3}
              fontWeight="900"
              textTransform="uppercase"
              letterSpacing="wider"
              _hover={{ opacity: 0.9, textDecoration: "none" }}
            >
              Join Group
              <ExternalLink size={14} />
            </Link>
          )}
        </Box>
      </Container>
    );
  }

  return (
    <Container maxW="lg" pt={10} pb={40}>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <VStack spacing={1} textAlign="center" ref={headingRef}>
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            animate={isHeadingInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <HStack spacing={3} justify="center">
              <Box
                w="16px"
                h="16px"
                bg="bauhaus.blue"
                border="3px solid"
                borderColor="bauhaus.black"
                borderRadius="full"
              />
              <Text
                fontSize={{ base: "2xl", md: "3xl" }}
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="wider"
              >
                Verify Wallet
              </Text>
              <Box
                w="16px"
                h="16px"
                bg="bauhaus.yellow"
                border="3px solid"
                borderColor="bauhaus.black"
                transform="rotate(45deg)"
              />
            </HStack>
          </MotionBox>
          <Text fontSize="md" color="gray.600" fontWeight="500">
            Link your wallet to access the private Telegram group.
          </Text>
        </VStack>

        {/* Card */}
        <Box
          bg="white"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          position="relative"
          overflow="hidden"
        >
          {/* Geometric decorators */}
          <Box
            position="absolute"
            top={-6}
            right={-6}
            w={16}
            h={16}
            bg="bauhaus.yellow"
            opacity={0.15}
            borderRadius="full"
          />
          <Box
            position="absolute"
            bottom={-4}
            left={-4}
            w={12}
            h={12}
            bg="bauhaus.red"
            opacity={0.1}
            transform="rotate(45deg)"
          />

          <VStack spacing={5} p={6} position="relative" zIndex={1}>
            {/* Step 1: Connect Wallet */}
            <VStack spacing={3} w="full">
              <HStack w="full" spacing={3}>
                <Box
                  w="28px"
                  h="28px"
                  bg={isConnected ? "green.500" : "bauhaus.blue"}
                  border="3px solid"
                  borderColor="bauhaus.black"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="xs" fontWeight="900" color="white">
                    1
                  </Text>
                </Box>
                <Text
                  fontSize="sm"
                  fontWeight="800"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  Connect Wallet
                </Text>
                {isConnected && <CheckCircle size={16} color="#16a34a" />}
              </HStack>

              {!isConnected && (
                <Box
                  w="full"
                  sx={{
                    "& button": {
                      w: "full",
                      borderRadius: "0 !important",
                      fontWeight: "bold !important",
                      textTransform: "uppercase",
                      fontFamily: "'Outfit', sans-serif !important",
                      h: "52px",
                      fontSize: "md !important",
                    },
                  }}
                >
                  <ConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <Button
                        w="full"
                        variant="primary"
                        size="lg"
                        h="52px"
                        onClick={openConnectModal}
                      >
                        Connect Wallet
                      </Button>
                    )}
                  </ConnectButton.Custom>
                </Box>
              )}

              {isConnected && (
                <Box
                  w="full"
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
              )}
            </VStack>

            {/* Divider */}
            <Box w="full" h="3px" bg="gray.100" />

            {/* Step 2: Check Balance */}
            <VStack spacing={3} w="full">
              <HStack w="full" spacing={3}>
                <Box
                  w="28px"
                  h="28px"
                  bg={
                    hasEnoughStake
                      ? "green.500"
                      : isConnected
                      ? "bauhaus.blue"
                      : "gray.300"
                  }
                  border="3px solid"
                  borderColor="bauhaus.black"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="xs" fontWeight="900" color="white">
                    2
                  </Text>
                </Box>
                <Text
                  fontSize="sm"
                  fontWeight="800"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color={isConnected ? "bauhaus.black" : "gray.400"}
                >
                  Check Staked Balance
                </Text>
                {hasEnoughStake && <CheckCircle size={16} color="#16a34a" />}
              </HStack>

              {isConnected && (
                <>
                  {isLoadingBalance ? (
                    <HStack spacing={2}>
                      <Spinner size="sm" color="bauhaus.blue" />
                      <Text fontSize="sm" fontWeight="700" color="gray.500">
                        Fetching balance...
                      </Text>
                    </HStack>
                  ) : balance !== null ? (
                    <VStack spacing={2} w="full">
                      <HStack
                        w="full"
                        justify="space-between"
                        bg={hasEnoughStake ? "green.50" : "red.50"}
                        border="2px solid"
                        borderColor={hasEnoughStake ? "green.200" : "red.200"}
                        px={4}
                        py={3}
                      >
                        <Text fontSize="xs" fontWeight="700" color="gray.500" textTransform="uppercase" letterSpacing="wider">
                          Your Stake
                        </Text>
                        <Text fontSize="sm" fontWeight="900" color={hasEnoughStake ? "green.600" : "red.500"}>
                          {formatBalance(balance)} sWCHAN
                        </Text>
                      </HStack>
                      <HStack
                        w="full"
                        justify="space-between"
                        bg="gray.50"
                        border="2px solid"
                        borderColor="gray.200"
                        px={4}
                        py={3}
                      >
                        <Text fontSize="xs" fontWeight="700" color="gray.500" textTransform="uppercase" letterSpacing="wider">
                          Required
                        </Text>
                        <Text fontSize="sm" fontWeight="900">
                          {verifyInfo?.thresholdFormatted} sWCHAN
                        </Text>
                      </HStack>

	                      {!hasEnoughStake && (
	                        <HStack spacing={2} w="full">
	                          <Link
	                            href={stakeHref}
	                            isExternal={stakeIsExternal}
	                            flex={1}
	                          >
                            <Button
                              w="full"
                              variant="secondary"
                              size="sm"
                              h="40px"
                              rightIcon={<ExternalLink size={12} />}
                            >
                              Stake WCHAN
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            h="40px"
                            borderRadius={0}
                            border="2px solid"
                            borderColor="bauhaus.black"
                            fontWeight="800"
                            textTransform="uppercase"
                            letterSpacing="wider"
                            onClick={fetchBalance}
                            leftIcon={<RefreshCw size={12} />}
                          >
                            Refresh
                          </Button>
                        </HStack>
                      )}
                    </VStack>
                  ) : null}
                </>
              )}
            </VStack>

            {/* Divider */}
            <Box w="full" h="3px" bg="gray.100" />

            {/* Step 3: Sign & Verify */}
            <VStack spacing={3} w="full">
              <HStack w="full" spacing={3}>
                <Box
                  w="28px"
                  h="28px"
                  bg={hasEnoughStake ? "bauhaus.blue" : "gray.300"}
                  border="3px solid"
                  borderColor="bauhaus.black"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="xs" fontWeight="900" color="white">
                    3
                  </Text>
                </Box>
                <Text
                  fontSize="sm"
                  fontWeight="800"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color={hasEnoughStake ? "bauhaus.black" : "gray.400"}
                >
                  Verify & Get Invite
                </Text>
              </HStack>

              <Button
                w="full"
                variant="secondary"
                size="lg"
                h="52px"
                isDisabled={!hasEnoughStake || isSigning}
                isLoading={isSigning}
                loadingText="Signing..."
                onClick={handleVerify}
              >
                Verify & Get Invite Link
              </Button>
            </VStack>
          </VStack>
        </Box>
      </VStack>
    </Container>
  );
}

export default function VerifyPageContent() {
  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />
      <VerifyContent />
    </Box>
  );
}
