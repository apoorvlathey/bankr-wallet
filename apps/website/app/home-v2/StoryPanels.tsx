"use client";

import { Box, Flex, HStack, Image, Spacer, Text, VStack } from "@chakra-ui/react";
import { CheckCircle2, Code2, EyeOff, GitBranch, Globe2, Layers3, LockKeyhole, Shuffle, ShieldCheck, Sparkles, WalletCards, Zap } from "lucide-react";
import { palette, warmMockup } from "./design";
import { WarmMidnightHomeSurface as HomeWalletSurface } from "./WarmMidnightHomeSurface";

export { HomeWalletSurface };

export type StoryId = "home" | "batching" | "accounts" | "privacy" | "signing" | "swap" | "browser" | "chains" | "trust" | "token";

const ui = {
  strip: warmMockup.sunken,
  raised: warmMockup.surface,
  sunken: warmMockup.sunken,
  border: warmMockup.border,
  borderStrong: warmMockup.borderStrong,
  text: warmMockup.text,
  muted: warmMockup.secondary,
  faint: warmMockup.muted,
  yellow: warmMockup.amber,
  green: warmMockup.green,
};

const preserve3d = { transformStyle: "preserve-3d" } as const;
const panelChains = [["Ethereum", "/images/ethereum.svg"], ["Base", "/images/base.svg"], ["Polygon", "/images/polygon.svg"], ["Unichain", "/images/unichain.svg"], ["MegaETH", "/images/megaeth.svg"], ["BNB", "/images/bsc.svg"]];

export const storyPanels: Record<StoryId, { title: string; eyebrow: string; accent: string; icon: React.ReactNode; body: React.ReactNode }> = {
  home: { eyebrow: "Wallet home", title: "Wallet home", accent: palette.yellow, icon: <Sparkles size={16} />, body: <HomeWalletSurface /> },
  batching: { eyebrow: "Smart batch ready", title: "Approve + swap + revoke", accent: palette.yellow, icon: <Layers3 size={16} />, body: <BatchingPanel /> },
  accounts: { eyebrow: "Hardware + multisig", title: "Ledger and Safe", accent: palette.green, icon: <WalletCards size={16} />, body: <TrustPanel /> },
  privacy: { eyebrow: "Privacy Pools", title: "Shielded ETH", accent: palette.yellow, icon: <EyeOff size={16} />, body: <TrustPanel /> },
  signing: { eyebrow: "Pre-sign review", title: "Asset changes decoded", accent: palette.green, icon: <ShieldCheck size={16} />, body: <SigningPanel /> },
  swap: { eyebrow: "Route inside wallet", title: "Swap / bridge preview", accent: palette.blue, icon: <Shuffle size={16} />, body: <SwapPanel /> },
  browser: { eyebrow: "Onchain browser", title: "ENS/IPFS resolved", accent: palette.cyan, icon: <Globe2 size={16} />, body: <BrowserPanel /> },
  chains: { eyebrow: "All EVM chains", title: "Network control", accent: palette.violet, icon: <GitBranch size={16} />, body: <ChainsPanel /> },
  trust: { eyebrow: "Private by design", title: "No tracking mode", accent: palette.green, icon: <LockKeyhole size={16} />, body: <TrustPanel /> },
  token: { eyebrow: "Powered by $WCHAN", title: "Wallet-native loop", accent: palette.yellow, icon: <Zap size={16} />, body: <TokenPanel /> },
};

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
