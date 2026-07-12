"use client";

import { Box, Flex, HStack, Icon as ChakraIcon, IconButton, Image, Spacer, Text, VStack } from "@chakra-ui/react";
import { AddIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon, RepeatIcon, ViewIcon } from "@chakra-ui/icons";
import { CheckCircle2, Code2, EyeOff, GitBranch, Globe2, Layers3, LockKeyhole, Shuffle, ShieldCheck, Sparkles, WalletCards, Zap } from "lucide-react";
import { palette } from "./design";
import { MiddleTruncatedAddress } from "./MiddleTruncatedAddress";

export type StoryId = "home" | "batching" | "signing" | "swap" | "browser" | "chains" | "trust" | "token";

const ui = {
  strip: "#111827",
  raised: "#171b26",
  sunken: "#0f121b",
  border: "rgba(255,255,255,0.14)",
  borderStrong: "rgba(255,255,255,0.22)",
  text: "#f7f7f4",
  muted: "rgba(247,247,244,0.68)",
  faint: "rgba(247,247,244,0.44)",
  yellow: "#f5c542",
  green: "#61e6a6",
};

const preserve3d = { transformStyle: "preserve-3d" } as const;
const tokenDepths = ["translate3d(0,-10px,80px)", "translate3d(0,-10px,64px)", "translate3d(0,-10px,48px)", "translate3d(0,-10px,32px)"];
const panelChains = [["Ethereum", "/images/ethereum.svg"], ["Base", "/images/base.svg"], ["Polygon", "/images/polygon.svg"], ["Unichain", "/images/unichain.svg"], ["MegaETH", "/images/megaeth.svg"], ["BNB", "/images/bsc.svg"]];
const explorerShortcuts = [["Octav", "/images/extension-preview/octav-icon.png"], ["DeBank", "/images/extension-preview/debank-icon.ico"], ["Zapper", "/images/extension-preview/zapper-icon.png"], ["Nansen", "/images/extension-preview/nansen-icon.png"]];
const tokens = [
  { symbol: "ETH", balance: "2.81548", value: "$5,033.82", price: "$1,787.91", icon: "/images/ethereum.svg", chain: "/images/base.svg" },
  { symbol: "ETH", balance: "0.83962", value: "$1,500.34", price: "$1,786.93", icon: "/images/ethereum.svg", chain: "/images/ethereum.svg" },
  { symbol: "WCHAN", balance: "302,974,655.39", value: "$501.09", price: "$<0.01", icon: "/images/walletchan-icon-nobg.png", chain: "/images/base.svg" },
  { symbol: "USDC", balance: "296.009", value: "$296.02", price: "$1", icon: "/images/extension-preview/usdc.png", chain: "/images/base.svg" },
];

export const storyPanels: Record<StoryId, { title: string; eyebrow: string; accent: string; icon: React.ReactNode; body: React.ReactNode }> = {
  home: { eyebrow: "Wallet home", title: "Wallet home", accent: palette.yellow, icon: <Sparkles size={16} />, body: <HomeWalletSurface /> },
  batching: { eyebrow: "Smart batch ready", title: "Approve + swap + revoke", accent: palette.yellow, icon: <Layers3 size={16} />, body: <BatchingPanel /> },
  signing: { eyebrow: "Pre-sign review", title: "Asset changes decoded", accent: palette.green, icon: <ShieldCheck size={16} />, body: <SigningPanel /> },
  swap: { eyebrow: "Route inside wallet", title: "Swap / bridge preview", accent: palette.blue, icon: <Shuffle size={16} />, body: <SwapPanel /> },
  browser: { eyebrow: "Onchain browser", title: "ENS/IPFS resolved", accent: palette.cyan, icon: <Globe2 size={16} />, body: <BrowserPanel /> },
  chains: { eyebrow: "All EVM chains", title: "Network control", accent: palette.violet, icon: <GitBranch size={16} />, body: <ChainsPanel /> },
  trust: { eyebrow: "Private by design", title: "No tracking mode", accent: palette.green, icon: <LockKeyhole size={16} />, body: <TrustPanel /> },
  token: { eyebrow: "Powered by $WCHAN", title: "Wallet-native loop", accent: palette.yellow, icon: <Zap size={16} />, body: <TokenPanel /> },
};

export function HomeWalletSurface() {
  return (
    <VStack align="stretch" spacing={3} sx={preserve3d}>
      <HStack spacing={2} align="center" sx={preserve3d}>
        <HStack bg={ui.strip} color={ui.text} border="1px solid" borderColor={ui.borderStrong} borderRadius="14px" px={2.5} py={1.5} spacing={1.5} flex={1} minW={0} transform="translateZ(76px)">
          <MiddleTruncatedAddress address="0xab7def16d63c49422bd8692e118ab780eb5410e6" />
          <IconButton aria-label="Show QR code" icon={<QrIcon boxSize="12px" />} size="xs" variant="ghost" color="inherit" minW="auto" h="auto" p={0} _hover={{ bg: "transparent", color: ui.yellow }} />
          <IconButton aria-label="Copy address" icon={<CopyIcon />} size="xs" variant="ghost" color="inherit" minW="auto" h="auto" p={0} _hover={{ bg: "transparent", color: ui.yellow }} />
          <IconButton aria-label="Open explorer" icon={<ExternalLinkIcon />} size="xs" variant="ghost" color="inherit" minW="auto" h="auto" p={0} _hover={{ bg: "transparent", color: ui.yellow }} />
        </HStack>
        <HStack spacing={1} flexShrink={0} sx={preserve3d}>
          {explorerShortcuts.map(([name, icon]) => <Flex key={name} as="button" w="30px" h="30px" bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} borderRadius="10px" align="center" justify="center" title={`View on ${name}`} transform="translateZ(82px)" _hover={{ transform: "translateZ(82px) translateY(-1px)" }}><Image src={icon} alt={name} boxSize="20px" /></Flex>)}
        </HStack>
      </HStack>
      <Box display="grid" gridTemplateColumns="1.55fr 1fr 1fr" gap={2} sx={preserve3d}>
        {["Swap / Bridge", "Send", "More"].map((label, index) => (
          <HStack key={label} h="46px" justify="center" borderRadius="16px" bg={index === 0 ? "#5a81f3" : index === 1 ? "#7d5af7" : ui.raised} border="3px solid rgba(49,56,82,0.95)" boxShadow="0 8px 0 rgba(0,0,0,0.28)" color={ui.text} fontSize="12px" fontWeight="900" textTransform="uppercase" transform="translateZ(92px)">
            {index === 0 ? <Shuffle size={15} /> : index === 1 ? <SendIcon boxSize={4} /> : <GridIcon boxSize={4} />}
            <Text>{label}</Text>
          </HStack>
        ))}
      </Box>
      <PortfolioMini />
    </VStack>
  );
}

function PortfolioMini() {
  return (
    <Box bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} borderRadius="20px" boxShadow="0 14px 0 rgba(0,0,0,0.22)" overflow="visible" transform="translateZ(38px)" sx={preserve3d}>
      <HStack borderBottom="1px solid" borderColor={ui.borderStrong} spacing={0} borderTopRadius="20px" overflow="hidden">
        <HStack flex={1} px={3} py={2.5} bg={ui.sunken} spacing={1.5}><Text fontSize="13px" fontWeight="900" color={ui.text}>HOLDINGS</Text><Text fontSize="11px" fontWeight="900" color={ui.green}>$7,735.59</Text><ViewIcon color={ui.faint} boxSize={3.5} /></HStack>
        <HStack flex={1} px={3} py={2.5}><Text fontSize="13px" fontWeight="900" color={ui.muted}>ACTIVITY</Text></HStack>
      </HStack>
      <HStack justify="flex-end" px={3} pt={1.5} pb={0.5}><Text px={3} py={1.5} borderRadius="10px" bg={ui.strip} color={ui.text} border="1px solid" borderColor={ui.border} fontSize="11px" fontWeight="900">ALL NETWORKS</Text><AddIcon color={ui.muted} boxSize={3} /><RepeatIcon color={ui.muted} boxSize={3} /></HStack>
      <Box px={3} pt={0.5} pb={1} sx={preserve3d}>
        <HStack spacing={1.5} mb={0.5} minH="18px" transform="translate3d(0,-8px,92px)"><Text fontSize="11px" fontWeight="900" color={ui.muted}>8D</Text><Text fontSize="11px" fontWeight="900" color={ui.green}>+$1,977.93 (+34.35%)</Text></HStack>
        <Box h="48px" bg={ui.sunken} border="1px solid" borderColor={ui.border} borderRadius="14px" overflow="hidden" transform="translate3d(0,-8px,88px)"><svg width="100%" height="48" viewBox="0 0 100 48" preserveAspectRatio="none"><path d="M0 48 L0 26 L24 18 L29 45 L49 34 L72 22 L82 12 L88 18 L96 16 L100 16 L100 48 Z" fill={ui.green} opacity="0.12" /><path d="M0 26 L24 18 L29 45 L49 34 L72 22 L82 12 L88 18 L96 16 L100 16" fill="none" stroke={ui.green} strokeWidth="2.2" /></svg></Box>
      </Box>
      <Box position="relative" sx={preserve3d}>
        <Box position="absolute" inset={0} pointerEvents="none">{[1, 2, 3].map((line) => <Box key={line} position="absolute" left={0} right={0} top={`${line * 25}%`} borderTop="1px solid" borderColor={ui.border} />)}</Box>
        <VStack spacing={0} align="stretch" sx={preserve3d}>{tokens.map((token, index) => <TokenRow key={`${token.symbol}-${index}`} token={token} index={index} />)}</VStack>
      </Box>
    </Box>
  );
}

function BatchingPanel() {
  return <VStack align="stretch" spacing={3} sx={preserve3d}>{["Approve USDC", "Swap through WCHAN route", "Revoke stale allowance"].map((step, index) => <HStack key={step} p={3} borderRadius="16px" bg={ui.sunken} border="1px solid" borderColor={ui.border} transform={`translateZ(${80 - index * 14}px)`}><Flex w="28px" h="28px" borderRadius="999px" bg="rgba(245,197,66,0.14)" color={ui.yellow} align="center" justify="center" fontWeight="900">{index + 1}</Flex><Box><Text color={ui.text} fontWeight="900" fontSize="14px">{step}</Text><Text color={ui.faint} fontSize="11px">Included in one signed batch</Text></Box></HStack>)}<Meter label="Review" value="Asset preview -> Gas -> Confirm" color={ui.yellow} /></VStack>;
}

function SigningPanel() {
  return <VStack align="stretch" spacing={3} sx={preserve3d}><DeltaRow label="Send" amount="250.00 USDC" color={palette.red} /><DeltaRow label="Receive" amount="34,118 WCHAN" color={ui.green} /><InfoCard icon={<Code2 size={16} />} title="Decoded calldata" text="swapExactInputSingle(...)" depth="76px" /><InfoCard icon={<ShieldCheck size={16} />} title="SIWE parsed" text="Domain, nonce, chain, expiration checked" depth="60px" /></VStack>;
}

function SwapPanel() {
  return <VStack align="stretch" spacing={3} sx={preserve3d}><RouteBox from="USDC on Base" to="WCHAN on Base" /><RouteBox from="WCHAN" to="ETH on Unichain" /><Meter label="Best route" value="0x + WCHAN custom path" color={palette.blue} /><InfoCard icon={<Shuffle size={16} />} title="Bridge-ready" text="Review route before leaving the wallet" depth="58px" /></VStack>;
}

function BrowserPanel() {
  return <VStack align="stretch" spacing={3} sx={preserve3d}><Box p={3} borderRadius="18px" bg={ui.sunken} border="1px solid" borderColor={ui.border} transform="translateZ(82px)"><HStack color={palette.cyan}><Globe2 size={16} /><Text fontWeight="900">vitalik.eth/ipfs</Text></HStack><Text color={ui.muted} fontSize="12px" mt={2}>Contenthash resolved through ENS. IPFS served from local Kubo.</Text></Box>{["Resolve ENS", "Fetch IPFS", "Pin locally"].map((step, index) => <Step key={step} index={index} label={step} color={palette.cyan} />)}</VStack>;
}

function ChainsPanel() {
  return <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap={2.5} sx={preserve3d}>{panelChains.map(([name, icon], index) => <HStack key={name} p={2.5} borderRadius="15px" bg={ui.sunken} border="1px solid" borderColor={ui.border} transform={`translateZ(${82 - index * 7}px)`}><Image src={icon} alt="" w="24px" h="24px" /><Text color={ui.text} fontSize="12px" fontWeight="900" noOfLines={1}>{name}</Text></HStack>)}<HStack gridColumn="span 2" p={3} borderRadius="16px" bg="rgba(177,140,255,0.12)" border="1px solid rgba(177,140,255,0.32)" color={palette.violet} transform="translateZ(58px)"><GitBranch size={16} /><Text fontWeight="900" fontSize="13px">Add custom EVM chain</Text></HStack></Box>;
}

function TrustPanel() {
  return <VStack align="stretch" spacing={3} sx={preserve3d}><InfoCard icon={<EyeOff size={16} />} title="No tracking" text="Wallet behavior stays private." depth="86px" /><InfoCard icon={<Sparkles size={16} />} title="Open source" text="Inspect extension and website code." depth="70px" /><InfoCard icon={<LockKeyhole size={16} />} title="Local vault" text="Keys and seed phrases are encrypted locally." depth="54px" /></VStack>;
}

function TokenPanel() {
  return <VStack align="stretch" spacing={3} sx={preserve3d}><HStack p={3} borderRadius="18px" bg="rgba(245,197,66,0.14)" border="1px solid rgba(245,197,66,0.3)" transform="translateZ(86px)"><Image src="/images/walletchan-icon-nobg.png" alt="" w="34px" h="34px" /><Box><Text color={ui.text} fontWeight="900">WCHAN</Text><Text color={ui.faint} fontSize="12px">302,974,655.39</Text></Box><Spacer /><Text color={ui.text} fontWeight="900">$501.09</Text></HStack><InfoCard icon={<WalletCards size={16} />} title="Premium tiers" text="sWCHAN staking can reduce product fees." depth="70px" /><InfoCard icon={<Zap size={16} />} title="Wallet-native routes" text="WCHAN paths show up where they help users." depth="54px" /></VStack>;
}

function TokenRow({ token, index }: { token: (typeof tokens)[number]; index: number }) {
  return <HStack w="full" p={2.5} px={3} transform={tokenDepths[index] ?? tokenDepths[tokenDepths.length - 1]}><Box position="relative"><Flex w="30px" h="30px" align="center" justify="center" borderRadius="full" overflow="hidden"><Image src={token.icon} alt="" w="30px" h="30px" /></Flex><Flex position="absolute" right="-4px" bottom="-4px" w="15px" h="15px" borderRadius="full" bg={ui.strip} border="1px solid" borderColor={ui.borderStrong} align="center" justify="center"><Image src={token.chain} alt="" w="11px" h="11px" /></Flex></Box><VStack align="start" spacing={0} minW={0}><Text fontSize="13px" fontWeight="900" color={ui.text}>{token.symbol}</Text><Text fontSize="11px" color={ui.faint} fontWeight="700" noOfLines={1}>{token.balance}</Text></VStack><Spacer /><VStack align="end" spacing={0}><Text fontSize="13px" fontWeight="900" color={ui.text}>{token.value}</Text><Text fontSize="11px" color={ui.faint} fontWeight="700">{token.price}</Text></VStack></HStack>;
}

function InfoCard({ icon, title, text, depth }: { icon: React.ReactNode; title: string; text: string; depth: string }) {
  return <HStack p={3} borderRadius="16px" bg={ui.sunken} border="1px solid" borderColor={ui.border} transform={`translateZ(${depth})`}><Flex w="30px" h="30px" borderRadius="12px" align="center" justify="center" bg="rgba(255,255,255,0.08)" color={ui.yellow}>{icon}</Flex><Box><Text color={ui.text} fontWeight="900" fontSize="13px">{title}</Text><Text color={ui.faint} fontSize="11px">{text}</Text></Box></HStack>;
}

function DeltaRow({ label, amount, color }: { label: string; amount: string; color: string }) {
  return <HStack p={3} borderRadius="16px" bg={ui.sunken} border="1px solid" borderColor={ui.border} justify="space-between" transform="translateZ(82px)"><Text color={ui.faint} fontSize="12px" fontWeight="900">{label}</Text><Text color={color} fontSize="15px" fontWeight="900">{amount}</Text></HStack>;
}

function RouteBox({ from, to }: { from: string; to: string }) {
  return <HStack p={3} borderRadius="16px" bg={ui.sunken} border="1px solid" borderColor={ui.border} transform="translateZ(78px)"><Shuffle size={16} color={palette.blue} /><Box><Text color={ui.faint} fontSize="11px" fontWeight="900">{from}</Text><Text color={ui.text} fontSize="14px" fontWeight="900">{to}</Text></Box></HStack>;
}

function Meter({ label, value, color }: { label: string; value: string; color: string }) {
  return <Box p={3} borderRadius="16px" bg={ui.sunken} border="1px solid" borderColor={ui.border} transform="translateZ(62px)"><HStack justify="space-between"><Text color={ui.faint} fontSize="11px" fontWeight="900">{label}</Text><CheckCircle2 size={16} color={color} /></HStack><Box h="7px" mt={2} borderRadius="999px" bg="rgba(255,255,255,0.1)" overflow="hidden"><Box h="full" w="72%" bg={color} /></Box><Text color={ui.muted} fontSize="11px" mt={2}>{value}</Text></Box>;
}

function Step({ index, label, color }: { index: number; label: string; color: string }) {
  return <HStack p={2.5} borderRadius="15px" bg={ui.sunken} border="1px solid" borderColor={ui.border} transform={`translateZ(${72 - index * 12}px)`}><Flex w="26px" h="26px" borderRadius="10px" align="center" justify="center" bg={`${color}22`} color={color} fontWeight="900">{index + 1}</Flex><Text color={ui.text} fontSize="13px" fontWeight="900">{label}</Text></HStack>;
}

const SendIcon = (props: any) => <ChakraIcon viewBox="0 0 24 24" {...props}><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></ChakraIcon>;
const GridIcon = (props: any) => <ChakraIcon viewBox="0 0 24 24" {...props}><path fill="currentColor" d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" /></ChakraIcon>;
const QrIcon = (props: any) => <ChakraIcon viewBox="0 0 24 24" {...props}><path fill="currentColor" d="M4 4h6v6H4V4zm2 2v2h2V6H6zm8-2h6v6h-6V4zm2 2v2h2V6h-2zM4 14h6v6H4v-6zm2 2v2h2v-2H6zm8-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2z" /></ChakraIcon>;
