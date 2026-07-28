"use client";

import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  HStack,
  Image,
  Link,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ChevronRight,
  CopyCheck,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Github,
  KeyRound,
  LockKeyhole,
  Shuffle,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import {
  BUY_LINK,
  CHROME_STORE_URL,
  FIREFOX_STORE_URL,
  GITHUB_URL,
  TWITTER_URL,
} from "../constants";
import { FeatureCard, SectionHeading } from "./SectionPrimitives";
import { hairline, palette } from "./design";

const chains = [
  { name: "Ethereum", icon: "/images/ethereum.svg" },
  { name: "Base", icon: "/images/base.svg" },
  { name: "Arbitrum", icon: "/images/arbitrum.svg" },
  { name: "Optimism", icon: "/images/optimism.svg" },
  { name: "Polygon", icon: "/images/polygon.svg" },
  { name: "Unichain", icon: "/images/unichain.svg" },
  { name: "MegaETH", icon: "/images/megaeth.svg" },
  { name: "BNB", icon: "/images/bsc.svg" },
];

export function AccountChainSection() {
  return (
    <Box as="section" py={{ base: 18, md: 26 }} bg="rgba(255,255,255,0.025)">
      <Container maxW="7xl">
        <SectionHeading
          kicker="Bring your wallet"
          title="Keys, seed phrases, Bankr, and watch-only accounts."
        >
          Use WalletChan like a normal self-custody wallet, connect an optional
          Bankr account, or inspect addresses without signing from them.
        </SectionHeading>
        <Grid templateColumns={{ base: "1fr", lg: "0.9fr 1.1fr" }} gap={6}>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
            <FeatureCard
              accent={palette.yellow}
              icon={<KeyRound size={24} />}
              title="Private keys"
              text="Local signing and encrypted vault storage for accounts you already control."
            />
            <FeatureCard
              accent={palette.green}
              icon={<GitBranch size={24} />}
              title="Seed phrases"
              text="HD wallet derivation with multiple accounts from one encrypted seed group."
            />
            <FeatureCard
              accent={palette.cyan}
              icon={<Sparkles size={24} />}
              title="Bankr accounts"
              text="Optional API-backed execution for users who want Bankr inside dapps."
            />
            <FeatureCard
              accent={palette.violet}
              icon={<Eye size={24} />}
              title="Watch-only"
              text="Inspect portfolios and dapps without giving the account signing power."
            />
          </SimpleGrid>
          <Box
            {...hairline}
            borderRadius="32px"
            p={{ base: 5, md: 7 }}
            bg="rgba(255,255,255,0.035)"
          >
            <Text
              color={palette.white}
              fontSize="28px"
              fontWeight="900"
              letterSpacing="0"
              mb={5}
            >
              Built-in EVM homes, custom chains when you need them.
            </Text>
            <SimpleGrid columns={{ base: 2, sm: 4 }} spacing={3}>
              {chains.map((chain) => (
                <HStack
                  key={chain.name}
                  p={3}
                  borderRadius="18px"
                  bg="rgba(255,255,255,0.055)"
                  border="1px solid rgba(255,255,255,0.1)"
                >
                  <Image src={chain.icon} alt={chain.name} w="24px" h="24px" />
                  <Text
                    color={palette.white}
                    fontSize="13px"
                    fontWeight="900"
                    noOfLines={1}
                  >
                    {chain.name}
                  </Text>
                </HStack>
              ))}
            </SimpleGrid>
            <Text color={palette.muted} mt={5} lineHeight="1.7">
              Swap, batching, Bankr execution, Flashblocks detection, and gas
              behavior vary by account type and chain. The wallet surfaces the
              best available path per request.
            </Text>
          </Box>
        </Grid>
      </Container>
    </Box>
  );
}

export function TrustSection() {
  return (
    <Box
      as="section"
      id="trust"
      py={{ base: 18, md: 26 }}
      bg="rgba(255,255,255,0.025)"
    >
      <Container maxW="7xl">
        <SectionHeading
          kicker="Open source, private by design"
          title="Trust should be inspectable."
        >
          WalletChan is fully open source and built with privacy in mind. The
          wallet experience is designed around self-custody, local secret
          storage, and no user tracking.
        </SectionHeading>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={5}>
          <FeatureCard
            accent={palette.yellow}
            icon={<Github size={24} />}
            title="Fully open source"
            text="The extension and website live in public code, so power users can inspect how the wallet behaves."
          />
          <FeatureCard
            accent={palette.green}
            icon={<EyeOff size={24} />}
            title="No user tracking"
            text="Privacy is part of the product stance: WalletChan does not track users through the wallet."
          />
          <FeatureCard
            accent={palette.cyan}
            icon={<LockKeyhole size={24} />}
            title="Self-custody first"
            text="Private keys and seed phrases are encrypted locally; Bankr support is optional, not the only path."
          />
        </SimpleGrid>
      </Container>
    </Box>
  );
}

export function TokenSection() {
  return (
    <Box as="section" id="token" py={{ base: 20, md: 28 }}>
      <Container maxW="7xl">
        <Grid
          templateColumns={{ base: "1fr", lg: "1fr 0.9fr" }}
          gap={6}
          alignItems="stretch"
        >
          <VStack
            align="flex-start"
            justify="center"
            spacing={5}
            p={{ base: 6, md: 9 }}
            borderRadius="36px"
            bg="linear-gradient(135deg, rgba(245,197,66,0.18), rgba(177,140,255,0.1))"
            border="1px solid rgba(245,197,66,0.24)"
          >
            <Text
              color={palette.yellow}
              fontSize="13px"
              fontWeight="900"
              textTransform="uppercase"
              letterSpacing="0"
            >
              Powered by $WCHAN
            </Text>
            <Text
              color={palette.white}
              fontSize={{ base: "40px", md: "64px" }}
              fontWeight="900"
              letterSpacing="0"
              lineHeight="0.98"
            >
              The token sits inside the product loop.
            </Text>
            <Text
              color={palette.muted}
              fontSize={{ base: "16px", md: "19px" }}
              lineHeight="1.75"
            >
              Stake for premium fee tiers, use WCHAN-native routes, access
              community utilities, and keep the wallet ecosystem aligned with
              active users.
            </Text>
            <HStack flexWrap="wrap" spacing={3}>
              <Button
                as="a"
                href={BUY_LINK}
                target="_blank"
                h="50px"
                px={6}
                borderRadius="999px"
                bg={palette.yellow}
                color={palette.ink}
                fontWeight="900"
                textTransform="none"
                letterSpacing="0"
                rightIcon={<ExternalLink size={16} />}
                _hover={{ bg: palette.white }}
              >
                Buy WCHAN
              </Button>
              <Button
                as="a"
                href="/stake"
                h="50px"
                px={6}
                borderRadius="999px"
                bg="rgba(255,255,255,0.08)"
                color={palette.white}
                border="1px solid rgba(255,255,255,0.16)"
                fontWeight="900"
                textTransform="none"
                letterSpacing="0"
                _hover={{ bg: "rgba(255,255,255,0.14)" }}
              >
                Stake
              </Button>
            </HStack>
          </VStack>
          <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={5}>
            <FeatureCard
              accent={palette.yellow}
              icon={<Shuffle size={24} />}
              title="Custom WCHAN routes"
              text="ETH <-> WCHAN quotes compare custom Uniswap V4 routing against aggregators."
            />
            <FeatureCard
              accent={palette.green}
              icon={<Zap size={24} />}
              title="Premium fee tier"
              text="sWCHAN staking can reduce swap and bridge fees where the server-side tier applies."
            />
            <FeatureCard
              accent={palette.cyan}
              icon={<Wallet size={24} />}
              title="Sponsored transfers"
              text="Eligible stakers can access product perks like sponsored transfer support."
            />
            <FeatureCard
              accent={palette.violet}
              icon={<CopyCheck size={24} />}
              title="Community identity"
              text="Token pages, comparison views, staking, OS links, and wallet UX reinforce the ecosystem."
            />
          </SimpleGrid>
        </Grid>
      </Container>
    </Box>
  );
}

export function FinalCta() {
  return (
    <>
      <Box
        as="section"
        id="open-source"
        minH={{ md: "560px" }}
        py={{ base: 24, md: 32 }}
        borderTop="1px solid rgba(255,255,255,0.12)"
        scrollMarginTop="96px"
        display="flex"
        alignItems="center"
      >
        <Container maxW="5xl">
          <VStack spacing={0} textAlign="center">
            <Image
              src="/images/walletchan-icon-nobg.png"
              alt="WalletChan mascot"
              boxSize={{ base: "88px", md: "120px" }}
              objectFit="contain"
              mb={{ base: 5, md: 7 }}
            />
            <Text
              color={palette.white}
              fontSize={{ base: "40px", md: "68px" }}
              fontWeight="700"
              letterSpacing="0"
              lineHeight="1.02"
            >
              Install and get started now!
            </Text>
            <HStack mt={8} spacing={3} justify="center" flexWrap="wrap">
              <Button
                as="a"
                href={CHROME_STORE_URL}
                target="_blank"
                h="50px"
                px={7}
                borderRadius="10px"
                bg={palette.yellow}
                color={palette.ink}
                textTransform="none"
                letterSpacing="0"
                fontWeight="700"
                leftIcon={
                  <Image
                    src="/images/browsers/chrome.svg"
                    alt=""
                    boxSize="22px"
                  />
                }
                rightIcon={<ChevronRight size={18} />}
                _hover={{ bg: palette.amberSoft }}
              >
                Add to Chrome
              </Button>
              <Button
                as="a"
                href={FIREFOX_STORE_URL}
                target="_blank"
                h="50px"
                px={7}
                borderRadius="10px"
                bg={palette.ink2}
                color={palette.white}
                border="1px solid rgba(255,255,255,0.12)"
                textTransform="none"
                letterSpacing="0"
                fontWeight="600"
                leftIcon={
                  <Image
                    src="/images/browsers/firefox.svg"
                    alt=""
                    boxSize="22px"
                  />
                }
                _hover={{ bg: palette.ink3 }}
              >
                Add to Firefox
              </Button>
              <Button
                as="a"
                href={GITHUB_URL}
                target="_blank"
                h="50px"
                px={7}
                borderRadius="10px"
                bg="transparent"
                color={palette.white}
                border="1px solid rgba(255,255,255,0.12)"
                textTransform="none"
                letterSpacing="0"
                fontWeight="600"
                leftIcon={<Github size={22} />}
                _hover={{ bg: palette.ink2 }}
              >
                View GitHub
              </Button>
            </HStack>
          </VStack>
        </Container>
      </Box>
      <Box
        as="footer"
        py={6}
        borderTop="1px solid rgba(255,255,255,0.12)"
      >
        <Container maxW="7xl">
          <Flex
            direction={{ base: "column", sm: "row" }}
            align="center"
            justify="space-between"
            gap={4}
          >
            <Text color={palette.muted} fontSize="13px">
              © {new Date().getFullYear()} WalletChan
            </Text>
            <HStack spacing={5}>
              <Link
                href={TWITTER_URL}
                target="_blank"
                rel="noreferrer"
                display="inline-flex"
                alignItems="center"
                gap={2}
                color={palette.muted}
                fontSize="14px"
                fontWeight="700"
                _hover={{ color: palette.white, textDecoration: "none" }}
              >
                <XIcon size={15} />
                @WalletChan_
              </Link>
              <Link
                href="/discord"
                target="_blank"
                rel="noreferrer"
                display="inline-flex"
                alignItems="center"
                gap={2}
                color={palette.muted}
                fontSize="14px"
                fontWeight="700"
                _hover={{ color: palette.white, textDecoration: "none" }}
              >
                <Image
                  src="/icons/discord-symbol-white.svg"
                  alt=""
                  w="18px"
                  h="14px"
                  opacity={0.72}
                />
                Discord
              </Link>
            </HStack>
          </Flex>
        </Container>
      </Box>
    </>
  );
}

function XIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
