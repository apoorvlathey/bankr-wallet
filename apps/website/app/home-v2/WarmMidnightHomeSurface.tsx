"use client";

import { Box, Flex, HStack, Icon, IconButton, Image, Spacer, Text, VStack } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon, CopyIcon, ExternalLinkIcon, SearchIcon, ViewIcon } from "@chakra-ui/icons";
import { MoreVertical } from "lucide-react";
import { warmMockup as ui } from "./design";
import { MiddleTruncatedAddress } from "./MiddleTruncatedAddress";

const preserve3d = { transformStyle: "preserve-3d" } as const;
const chartPath = "M0 62 C20 62 39 62 54 62 C58 62 60 58 61 50 C62 42 62 25 63 18 C72 15 88 16 100 16";
const bayer = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16));

function chartTopAt(x: number) {
  if (x <= 54) return 62;
  if (x < 63) {
    const progress = (x - 54) / 9;
    return 62 - 44 * progress * progress;
  }
  return 16 + Math.sin((x - 66) * 0.22) * 1.1;
}

const ditherCells = Array.from({ length: 50 }, (_, column) => {
  const x = column * 2;
  const top = chartTopAt(x);
  const depth = Math.max(1, 68 - top);

  return Array.from({ length: 34 }, (_, row) => {
    const y = row * 2;
    if (y < top) return null;
    const density = 1 - (y - top) / depth;
    const threshold = bayer[row & 3][column & 3];
    const isLit = density > threshold;

    return {
      key: `${column}-${row}`,
      x,
      y,
      opacity: isLit ? 0.2 + density * 0.36 : 0.025 + density * 0.045,
    };
  });
}).flat().filter((cell): cell is NonNullable<typeof cell> => cell !== null);

type PreviewAsset = {
  symbol: string;
  note?: string;
  balance: string;
  value: string;
  price?: string;
  icon: string;
  chain?: string;
};

const assets: PreviewAsset[] = [
  { symbol: "ETH", note: "4 networks", balance: "3.64229595", value: "$6,575.55", icon: "/images/ethereum.svg" },
  { symbol: "WCHAN", balance: "302,974,655.39", value: "$456.60", price: "$<0.01", icon: "/images/walletchan-icon-nobg.png", chain: "/images/base.svg" },
  { symbol: "USDC", balance: "321.123", value: "$321.04", price: "$1", icon: "/images/extension-preview/usdc.png", chain: "/images/base.svg" },
  { symbol: "WETH", balance: "0.0846586", value: "$152.94", price: "$1,806.61", icon: "/images/ethereum.svg", chain: "/images/base.svg" },
] as const;

export function WarmMidnightHomeSurface() {
  return (
    <VStack align="stretch" spacing={3.5} px={3.5} pt={3.5} pb={2} sx={preserve3d}>
      <AccountCard />
      <PortfolioBalance />
      <QuickActions />
      <PortfolioTabs />
      <AssetControls />
      <AssetList />
    </VStack>
  );
}

function AccountCard() {
  return (
    <HStack
      minH="78px"
      px={3.5}
      py={3}
      spacing={3}
      bg={ui.surface}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="12px"
      transform="translateZ(54px)"
      transition="transform 180ms ease, background-color 180ms ease"
      _hover={{ bg: ui.surfaceHover, transform: "translate3d(0,-2px,58px)" }}
    >
      <Flex boxSize="42px" borderRadius="full" bg="rgba(245,158,11,0.14)" align="center" justify="center" flexShrink={0}>
        <Image src="/images/walletchan-icon-nobg.png" alt="" boxSize="38px" />
      </Flex>
      <Box minW={0} flex={1}>
        <Text color={ui.text} fontSize="16px" fontWeight="600" lineHeight="1.25">walletchan.eth</Text>
        <HStack mt={1} spacing={1.5} color={ui.secondary} minW={0}>
          <MiddleTruncatedAddress address="0xab7def16d63c49422bd8692e118ab780eb5410e6" />
          <IconButton aria-label="Show QR code" icon={<QrIcon boxSize="13px" />} variant="ghost" minW="24px" h="24px" color="inherit" _hover={{ color: ui.amber, bg: "transparent" }} />
          <IconButton aria-label="Copy address" icon={<CopyIcon boxSize="13px" />} variant="ghost" minW="24px" h="24px" color="inherit" _hover={{ color: ui.amber, bg: "transparent" }} />
          <IconButton aria-label="Open explorer" icon={<ExternalLinkIcon boxSize="13px" />} variant="ghost" minW="24px" h="24px" color="inherit" _hover={{ color: ui.amber, bg: "transparent" }} />
        </HStack>
      </Box>
      <ChevronRightIcon color={ui.muted} boxSize={5} flexShrink={0} />
    </HStack>
  );
}

function PortfolioBalance() {
  return (
    <Box px={1} pt={1} transform="translateZ(34px)" sx={preserve3d}>
      <Text color={ui.secondary} fontSize="13px">Portfolio balance</Text>
      <HStack spacing={2} mt={0.5}>
        <Text color={ui.text} fontSize="34px" lineHeight="1.1" fontWeight="600" sx={{ fontVariantNumeric: "tabular-nums" }}>$39,189.23</Text>
        <ViewIcon color={ui.secondary} boxSize={4} />
      </HStack>
      <HStack mt={2} spacing={2} fontSize="12px" fontWeight="600">
        <Text color={ui.secondary}>7D</Text>
        <Text color={ui.green}>+$31,629.70 (+418.41%)</Text>
      </HStack>
      <Box h="68px" mt={2} transform="translateZ(68px)">
        <svg width="100%" height="68" viewBox="0 0 100 68" preserveAspectRatio="none" aria-hidden="true">
          {ditherCells.map((cell) => (
            <rect key={cell.key} x={cell.x} y={cell.y} width="1.15" height="1.15" fill={ui.green} opacity={cell.opacity} />
          ))}
          <path d={chartPath} fill="none" stroke={ui.green} strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </Box>
    </Box>
  );
}

function QuickActions() {
  const actions = [
    { label: "Send", icon: <SendIcon />, emphasized: false },
    { label: "Swap", icon: <SwapIcon />, emphasized: true },
    { label: "Shield", icon: <ShieldIcon />, emphasized: false },
    { label: "More", icon: <GridIcon />, emphasized: false, notified: true },
  ];

  return (
    <Box display="grid" gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap={1} sx={preserve3d}>
      {actions.map((action) => (
        <VStack key={action.label} spacing={1.5} transform="translateZ(72px)">
          <Flex
            position="relative"
            boxSize="42px"
            borderRadius="10px"
            align="center"
            justify="center"
            bg={action.emphasized ? ui.amber : ui.surface}
            color={action.emphasized ? ui.base : ui.amber}
            border="1px solid"
            borderColor={action.emphasized ? ui.amber : ui.border}
          >
            {action.icon}
            {action.notified && <Box position="absolute" top="-4px" right="-4px" boxSize="8px" borderRadius="full" bg={ui.amber} border="2px solid" borderColor={ui.base} />}
          </Flex>
          <Text color={ui.text} fontSize="12px" fontWeight="600">{action.label}</Text>
        </VStack>
      ))}
    </Box>
  );
}

function PortfolioTabs() {
  return (
    <HStack borderBottom="1px solid" borderColor={ui.border} spacing={0} transform="translateZ(30px)">
      {["Assets", "Positions", "Activity"].map((tab, index) => (
        <Flex key={tab} flex={1} justify="center" py={2.5} position="relative">
          <Text color={index === 0 ? ui.text : ui.secondary} fontSize="13px" fontWeight="600">{tab}</Text>
          {index === 0 && <Box position="absolute" bottom="-1px" w="32px" h="2px" bg={ui.amber} borderTopRadius="full" />}
        </Flex>
      ))}
    </HStack>
  );
}

function AssetControls() {
  return (
    <HStack px={1.5} py={1} transform="translateZ(28px)">
      <HStack spacing={1.5} color={ui.text}>
        <Text fontSize="13px" fontWeight="600">All networks</Text>
        <ChevronDownIcon boxSize={4} />
      </HStack>
      <Spacer />
      <IconButton aria-label="Search assets" icon={<SearchIcon boxSize={4} />} variant="ghost" color={ui.secondary} minW="34px" h="34px" borderRadius="8px" />
      <IconButton aria-label="Portfolio menu" icon={<MoreVertical size={17} />} variant="ghost" color={ui.secondary} minW="34px" h="34px" borderRadius="8px" />
    </HStack>
  );
}

function AssetList() {
  return (
    <VStack align="stretch" spacing={0} bg={ui.surface} border="1px solid" borderColor={ui.borderStrong} borderRadius="12px" overflow="hidden" transform="translateZ(42px)" sx={preserve3d}>
      {assets.map((asset, index) => (
        <HStack
          key={asset.symbol}
          minH="58px"
          px={3}
          py={2}
          borderBottom={index === assets.length - 1 ? "0" : "1px solid"}
          borderColor={ui.border}
          transform={`translateZ(${48 - index * 8}px)`}
        >
          <Box position="relative" flexShrink={0}>
            <Flex boxSize="30px" borderRadius="full" bg={ui.sunken} overflow="hidden" align="center" justify="center">
              <Image src={asset.icon} alt="" boxSize="28px" borderRadius="full" objectFit="contain" />
            </Flex>
            {asset.chain && <Flex position="absolute" right="-3px" bottom="-2px" boxSize="13px" borderRadius="full" bg={ui.surface} border="1px solid" borderColor={ui.surface} align="center" justify="center"><Image src={asset.chain} alt="" boxSize="11px" borderRadius="full" /></Flex>}
          </Box>
          <Box minW={0}>
            <HStack spacing={1.5}><Text color={ui.text} fontSize="13px" fontWeight="600">{asset.symbol}</Text>{asset.note && <Text color={ui.muted} fontSize="10px">{asset.note}</Text>}</HStack>
            <Text color={ui.secondary} fontSize="11px" noOfLines={1}>{asset.balance}</Text>
          </Box>
          <Spacer />
          <VStack align="end" spacing={0}>
            <Text color={ui.text} fontSize="13px" fontWeight="600" sx={{ fontVariantNumeric: "tabular-nums" }}>{asset.value}</Text>
            {asset.price && <Text color={ui.secondary} fontSize="10px">{asset.price}</Text>}
          </VStack>
        </HStack>
      ))}
    </VStack>
  );
}

const SendIcon = () => <Icon viewBox="0 0 24 24" boxSize="18px"><path d="M7 17 17 7M10 7h7v7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const SwapIcon = () => <Icon viewBox="0 0 24 24" boxSize="18px"><path d="M5 8h12m0 0-3-3m3 3-3 3M19 16H7m0 0 3 3m-3-3 3-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const ShieldIcon = () => <Icon viewBox="0 0 24 24" boxSize="18px"><path d="M14 18a2 2 0 0 0-4 0M19 11l-2.1-6.7a2 2 0 0 0-2.8-1.1l-1.2.6A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.9 1.5L5 11M2 11h20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="17" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="7" cy="18" r="3" fill="none" stroke="currentColor" strokeWidth="2" /></Icon>;
const GridIcon = () => <Icon viewBox="0 0 24 24" boxSize="18px"><path d="M5 5h5v5H5V5Zm9 0h5v5h-5V5ZM5 14h5v5H5v-5Zm9 0h5v5h-5v-5Z" fill="none" stroke="currentColor" strokeWidth="2" /></Icon>;
const QrIcon = (props: any) => <Icon viewBox="0 0 24 24" {...props}><path d="M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Zm12 0h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2Z" fill="none" stroke="currentColor" strokeWidth="2" /></Icon>;
