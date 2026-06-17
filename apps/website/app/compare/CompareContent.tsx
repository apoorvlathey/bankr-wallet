"use client";

import {
  Box,
  Container,
  Text,
  HStack,
  VStack,
  Image,
  Button,
  Link,
  useDisclosure,
  Skeleton,
} from "@chakra-ui/react";
import { ExternalLink } from "lucide-react";
import { Navigation } from "../components/Navigation";
import { Footer } from "../components/Footer";
import { BuyModal, type BuyToken } from "../coins/components/BuyModal";
import { TOKEN_ADDRESS } from "../constants";
import { noTokenWallets } from "../data/compareTokens";
import { useSiteNav } from "../lib/useSiteNav";
import { useCompareData } from "./useCompareData";

const WCHAN_TOKEN: BuyToken = {
  address: TOKEN_ADDRESS,
  name: "WalletChan",
  symbol: "WCHAN",
  imageUrl: "/images/walletchan-icon-nobg.png",
};

function formatGap(gap: number): string {
  if (gap >= 1_000_000) return `$${(gap / 1_000_000).toFixed(2)}M`;
  if (gap >= 1_000) return `$${(gap / 1_000).toFixed(2)}K`;
  return `$${gap.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function CompareContent() {
  const { tokens, wchanMarketCap, wchanVolume24h } = useCompareData();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { href } = useSiteNav();

  const oursIndex = tokens.findIndex((t) => t.isOurs);
  const oursToken = oursIndex >= 0 ? tokens[oursIndex] : null;
  const aboveToken = oursIndex > 0 ? tokens[oursIndex - 1] : null;
  const belowToken =
    oursIndex >= 0 && oursIndex < tokens.length - 1
      ? tokens[oursIndex + 1]
      : null;

  return (
    <Box minH="100vh" display="flex" flexDirection="column">
      <Navigation />

      <Container maxW="5xl" pt={24} pb={16} px={4} flex={1}>
        <VStack spacing={8} align="stretch">
          {/* Header */}
          <Box textAlign="center">
            <Text
              fontSize={{ base: "3xl", md: "5xl" }}
              fontWeight="900"
              textTransform="uppercase"
              letterSpacing="tighter"
              lineHeight="0.9"
            >
              Wallet Tokens
              <br />
              Leaderboard
            </Text>
            <Text
              mt={3}
              fontSize="sm"
              fontWeight="700"
              color="gray.500"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              Market Cap Rankings
            </Text>
          </Box>

          {/* Table */}
          {tokens.length > 0 && (
            <Box
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="6px 6px 0px 0px #121212"
              overflow="hidden"
            >
              {/* Header row */}
              <HStack
                bg="bauhaus.black"
                color="white"
                px={{ base: 3, md: 5 }}
                py={3}
                spacing={0}
              >
                <Text
                  w="40px"
                  fontSize="xs"
                  fontWeight="900"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  #
                </Text>
                <Text
                  flex={1}
                  fontSize="xs"
                  fontWeight="900"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  Token
                </Text>
                <Text
                  w={{ base: "90px", md: "120px" }}
                  fontSize="xs"
                  fontWeight="900"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  textAlign="right"
                >
                  Market Cap
                </Text>
                <Text
                  w={{ base: "65px", md: "80px" }}
                  fontSize="xs"
                  fontWeight="900"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  textAlign="right"
                >
                  24h
                </Text>
                <Box
                  w={{ base: "0", md: "200px" }}
                  display={{ base: "none", md: "block" }}
                />
              </HStack>

              {/* Token rows */}
              {tokens.map((token, i) => {
                const isOurs = token.isOurs;
                const websiteHref =
                  isOurs && token.website ? href("/") : token.website;

                // Gap calculations for WCHAN row
                let gapAbove: {
                  amount: number;
                  pct: number;
                  name: string;
                } | null = null;
                let gapBelow: {
                  amount: number;
                  pct: number;
                  name: string;
                } | null = null;

                if (isOurs && oursToken) {
                  if (aboveToken && aboveToken.marketCapRaw > 0) {
                    const diff =
                      aboveToken.marketCapRaw - oursToken.marketCapRaw;
                    const pct = (diff / oursToken.marketCapRaw) * 100;
                    gapAbove = { amount: diff, pct, name: aboveToken.symbol };
                  }
                  if (belowToken && belowToken.marketCapRaw > 0) {
                    const diff =
                      oursToken.marketCapRaw - belowToken.marketCapRaw;
                    const pct = (diff / belowToken.marketCapRaw) * 100;
                    gapBelow = { amount: diff, pct, name: belowToken.symbol };
                  }
                }

                return (
                  <Box key={`${token.network}-${token.poolAddress}`}>
                    {/* Gap up arrow — above WCHAN row */}
                    {isOurs && gapAbove && (
                      <Box
                        bg="blue.50"
                        borderLeft="4px solid"
                        borderLeftColor="bauhaus.blue"
                        px={{ base: 3, md: 5 }}
                        py={2}
                        borderBottom="1px dashed"
                        borderBottomColor="blue.200"
                      >
                        <HStack spacing={2} fontSize="xs" fontWeight="700">
                          <Text color="bauhaus.green">&#9650;</Text>
                          <Text color="gray.600">
                            {formatGap(gapAbove.amount)} (
                            {(gapAbove.pct / 100).toFixed(2)}x) to{" "}
                            <Text
                              as="span"
                              fontWeight="900"
                              color="bauhaus.black"
                            >
                              {gapAbove.name}
                            </Text>
                          </Text>
                        </HStack>
                      </Box>
                    )}

                    <HStack
                      px={{ base: 3, md: 5 }}
                      py={3}
                      spacing={0}
                      bg={
                        isOurs ? "blue.50" : i % 2 === 0 ? "white" : "gray.50"
                      }
                      borderLeft={
                        isOurs ? "4px solid" : "4px solid transparent"
                      }
                      borderLeftColor={isOurs ? "bauhaus.blue" : "transparent"}
                      transition="background 0.15s"
                      _hover={{ bg: isOurs ? "blue.100" : "gray.100" }}
                    >
                      {/* Rank */}
                      <Text
                        w="40px"
                        fontSize="sm"
                        fontWeight="900"
                        color={isOurs ? "bauhaus.blue" : "gray.500"}
                      >
                        {i + 1}
                      </Text>

                      {/* Token info */}
                      <HStack flex={1} spacing={3} minW={0}>
                        <Image
                          src={token.logo}
                          alt={token.name}
                          w="32px"
                          h="32px"
                          borderRadius={0}
                          border="2px solid"
                          borderColor={
                            isOurs ? "bauhaus.blue" : "bauhaus.black"
                          }
                          objectFit="cover"
                          flexShrink={0}
                        />
                        <VStack align="flex-start" spacing={0} minW={0}>
                          <HStack spacing={2}>
                            <Text
                              fontSize="sm"
                              fontWeight="900"
                              textTransform="uppercase"
                              letterSpacing="wide"
                              color={isOurs ? "bauhaus.blue" : "bauhaus.black"}
                              isTruncated
                            >
                              {token.name}
                            </Text>
                            {websiteHref && (
                              <Link
                                href={websiteHref}
                                isExternal={websiteHref.startsWith("http")}
                                display={{ base: "none", sm: "flex" }}
                                alignItems="center"
                                color="gray.400"
                                _hover={{ color: "bauhaus.blue" }}
                              >
                                <ExternalLink size={12} />
                              </Link>
                            )}
                          </HStack>
                          <Text fontSize="xs" fontWeight="700" color="gray.500">
                            ${token.symbol}
                          </Text>
                        </VStack>
                      </HStack>

                      {/* Market Cap */}
                      <Box w={{ base: "90px", md: "120px" }} textAlign="right">
                        {token.marketCap ? (
                          <Text fontSize="sm" fontWeight="800">
                            {token.marketCap}
                          </Text>
                        ) : (
                          <Skeleton h="16px" w="80px" ml="auto" borderRadius={0} />
                        )}
                      </Box>

                      {/* 24h Change */}
                      <Box w={{ base: "65px", md: "80px" }} textAlign="right">
                        {token.change24h !== null ? (
                          <Text
                            fontSize="sm"
                            fontWeight="800"
                            color={
                              token.change24h >= 0
                                ? "bauhaus.green"
                                : "bauhaus.red"
                            }
                          >
                            {formatPercent(token.change24h)}
                          </Text>
                        ) : (
                          <Skeleton h="16px" w="50px" ml="auto" borderRadius={0} />
                        )}
                      </Box>

                      {/* Buy / Chart button (desktop) */}
                      <Box
                        w={{ base: "0", md: "200px" }}
                        display={{ base: "none", md: "flex" }}
                        justifyContent="flex-end"
                      >
                        {isOurs ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={onOpen}
                            fontSize="xs"
                            px={4}
                          >
                            Buy
                          </Button>
                        ) : (
                          <Link
                            href={`https://www.geckoterminal.com/${token.network}/pools/${token.poolAddress}`}
                            isExternal
                            fontSize="xs"
                            fontWeight="800"
                            textTransform="uppercase"
                            letterSpacing="wide"
                            color="gray.500"
                            _hover={{ color: "bauhaus.blue" }}
                          >
                            Chart{" "}
                            <ExternalLink
                              size={10}
                              style={{
                                display: "inline",
                                verticalAlign: "middle",
                              }}
                            />
                          </Link>
                        )}
                      </Box>
                    </HStack>

                    {/* Gap down arrow — below WCHAN row */}
                    {isOurs && gapBelow && (
                      <Box
                        bg="blue.50"
                        borderLeft="4px solid"
                        borderLeftColor="bauhaus.blue"
                        px={{ base: 3, md: 5 }}
                        py={2}
                        borderTop="1px dashed"
                        borderTopColor="blue.200"
                      >
                        <HStack spacing={2} fontSize="xs" fontWeight="700">
                          <Text color="gray.400">&#9660;</Text>
                          <Text color="gray.600">
                            {formatGap(gapBelow.amount)} (
                            {(gapBelow.pct / 100).toFixed(2)}x) ahead of{" "}
                            <Text
                              as="span"
                              fontWeight="900"
                              color="bauhaus.black"
                            >
                              {gapBelow.name}
                            </Text>
                          </Text>
                        </HStack>
                      </Box>
                    )}

                    {/* Mobile buy/chart button */}
                    <Box
                      display={{ base: "block", md: "none" }}
                      bg={
                        isOurs ? "blue.50" : i % 2 === 0 ? "white" : "gray.50"
                      }
                      borderLeft={
                        isOurs ? "4px solid" : "4px solid transparent"
                      }
                      borderLeftColor={isOurs ? "bauhaus.blue" : "transparent"}
                      px={3}
                      pb={3}
                    >
                      {isOurs ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={onOpen}
                          fontSize="xs"
                          w="full"
                        >
                          Buy WCHAN
                        </Button>
                      ) : (
                        <Link
                          href={`https://www.geckoterminal.com/${token.network}/pools/${token.poolAddress}`}
                          isExternal
                          fontSize="xs"
                          fontWeight="800"
                          textTransform="uppercase"
                          letterSpacing="wide"
                          color="gray.500"
                          _hover={{ color: "bauhaus.blue" }}
                        >
                          Chart{" "}
                          <ExternalLink
                            size={10}
                            style={{
                              display: "inline",
                              verticalAlign: "middle",
                            }}
                          />
                        </Link>
                      )}
                    </Box>
                  </Box>
                );
              })}

              {/* No-token wallets — inside same table */}
              {noTokenWallets.map((wallet, i) => {
                const rowIndex = tokens.length + i;
                return (
                  <HStack
                    key={wallet.name}
                    px={{ base: 3, md: 5 }}
                    py={3}
                    spacing={0}
                    bg={rowIndex % 2 === 0 ? "white" : "gray.50"}
                    borderLeft="4px solid transparent"
                    transition="background 0.15s"
                    _hover={{ bg: "gray.100" }}
                  >
                    {/* Skull instead of rank */}
                    <Text w="40px" fontSize="sm">
                      &#128128;
                    </Text>

                    {/* Wallet info */}
                    <HStack flex={1} spacing={3} minW={0}>
                      <Image
                        src={wallet.logo}
                        alt={wallet.name}
                        w="32px"
                        h="32px"
                        borderRadius={0}
                        border="2px solid"
                        borderColor="bauhaus.black"
                        objectFit="cover"
                        flexShrink={0}
                      />
                      <HStack spacing={2}>
                        <Text
                          fontSize="sm"
                          fontWeight="900"
                          textTransform="uppercase"
                          letterSpacing="wide"
                          color="gray.400"
                        >
                          {wallet.name}
                        </Text>
                        {wallet.website && (
                          <Link
                            href={wallet.website}
                            isExternal
                            display={{ base: "none", sm: "flex" }}
                            alignItems="center"
                            color="gray.400"
                            _hover={{ color: "bauhaus.blue" }}
                          >
                            <ExternalLink size={12} />
                          </Link>
                        )}
                      </HStack>
                    </HStack>

                    {/* Empty market cap */}
                    <Text
                      w={{ base: "90px", md: "120px" }}
                      fontSize="sm"
                      fontWeight="800"
                      textAlign="right"
                      color="gray.300"
                    >
                      —
                    </Text>

                    {/* Empty 24h */}
                    <Text
                      w={{ base: "65px", md: "80px" }}
                      fontSize="sm"
                      fontWeight="800"
                      textAlign="right"
                      color="gray.300"
                    >
                      —
                    </Text>

                    {/* Empty action column */}
                    <Box
                      w={{ base: "0", md: "200px" }}
                      display={{ base: "none", md: "block" }}
                    />
                  </HStack>
                );
              })}
            </Box>
          )}
          {/* FOMO Verification */}
          {wchanMarketCap > 0 &&
            (() => {
              const mcapPct = Math.min((wchanMarketCap / 3_000_000) * 100, 100);
              const volPct = Math.min((wchanVolume24h / 1_000_000) * 100, 100);
              const mcapDone = wchanMarketCap >= 3_000_000;
              const volDone = wchanVolume24h >= 1_000_000;
              return (
                <Box
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="6px 6px 0px 0px #121212"
                  overflow="hidden"
                >
                  {/* Header banner */}
                  <Box bg="bauhaus.black" px={{ base: 5, md: 8 }} py={4}>
                    <HStack spacing={3}>
                      <Image
                        src="https://fomo.family/apple-touch-icon.png"
                        alt="FOMO"
                        w={{ base: "32px", md: "40px" }}
                        h={{ base: "32px", md: "40px" }}
                        borderRadius={0}
                      />
                      <Text
                        fontSize={{ base: "xl", md: "2xl" }}
                        fontWeight="900"
                        textTransform="uppercase"
                        letterSpacing="tight"
                        color="white"
                      >
                        FOMO Verification ⌛
                      </Text>
                      <Link
                        href="https://fomo.family/verify-token"
                        isExternal
                        color="gray.400"
                        _hover={{ color: "white" }}
                      >
                        <ExternalLink size={14} />
                      </Link>
                    </HStack>
                  </Box>

                  <Box px={{ base: 5, md: 8 }} py={6}>
                    {/* Market Cap bar */}
                    <Box mb={6}>
                      <HStack justify="space-between" mb={2}>
                        <HStack spacing={2}>
                          <Text fontSize="lg">{mcapDone ? "✅" : "🔥"}</Text>
                          <Text
                            fontSize="sm"
                            fontWeight="900"
                            textTransform="uppercase"
                            letterSpacing="wider"
                          >
                            Market Cap
                          </Text>
                        </HStack>
                        <Text fontSize="sm" fontWeight="800">
                          {formatGap(wchanMarketCap)}{" "}
                          <Text as="span" color="gray.400">
                            / $3.00M
                          </Text>
                        </Text>
                      </HStack>
                      <Box
                        h="40px"
                        bg="gray.100"
                        border="3px solid"
                        borderColor="bauhaus.black"
                        position="relative"
                        overflow="hidden"
                      >
                        <Box
                          h="100%"
                          w={`${mcapPct}%`}
                          bgGradient={
                            mcapDone
                              ? "linear(to-r, green.400, green.300)"
                              : "linear(to-r, bauhaus.blue, #3060E0)"
                          }
                          transition="width 0.8s cubic-bezier(0.4,0,0.2,1)"
                          position="relative"
                          _after={
                            !mcapDone
                              ? {
                                  content: '""',
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  background:
                                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                                  animation: "shimmer 2s infinite",
                                }
                              : undefined
                          }
                        />
                        <Text
                          position="absolute"
                          top="50%"
                          left="50%"
                          transform="translate(-50%, -50%)"
                          fontSize="sm"
                          fontWeight="900"
                          color={mcapPct > 40 ? "white" : "bauhaus.black"}
                          textShadow={
                            mcapPct > 40 ? "0 1px 2px rgba(0,0,0,0.3)" : "none"
                          }
                        >
                          {mcapPct.toFixed(1)}%
                        </Text>
                      </Box>
                    </Box>

                    {/* Volume bar */}
                    <Box>
                      <HStack justify="space-between" mb={2}>
                        <HStack spacing={2}>
                          <Text fontSize="md">{volDone ? "✅" : "📊"}</Text>
                          <Text
                            fontSize="xs"
                            fontWeight="900"
                            textTransform="uppercase"
                            letterSpacing="wider"
                            color="gray.600"
                          >
                            24h Volume
                          </Text>
                        </HStack>
                        <Text fontSize="xs" fontWeight="800" color="gray.600">
                          {formatGap(wchanVolume24h)}{" "}
                          <Text as="span" color="gray.400">
                            / $1.00M
                          </Text>
                        </Text>
                      </HStack>
                      <Box
                        h="24px"
                        bg="gray.100"
                        border="2px solid"
                        borderColor="bauhaus.black"
                        position="relative"
                        overflow="hidden"
                      >
                        <Box
                          h="100%"
                          w={`${volPct}%`}
                          bgGradient={
                            volDone
                              ? "linear(to-r, green.400, green.300)"
                              : "linear(to-r, bauhaus.yellow, #F0D040)"
                          }
                          transition="width 0.8s cubic-bezier(0.4,0,0.2,1)"
                          position="relative"
                          _after={
                            !volDone
                              ? {
                                  content: '""',
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  background:
                                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)",
                                  animation: "shimmer 2s infinite",
                                }
                              : undefined
                          }
                        />
                        <Text
                          position="absolute"
                          top="50%"
                          left="50%"
                          transform="translate(-50%, -50%)"
                          fontSize="xs"
                          fontWeight="900"
                          color={volPct > 40 ? "white" : "bauhaus.black"}
                          textShadow={
                            volPct > 40 ? "0 1px 2px rgba(0,0,0,0.3)" : "none"
                          }
                        >
                          {volPct.toFixed(1)}%
                        </Text>
                      </Box>
                    </Box>
                  </Box>

                  {/* Shimmer keyframes */}
                  <style>{`
                @keyframes shimmer {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }
              `}</style>
                </Box>
              );
            })()}
        </VStack>
      </Container>

      <Footer />

      <BuyModal
        token={WCHAN_TOKEN}
        isOpen={isOpen}
        onClose={onClose}
        showWallet
      />
    </Box>
  );
}
