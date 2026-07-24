"use client";

import {
  Box,
  Button,
  Container,
  Grid,
  HStack,
  Image,
  SimpleGrid,
  Text,
  useClipboard,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
} from "lucide-react";
import { BuyModal, type BuyToken } from "../coins/components/BuyModal";
import {
  DEXSCREENER_URL,
  GECKOTERMINAL_EMBED_URL,
  GECKOTERMINAL_URL,
  TOKEN_ADDRESS,
} from "../constants";
import { useTokenData } from "../contexts/TokenDataContext";
import { useVaultData } from "../contexts/VaultDataContext";
import { hairline, palette } from "./design";

const WCHAN_TOKEN: BuyToken = {
  address: TOKEN_ADDRESS,
  name: "WalletChan",
  symbol: "WCHAN",
  imageUrl: "/images/walletchan-icon-nobg.png",
};

const TOKEN_VANITY_PREFIX = "0xBa5ED0000";

export function WchanSection() {
  const { tokenData, isLoading } = useTokenData();
  const { vaultData } = useVaultData();
  const { hasCopied, onCopy } = useClipboard(TOKEN_ADDRESS);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const change = tokenData?.change1d;
  const apy = vaultData?.totalApy ?? 0;
  const apyLabel = Number.isInteger(apy) ? apy.toFixed(0) : apy.toFixed(1);

  return (
    <Box
      as="section"
      id="wchan"
      position="relative"
      py={{ base: 16, md: 24 }}
      borderTop="1px solid rgba(255,255,255,0.08)"
      scrollMarginTop="96px"
      overflow="hidden"
    >
      <Box
        position="absolute"
        inset={0}
        pointerEvents="none"
        background="radial-gradient(circle at 14% 22%, rgba(245,158,11,0.12), transparent 32%)"
      />
      <Container maxW="7xl" position="relative">
        <Grid
          templateColumns={{ base: "1fr", lg: "0.72fr 1.28fr" }}
          gap={{ base: 10, lg: 8 }}
          alignItems="stretch"
        >
          <VStack
            align="stretch"
            justify={{ base: "flex-start", lg: "center" }}
            spacing={0}
            w="full"
            maxW={{ lg: "640px" }}
          >
            <HStack spacing={3}>
              <Image
                src="/images/walletchan-icon-nobg.png"
                alt=""
                boxSize={{ base: "48px", md: "56px" }}
                borderRadius="12px"
                bg={palette.white}
                p={1}
              />
              <Box>
                <Text
                  as="h2"
                  color={palette.white}
                  fontFamily="'Anton', sans-serif"
                  fontSize={{ base: "38px", md: "48px" }}
                  fontWeight="400"
                  lineHeight="1"
                >
                  $WCHAN
                </Text>
                <Text color={palette.yellow} fontSize="12px" fontWeight="700">
                  WALLETCHAN ON BASE
                </Text>
              </Box>
            </HStack>

            <Text
              color={palette.white}
              fontSize={{ base: "32px", md: "40px", lg: "34px", xl: "38px" }}
              fontWeight="700"
              letterSpacing="-0.03em"
              lineHeight="1.04"
              mt={{ base: 5, md: 7 }}
              whiteSpace={{ base: "normal", lg: "nowrap" }}
            >
              The token behind the wallet.
            </Text>
            <Box
              as="button"
              type="button"
              onClick={onCopy}
              textAlign="left"
              mt={{ base: 5, md: 6 }}
              p={4}
              borderRadius="12px"
              bg={palette.ink2}
              border="1px solid rgba(255,255,255,0.10)"
              transition="border-color 180ms ease, background 180ms ease"
              _hover={{
                bg: palette.ink,
                borderColor: "rgba(245,158,11,0.38)",
              }}
              _focusVisible={{
                boxShadow: `0 0 0 3px ${palette.blue}`,
              }}
            >
              <HStack justify="space-between" spacing={4}>
                <Box minW={0}>
                  <Text
                    color={palette.faint}
                    fontSize="11px"
                    fontWeight="700"
                    mb={1}
                  >
                    TOKEN CONTRACT
                  </Text>
                  <Text
                    color={palette.white}
                    fontFamily="mono"
                    fontSize={{ base: "12px", md: "13px" }}
                    noOfLines={1}
                  >
                    <Text
                      as="span"
                      color={palette.yellow}
                      fontWeight="700"
                    >
                      {TOKEN_VANITY_PREFIX}
                    </Text>
                    {TOKEN_ADDRESS.slice(TOKEN_VANITY_PREFIX.length)}
                  </Text>
                </Box>
                <Box color={hasCopied ? palette.green : palette.muted}>
                  {hasCopied ? <Check size={18} /> : <Copy size={18} />}
                </Box>
              </HStack>
            </Box>

            <HStack mt={4} spacing={3} flexWrap="wrap">
              <Button
                onClick={onOpen}
                h="46px"
                px={5}
                bg={palette.yellow}
                color={palette.ink}
                borderRadius="9px"
                fontWeight="700"
                _hover={{ bg: palette.amberSoft, transform: "translateY(-1px)" }}
                _active={{ transform: "scale(0.98)" }}
              >
                Buy WCHAN
              </Button>
              <Button
                as="a"
                href="/stake"
                h="46px"
                px={5}
                bg={palette.ink3}
                color={palette.white}
                borderRadius="9px"
                border="1px solid rgba(255,255,255,0.12)"
                fontWeight="600"
                _hover={{ bg: "rgba(255,255,255,0.12)" }}
                aria-label={`Stake WCHAN — ${apyLabel}% APY`}
              >
                <HStack as="span" spacing={2}>
                  <Text as="span">Stake</Text>
                  <Box
                    as="span"
                    px={2}
                    py={0.5}
                    borderRadius="999px"
                    bg={palette.yellow}
                    color={palette.ink}
                    fontSize="11px"
                    fontWeight="700"
                    lineHeight="1.2"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {apyLabel}%
                  </Box>
                </HStack>
              </Button>
            </HStack>
          </VStack>

          <Box
            {...hairline}
            borderRadius="16px"
            bg={palette.ink2}
            overflow="hidden"
          >
            <SimpleGrid columns={3}>
              <MarketStat
                label="Price"
                value={isLoading ? "Loading…" : tokenData?.price || "—"}
              />
              <MarketStat
                label="Market cap"
                value={isLoading ? "Loading…" : tokenData?.marketCap || "—"}
              />
              <MarketStat
                label="24h change"
                value={
                  change === undefined
                    ? "—"
                    : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`
                }
                tone={
                  change === undefined
                    ? palette.white
                    : change >= 0
                      ? palette.green
                      : palette.red
                }
              />
            </SimpleGrid>

            <Box
              borderTop="1px solid rgba(255,255,255,0.10)"
              borderBottom="1px solid rgba(255,255,255,0.10)"
              bg={palette.ink}
            >
              <Box
                as="iframe"
                title="WCHAN market chart"
                src={GECKOTERMINAL_EMBED_URL}
                w="full"
                h={{ base: "390px", md: "520px" }}
                border="0"
                display="block"
                allow="clipboard-write"
                allowFullScreen
              />
            </Box>

            <HStack
              px={{ base: 4, md: 5 }}
              py={4}
              justify="space-between"
              flexWrap="wrap"
              gap={3}
            >
              <HStack color={palette.muted} spacing={2}>
                <BarChart3 size={16} />
                <Text fontSize="13px" fontWeight="600">
                  Live market data
                </Text>
              </HStack>
              <HStack spacing={4}>
                <MarketLink href={GECKOTERMINAL_URL}>
                  GeckoTerminal
                </MarketLink>
                <MarketLink href={DEXSCREENER_URL}>DexScreener</MarketLink>
              </HStack>
            </HStack>
          </Box>
        </Grid>
      </Container>

      <BuyModal
        token={WCHAN_TOKEN}
        isOpen={isOpen}
        onClose={onClose}
        showWallet
        appearance="midnight"
      />
    </Box>
  );
}

function MarketStat({
  label,
  value,
  tone = palette.white,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <VStack
      align="flex-start"
      spacing={1}
      px={{ base: 3, md: 5 }}
      py={4}
      borderRight="1px solid rgba(255,255,255,0.08)"
    >
      <Text color={palette.faint} fontSize="11px" fontWeight="700">
        {label.toUpperCase()}
      </Text>
      <Text
        color={tone}
        fontSize={{ base: "16px", md: "22px" }}
        fontWeight="700"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Text>
    </VStack>
  );
}

function MarketLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <HStack
      as="a"
      href={href}
      target="_blank"
      rel="noreferrer"
      color={palette.white}
      spacing={1.5}
      fontSize="13px"
      fontWeight="600"
      _hover={{ color: palette.yellow, textDecoration: "none" }}
      _focusVisible={{ boxShadow: `0 0 0 3px ${palette.blue}` }}
    >
      <Text>{children}</Text>
      <ExternalLink size={13} />
    </HStack>
  );
}
