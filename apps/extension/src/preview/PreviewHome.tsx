import {
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  IconButton,
  Image,
  Link,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  AddIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  LockIcon,
  RepeatIcon,
  SettingsIcon,
  ViewIcon,
} from "@chakra-ui/icons";
import AccountNetworkControls from "@/components/AccountNetworkControls";
import ChainIcon from "@/components/ChainIcon";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import TokenLogo from "@/components/TokenLogo";
import WalletConnectBanner from "@/components/WalletConnectBanner";
import { isDarkThemeId, useStripTokens, useTheme } from "@/theme";
import { previewAddress, previewHomeAccount, previewHomeAccounts, previewVisibleChains } from "./fixtures";
import type { PreviewRoute } from "./types";

const SidePanelIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 2v14h5V5h-5zM4 5v14h10V5H4z"
    />
  </Icon>
);

const FullscreenIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M14 3v2h3.59l-4.3 4.29 1.42 1.42L19 6.41V10h2V3h-7zM5 17.59V14H3v7h7v-2H6.41l4.3-4.29-1.42-1.42L5 17.59z"
    />
  </Icon>
);

const SwapIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z" />
  </Icon>
);

const MoreIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
  </Icon>
);

const SendIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </Icon>
);

const QrIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M4 4h6v6H4V4zm2 2v2h2V6H6zm8-2h6v6h-6V4zm2 2v2h2V6h-2zM4 14h6v6H4v-6zm2 2v2h2v-2H6zm8-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2z" />
  </Icon>
);

interface PreviewTokenRow {
  symbol: string;
  balance: string;
  value: string;
  price: string;
  chainId: number;
  logoUrl?: string;
  nativeChainId?: number;
}

const previewTokens: PreviewTokenRow[] = [
  {
    symbol: "ETH",
    balance: "2.81548",
    value: "$5,033.82",
    price: "$1,787.91",
    chainId: 8453,
    nativeChainId: 8453,
  },
  {
    symbol: "ETH",
    balance: "0.83962",
    value: "$1,500.34",
    price: "$1,786.93",
    chainId: 1,
    nativeChainId: 1,
  },
  {
    symbol: "WCHAN",
    balance: "302,974,655.39",
    value: "$501.09",
    price: "$<0.01",
    chainId: 8453,
    logoUrl: "/walletchan-icon.png",
  },
  {
    symbol: "USDC",
    balance: "296.009",
    value: "$296.02",
    price: "$1",
    chainId: 8453,
    logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  },
];

function PreviewHeader() {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const strip = useStripTokens();
  const hoverBg = isDarkTheme ? "whiteAlpha.100" : "whiteAlpha.200";

  return (
    <Flex py={3} px={4} bg={strip.bg} color={strip.fg} alignItems="center" position="relative">
      <Box position="absolute" bottom="0" left="0" right="0" h={isDarkTheme ? "1px" : "3px"} bg={isDarkTheme ? "border.subtle" : "accent.primary"} />
      <HStack spacing={2}>
        <Box bg={isDarkTheme ? "white" : "surface.raised"} p={0.5} borderRadius={isDarkTheme ? "md" : undefined} overflow="hidden">
          <Image src="walletchan-icon-white-bg.png" h="1.75rem" borderRadius={isDarkTheme ? "md" : undefined} />
        </Box>
        <Text fontWeight="900" textTransform="uppercase" letterSpacing="wider">
          WalletChan
        </Text>
      </HStack>
      <Spacer />
      <HStack spacing={1}>
        <IconButton aria-label="Lock wallet" icon={<LockIcon />} variant="ghost" size="sm" color={strip.fg} _hover={{ bg: hoverBg }} />
        <IconButton aria-label="Switch to sidepanel" icon={<SidePanelIcon />} variant="ghost" size="sm" color={strip.fg} _hover={{ bg: hoverBg }} />
        <IconButton aria-label="Open in new tab" icon={<FullscreenIcon />} variant="ghost" size="sm" color={strip.fg} _hover={{ bg: hoverBg }} />
        <IconButton aria-label="Settings" icon={<SettingsIcon />} variant="ghost" size="sm" color={strip.fg} _hover={{ bg: hoverBg }} />
      </HStack>
    </Flex>
  );
}

function PoweredStrip() {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);

  return (
    <HStack spacing={0} align="stretch" borderBottom={isDarkTheme ? "1px solid" : "3px solid"} borderColor={isDarkTheme ? "border.subtle" : "border.default"}>
      <HStack flex="1" minW="max-content" bg={isDarkTheme ? "#2C1E06" : "accent.highlight"} py={isDarkTheme ? 1.5 : 1} pl={3} pr={2} spacing={2}>
        <Text fontSize="xs" fontWeight="700" color={isDarkTheme ? "#C9B27D" : "accentFg.highlight"} textTransform="uppercase" letterSpacing="wider" whiteSpace="nowrap">
          Powered by
        </Text>
        <Link color="accent.highlight" fontWeight="800" fontSize="xs" textTransform="uppercase" letterSpacing="wide" px={1} py={0} border="1px solid transparent" borderRadius="sm">
          $WCHAN
        </Link>
      </HStack>
      <Box w="28px" alignSelf="stretch" bgGradient={isDarkTheme ? "linear(110deg, #2C1E06 50%, #141833 50%)" : "linear(110deg, #F0C020 50%, #1a1a2e 50%)"} flexShrink={0} />
      <HStack flex="1" bg={isDarkTheme ? "#141833" : undefined} bgGradient={isDarkTheme ? undefined : "linear(90deg, #1a1a2e 0%, #16213e 60%, #1a1a2e 100%)"} py={isDarkTheme ? 1.5 : 1} pl={2} pr={3} spacing={1} justify="flex-end" minW={0}>
        <Text fontSize="xs" fontWeight={isDarkTheme ? "800" : "900"} color="accent.highlight" textTransform="uppercase" letterSpacing="wide" whiteSpace="nowrap">
          WalletChan OS
        </Text>
        <ExternalLinkIcon boxSize={3} color="accent.highlight" />
      </HStack>
    </HStack>
  );
}

function AddressUtilityRow() {
  const { tokens } = useTheme();
  const addressPill = useStripTokens("elevated");
  const explorerShortcuts = [
    ["Octav", "octav-icon.png"],
    ["DeBank", "debank-icon.ico"],
    ["Zapper", "zapper-icon.png"],
    ["Nansen", "nansen-icon.png"],
  ];

  return (
    <HStack spacing={2} align="center">
      <HStack bg={addressPill.bg} color={addressPill.fg} border="1px solid" borderColor={addressPill.border} borderRadius="md" px={2} py={1} spacing={2} flex={1} minW={0}>
        <MiddleTruncatedAddress address={previewAddress} />
        <IconButton aria-label="Show QR code" icon={<QrIcon boxSize="14px" />} size="xs" variant="ghost" color="inherit" minW="auto" h="auto" p={0} />
        <IconButton aria-label="Copy address" icon={<CopyIcon />} size="xs" variant="ghost" color="inherit" minW="auto" h="auto" p={0} />
        <IconButton aria-label="View on explorer" icon={<ExternalLinkIcon />} size="xs" variant="ghost" color="inherit" minW="auto" h="auto" p={0} />
      </HStack>
      <HStack spacing={1} flexShrink={0} justify="flex-end">
        {explorerShortcuts.map(([name, icon]) => (
          <Box key={name} as="button" bg="surface.raised" border={tokens.borders.thin} borderColor="border.default" borderRadius="sm" boxShadow="card" p={0.5} title={`View on ${name}`}>
            <Image src={icon} boxSize="18px" />
          </Box>
        ))}
      </HStack>
    </HStack>
  );
}

function QuickActions({ go }: { go: (route: PreviewRoute) => void }) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const actionProps = {
    w: "100%",
    minW: 0,
    border: "3px solid",
    borderColor: "border.default",
    boxShadow: "card",
    fontWeight: "800",
    fontSize: "xs",
    textTransform: "uppercase" as const,
    letterSpacing: "normal",
    iconSpacing: 1.5,
    px: 1.5,
    whiteSpace: "nowrap" as const,
  };

  return (
    <Box display="grid" gridTemplateColumns="minmax(0, 1.55fr) minmax(0, 1fr) minmax(0, 1fr)" columnGap={2} alignItems="stretch">
      <Button {...actionProps} bg="accent.secondary" color="accentFg.secondary" leftIcon={<SwapIcon boxSize={4} />}>
        Swap / Bridge
      </Button>
      <Button {...actionProps} bg={isDarkTheme ? "accent.primary" : "accent.highlight"} color={isDarkTheme ? "accentFg.primary" : "accentFg.highlight"} leftIcon={<SendIcon boxSize={4} />}>
        Send
      </Button>
      <Button {...actionProps} bg="surface.raised" color="text.primary" leftIcon={<MoreIcon boxSize={4} />} onClick={() => go("settings")}>
        More
      </Button>
    </Box>
  );
}

function PortfolioPanel() {
  const { tokens } = useTheme();

  return (
    <Box bg="surface.raised" border={tokens.borders.medium} borderColor="border.default" borderRadius="lg" boxShadow="card" overflow="hidden">
      <HStack borderBottom="2px solid" borderColor="border.default" spacing={0}>
        <HStack flex={1} px={3} py={2.5} bg="surface.sunken" spacing={1.5}>
          <Text fontSize="sm" fontWeight="700" textTransform="uppercase" letterSpacing="wide">
            Holdings
          </Text>
          <Text fontSize="xs" fontWeight="900" color="status.success.fg">
            $7,735.59
          </Text>
          <ViewIcon color="fg.muted" boxSize={3.5} />
        </HStack>
        <HStack flex={1} px={3} py={2.5}>
          <Text fontSize="sm" fontWeight="700" textTransform="uppercase" letterSpacing="wide" color="text.secondary">
            Activity
          </Text>
        </HStack>
      </HStack>
      <HStack justify="flex-end" px={3} py={2} borderBottom="1px solid" borderColor="border.subtle">
        <Button size="xs" variant="secondary" rightIcon={<ChevronDownIcon />} px={3}>
          All Networks
        </Button>
        <AddIcon color="fg.secondary" />
        <RepeatIcon color="fg.secondary" />
      </HStack>
      <Box px={3} pt={0} pb={1}>
        <HStack spacing={1.5} mb={1} minH="18px">
          <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="wide" color="text.secondary">
            8D
          </Text>
          <Text fontSize="xs" fontWeight="700" color="status.success.fg">
            +$1,977.93 (+34.35%)
          </Text>
        </HStack>
        <Box h="60px" bg="surface.sunken" border="1px solid" borderColor="border.subtle" borderRadius="md" overflow="hidden">
          <svg width="100%" height="60" viewBox="0 0 100 60" preserveAspectRatio="none">
            <path d="M0 58 L0 32 L24 22 L29 56 L49 43 L72 27 L82 18 L88 24 L96 22 L100 22 L100 58 Z" fill={tokens.colors.chart.positive} opacity="0.12" />
            <path d="M0 32 L24 22 L29 56 L49 43 L72 27 L82 18 L88 24 L96 22 L100 22" fill="none" stroke={tokens.colors.chart.positive} strokeWidth="2.2" />
          </svg>
        </Box>
      </Box>
      <VStack spacing={0} align="stretch">
        {previewTokens.map((token, index) => (
          <HStack key={`${token.symbol}-${index}`} w="full" p={2.5} px={3} borderBottom={index < previewTokens.length - 1 ? "1px solid" : "none"} borderColor="border.subtle">
            <Box position="relative">
              <TokenLogo symbol={token.symbol} logoUrl={token.logoUrl} nativeChainId={token.nativeChainId} size="30px" fontSize="9px" />
              <Box position="absolute" right="-4px" bottom="-4px">
                <ChainIcon chainId={token.chainId} chainName={token.chainId === 1 ? "Ethereum" : "Base"} size="12px" withChip />
              </Box>
            </Box>
            <VStack align="start" spacing={0} minW={0}>
              <Text fontSize="sm" fontWeight="800" color="fg.primary">
                {token.symbol}
              </Text>
              <Text fontSize="xs" color="fg.muted" fontWeight="600" noOfLines={1}>
                {token.balance}
              </Text>
            </VStack>
            <Spacer />
            <VStack align="end" spacing={0}>
              <Text fontSize="sm" fontWeight="800" color="fg.primary">
                {token.value}
              </Text>
              <Text fontSize="xs" color="fg.muted" fontWeight="600">
                {token.price}
              </Text>
            </VStack>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}

export default function PreviewHome({ go }: { go: (route: PreviewRoute) => void }) {
  const selectedChain = previewVisibleChains.find((chain) => chain.chainId === 8453);

  return (
    <Box minH="100%" bg="surface.base" color="fg.primary" display="flex" flexDirection="column">
      <PreviewHeader />
      <PoweredStrip />
      <Box pt={3} pb={4} px={3} flex="1" overflowY="auto">
        <VStack spacing={4} align="stretch">
          <WalletConnectBanner sessionCount={1} onClick={() => {}} />
          <AccountNetworkControls
            accounts={previewHomeAccounts}
            activeAccount={previewHomeAccount}
            selectedChain={selectedChain}
            visibleChains={previewVisibleChains}
            onAccountSelect={() => {}}
            onAddAccount={() => {}}
            onAccountSettings={() => {}}
            onChainSelect={() => {}}
            onAddChain={() => {}}
          />
          <AddressUtilityRow />
          <QuickActions go={go} />
          <PortfolioPanel />
        </VStack>
      </Box>
    </Box>
  );
}
