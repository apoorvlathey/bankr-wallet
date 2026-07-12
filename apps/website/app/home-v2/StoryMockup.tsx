"use client";

import { Box, Flex, HStack, Icon as ChakraIcon, IconButton, Image, Spacer, Text, VStack } from "@chakra-ui/react";
import { ChevronDownIcon, ExternalLinkIcon, LockIcon, SearchIcon, SettingsIcon } from "@chakra-ui/icons";
import { keyframes } from "@emotion/react";
import { AnimatePresence, motion } from "framer-motion";
import { BatchTransactionPreview } from "./BatchTransactionPreview";
import { palette } from "./design";
import { Mockup3DStage } from "./Mockup3DStage";
import { HomeWalletSurface, storyPanels, type StoryId } from "./StoryPanels";
import { SwapBridgePreview } from "./SwapBridgePreview";

export type { StoryId } from "./StoryPanels";

const MotionBox = motion(Box);
const ui = {
  bg: "#090b12",
  strip: "#111827",
  raised: "#171b26",
  border: "rgba(255,255,255,0.14)",
  borderStrong: "rgba(255,255,255,0.22)",
  text: "#f7f7f4",
  muted: "rgba(247,247,244,0.68)",
  faint: "rgba(247,247,244,0.44)",
  yellow: "#f5c542",
};
const preserve3d = { transformStyle: "preserve-3d" } as const;
const depths = { shell: "translateZ(8px)", card: "translateZ(46px)", pop: "translateZ(76px)" } as const;
const drawCalloutStroke = keyframes`
  from { stroke-dashoffset: 180; opacity: 0.35; }
  to { stroke-dashoffset: 0; opacity: 1; }
`;
const revealCalloutHead = keyframes`
  from { opacity: 0; transform: scale(0.72); }
  70% { opacity: 1; transform: scale(1.08); }
  to { opacity: 1; transform: scale(1); }
`;
const scribbleCharacter = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
  16% { transform: translate3d(0.25px, -0.2px, 0) rotate(-1.5deg); opacity: 0.96; }
  32% { transform: translate3d(-0.25px, 0.18px, 0) rotate(1.2deg); opacity: 1; }
  51% { transform: translate3d(0.18px, 0.22px, 0) rotate(-0.9deg); opacity: 0.94; }
  73% { transform: translate3d(-0.18px, -0.12px, 0) rotate(1.6deg); opacity: 1; }
`;
const browserResolving = keyframes`
  0%, 24% { opacity: 1; transform: translate3d(0, 0, 34px); pointer-events: auto; }
  29%, 100% { opacity: 0; transform: translate3d(-14px, 0, 34px); pointer-events: none; }
`;
const browserPage = keyframes`
  0%, 22% { opacity: 0; transform: translate3d(18px, 0, 18px); pointer-events: none; }
  29%, 68% { opacity: 1; transform: translate3d(0, 0, 18px); pointer-events: auto; }
  74%, 100% { opacity: 0; transform: translate3d(-12px, 0, 18px); pointer-events: none; }
`;
const browserTyping = keyframes`
  0%, 66% { opacity: 0; pointer-events: none; }
  74%, 100% { opacity: 1; pointer-events: auto; }
`;
const typeVitalik = keyframes`
  0%, 73% { width: 0ch; }
  82.5%, 100% { width: 11ch; }
`;
const caretBlink = keyframes`
  0%, 45% { opacity: 1; }
  46%, 100% { opacity: 0; }
`;
const resolverPulse = keyframes`
  0%, 100% { transform: scale(0.78); opacity: 0.5; }
  50% { transform: scale(1); opacity: 1; }
`;
const resolverSpin = keyframes`
  to { transform: rotate(360deg); }
`;
const chainOrbit = keyframes`
  to { transform: rotate(360deg); }
`;
const chainCounterOrbit = keyframes`
  to { transform: rotate(-360deg); }
`;
const chainFloat = keyframes`
  0%, 100% { transform: translate3d(0, 0, 26px) scale(1); }
  50% { transform: translate3d(0, -8px, 34px) scale(1.035); }
`;

const orbitChains = [
  { name: "Ethereum", icon: "/images/ethereum.svg", angle: -90, size: 48 },
  { name: "Base", icon: "/images/base.svg", angle: -45, size: 52 },
  { name: "BNB", icon: "/images/bsc.svg", angle: 0, size: 48 },
  { name: "Polygon", icon: "/images/polygon.svg", angle: 45, size: 48 },
  { name: "Unichain", icon: "/images/unichain.svg", angle: 90, size: 48 },
  { name: "MegaETH", icon: "/images/megaeth.svg", angle: 135, size: 48 },
  { name: "Optimism", icon: "/images/optimism.svg", angle: 180, size: 48 },
  { name: "Arbitrum", icon: "/images/arbitrum.svg", angle: 225, size: 48 },
] as const;

export function StoryMockup({ active }: { active: StoryId }) {
  const isBatching = active === "batching";
  const isSigning = active === "signing";
  const isSwap = active === "swap";
  const isBrowser = active === "browser";
  const isChains = active === "chains";
  const panel = active === "home" || isBatching || isSigning || isSwap || isBrowser || isChains ? null : storyPanels[active];

  if (isChains) {
    return (
      <Box
        position="relative"
        w="100%"
        maxW={{ base: "390px", sm: "520px", lg: "600px" }}
        minH={{ base: "520px", lg: "650px" }}
        ml={{ base: "auto", lg: 0 }}
        mr={{ base: "auto", lg: 0 }}
        transition="max-width 0.48s cubic-bezier(0.22, 1, 0.36, 1)"
      >
        <ChainOrbitGraphic />
      </Box>
    );
  }

  return (
    <Box
      position="relative"
      w="100%"
      maxW={isBrowser ? { base: "390px", sm: "620px", lg: "680px", xl: "720px" } : { base: "390px", sm: "420px", lg: "430px" }}
      ml={isBrowser ? { base: "auto", lg: "-70px", xl: "-92px" } : { base: "auto", lg: 0 }}
      mr={{ base: "auto", lg: 0 }}
      minH={isBrowser ? { base: "540px", lg: "600px" } : { base: "620px", lg: "680px" }}
      transform={isBrowser ? { base: "none", lg: "translate3d(38px, 58px, 0)", xl: "translate3d(54px, 68px, 0)" } : "none"}
      transition="max-width 0.48s cubic-bezier(0.22, 1, 0.36, 1), margin-left 0.48s cubic-bezier(0.22, 1, 0.36, 1)"
    >
      <Mockup3DStage>
        <Box position="absolute" inset="24px -6px 0 26px" borderRadius="34px" bg="rgba(108,140,255,0.09)" border="1px solid rgba(108,140,255,0.16)" transform="translateZ(-34px)" />
        <Box position="relative" bg={ui.bg} color={ui.text} border="1px solid" borderColor={ui.borderStrong} borderRadius="34px" boxShadow="0 34px 120px rgba(0,0,0,0.48)" overflow="visible" transform={depths.shell} sx={preserve3d}>
          {isBatching || isSigning ? (
            <BatchTransactionPreview depthFocus={isSigning ? "signing" : "batching"} />
          ) : isSwap ? (
            <SwapBridgePreview />
          ) : isBrowser ? (
            <BrowserWindowPreview />
          ) : (
            <>
              <PreviewHeader />
              <PoweredStrip />
              <Box p={3} sx={preserve3d}>
                <VStack spacing={3.5} align="stretch" sx={preserve3d}>
                  <AccountNetworkControls />
                  {active === "home" ? <HomeWalletSurface /> : <AnimatedStoryPanel active={active} panel={panel!} />}
                </VStack>
              </Box>
            </>
          )}
        </Box>
      </Mockup3DStage>
      {isBatching && <BatchingCallout />}
      {isSigning && <SigningCallouts />}
      {isBrowser && <BrowserCallout />}
    </Box>
  );
}

function ChainOrbitGraphic() {
  return (
    <Flex position="relative" minH={{ base: "520px", lg: "650px" }} align="center" justify="center" sx={{ perspective: "1100px", transformStyle: "preserve-3d" }}>
      <Box position="absolute" inset="8%" borderRadius="full" bg="radial-gradient(circle, rgba(177,140,255,0.18) 0%, rgba(97,230,166,0.08) 26%, rgba(9,11,18,0) 68%)" filter="blur(8px)" />
      <Box position="relative" w={{ base: "330px", sm: "460px", lg: "560px" }} h={{ base: "330px", sm: "460px", lg: "560px" }} sx={preserve3d}>
        <Box position="absolute" inset="8%" border="1px solid rgba(177,140,255,0.2)" borderRadius="full" transform="translateZ(-18px)" />
        <Box position="absolute" inset="19%" border="1px dashed rgba(97,230,166,0.18)" borderRadius="full" transform="translateZ(-10px)" />
        <Flex
          position="absolute"
          left="50%"
          top="50%"
          w={{ base: "118px", lg: "150px" }}
          h={{ base: "118px", lg: "150px" }}
          ml={{ base: "-59px", lg: "-75px" }}
          mt={{ base: "-59px", lg: "-75px" }}
          borderRadius="32px"
          align="center"
          justify="center"
          bg="rgba(255,255,255,0.06)"
          border="1px solid rgba(255,255,255,0.16)"
          boxShadow="0 24px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.12)"
          backdropFilter="blur(10px)"
          animation={`${chainFloat} 4.2s ease-in-out infinite`}
        >
          <Image src="/images/walletchan-icon-nobg.png" alt="WalletChan" w={{ base: "84px", lg: "108px" }} h={{ base: "84px", lg: "108px" }} />
        </Flex>
        <Box position="absolute" left="50%" top="50%" w="1px" h="1px" transform="translateZ(-46px)" zIndex={0}>
          <Flex
            position="absolute"
            left={{ base: "64px", lg: "94px" }}
            top={{ base: "74px", lg: "104px" }}
            px={4}
            py={2.5}
            borderRadius="999px"
            bg="rgba(177,140,255,0.14)"
            border="1px solid rgba(177,140,255,0.38)"
            color={palette.violet}
            fontSize={{ base: "11px", lg: "13px" }}
            fontWeight="900"
            whiteSpace="nowrap"
            boxShadow="0 16px 44px rgba(0,0,0,0.3)"
          >
            + Any Custom
            <br />
            EVM Chain
          </Flex>
        </Box>
        <Box position="absolute" inset="0" borderRadius="full" animation={`${chainOrbit} 28s linear infinite`} zIndex={4} sx={preserve3d}>
          {orbitChains.map((chain) => (
            <OrbitLogo key={chain.name} chain={chain} />
          ))}
        </Box>
      </Box>
    </Flex>
  );
}

function OrbitLogo({ chain }: { chain: (typeof orbitChains)[number] }) {
  return (
    <Flex
      position="absolute"
      left="50%"
      top="50%"
      w={`${chain.size}px`}
      h={`${chain.size}px`}
      ml={`-${chain.size / 2}px`}
      mt={`-${chain.size / 2}px`}
      align="center"
      justify="center"
      borderRadius="full"
      bg="#f7f7f4"
      border="1px solid rgba(255,255,255,0.18)"
      boxShadow="0 18px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.74)"
      style={{ transform: `rotate(${chain.angle}deg) translateX(232px) rotate(${-chain.angle}deg) translateZ(72px)` }}
      sx={preserve3d}
      role="group"
    >
      <Box position="relative" animation={`${chainCounterOrbit} 28s linear infinite`} transformOrigin="center">
        <Box
          position="absolute"
          left="50%"
          bottom="calc(100% + 10px)"
          transform="translateX(-50%)"
          px={3}
          py={1.5}
          borderRadius="999px"
          bg="rgba(9,11,18,0.94)"
          border="1px solid rgba(255,255,255,0.16)"
          color={ui.text}
          fontSize="11px"
          fontWeight="900"
          whiteSpace="nowrap"
          boxShadow="0 14px 36px rgba(0,0,0,0.42)"
          opacity={0}
          pointerEvents="none"
          transition="opacity 0.16s ease, transform 0.16s ease"
          _groupHover={{ opacity: 1, transform: "translateX(-50%) translateY(-3px)" }}
        >
          {chain.name}
        </Box>
        <Image src={chain.icon} alt={chain.name} w={`${Math.round(chain.size * 0.66)}px`} h={`${Math.round(chain.size * 0.66)}px`} borderRadius="full" objectFit="contain" />
      </Box>
    </Flex>
  );
}

function BatchingCallout() {
  return (
    <Box display={{ base: "none", xl: "block" }} pointerEvents="none" position="absolute" inset={0} zIndex={8}>
      <Box position="absolute" top="250px" right="-220px" w="210px" color={ui.yellow}>
        <ScribbleText label={"Batch multiple calls\nin 1 transaction"} />
        <Box
          as="svg"
          viewBox="0 0 130 78"
          position="absolute"
          top="36px"
          left="-102px"
          w="120px"
          h="72px"
          overflow="visible"
          transform="rotate(-5deg)"
        >
          <Box
            as="path"
            d="M118 12 A70 70 0 0 1 48 68"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="180"
            strokeDashoffset="180"
            sx={{ animation: `${drawCalloutStroke} 0.78s cubic-bezier(0.22, 1, 0.36, 1) 0.12s forwards` }}
          />
          <Box
            as="path"
            d="M47 69 L65 57 L68 76 Z"
            fill="currentColor"
            opacity={0}
            sx={{
              transformBox: "fill-box",
              transformOrigin: "50% 50%",
              animation: `${revealCalloutHead} 0.24s cubic-bezier(0.22, 1, 0.36, 1) 0.12s forwards`,
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

function SigningCallouts() {
  return (
    <>
      <Box
        display="none"
        pointerEvents="none"
        position="absolute"
        inset={0}
        zIndex={8}
        sx={{ "@media (min-width: 1180px)": { display: "block" } }}
      >
        <HandwrittenCallout top="112px" right={{ base: "-148px", xl: "-176px" }} label="Clear Signing" arrow="upper" />
        <HandwrittenCallout top="386px" right={{ base: "-160px", xl: "-190px" }} label={"Simulated\nToken Transfers"} arrow="lower" />
      </Box>
      <CompactSigningCallouts />
    </>
  );
}

function CompactSigningCallouts() {
  return (
    <Box
      display="none"
      pointerEvents="none"
      position="absolute"
      inset={0}
      zIndex={8}
      sx={{ "@media (min-width: 992px) and (max-width: 1179px)": { display: "block" } }}
    >
      <CompactCallout top="126px" right="18px" label="Clear Signing" />
      <CompactCallout top="432px" right="18px" label="Simulated Transfers" />
    </Box>
  );
}

function CompactCallout({ top, right, label }: { top: string; right: string; label: string }) {
  return (
    <Box position="absolute" top={top} right={right} color={ui.yellow}>
      <Text
        fontFamily="'Comic Sans MS', 'Bradley Hand', 'Segoe Print', cursive"
        fontSize="12px"
        lineHeight="1"
        fontWeight="900"
        letterSpacing="0"
        px={2.5}
        py={1.5}
        borderRadius="999px"
        bg="rgba(9,11,18,0.78)"
        border="1px solid rgba(245,197,66,0.22)"
        boxShadow="0 12px 30px rgba(0,0,0,0.34)"
        textShadow="0 2px 10px rgba(0,0,0,0.68)"
        whiteSpace="nowrap"
      >
        {label}
      </Text>
    </Box>
  );
}

function HandwrittenCallout({ top, right, label, arrow }: { top: string; right: string | { base: string; xl: string }; label: string; arrow: "upper" | "lower" }) {
  return (
    <Box position="absolute" top={top} right={right} w="152px" color={ui.yellow}>
      <ScribbleText label={label} />
      <Box
        as="svg"
        viewBox="0 0 128 78"
        position="absolute"
        top={arrow === "upper" ? "28px" : "42px"}
        left="-112px"
        w="120px"
        h="72px"
        overflow="visible"
        transform={arrow === "upper" ? "rotate(-6deg)" : "rotate(2deg)"}
      >
        <Box
          as="path"
          d="M118 12 A70 70 0 0 1 48 68"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="180"
          strokeDashoffset="180"
          sx={{ animation: `${drawCalloutStroke} 0.78s cubic-bezier(0.22, 1, 0.36, 1) 0.12s forwards` }}
        />
        <Box
          as="path"
          d="M47 69 L65 57 L68 76 Z"
          fill="currentColor"
          opacity={0}
          sx={{
            transformBox: "fill-box",
            transformOrigin: "50% 50%",
            animation: `${revealCalloutHead} 0.24s cubic-bezier(0.22, 1, 0.36, 1) 0.12s forwards`,
          }}
        />
      </Box>
    </Box>
  );
}

function ScribbleText({ label }: { label: string }) {
  let characterIndex = 0;

  return (
    <Text
      as="div"
      fontFamily="'Comic Sans MS', 'Bradley Hand', 'Segoe Print', cursive"
      fontSize="15px"
      lineHeight="0.98"
      fontWeight="900"
      letterSpacing="0"
      textShadow="0 2px 12px rgba(0,0,0,0.65)"
    >
      {label.split("\n").map((line, lineIndex) => (
        <Box as="span" display="block" key={`${line}-${lineIndex}`}>
          {Array.from(line).map((character) => {
            const index = characterIndex++;
            return (
              <Box
                as="span"
                display="inline-block"
                whiteSpace={character === " " ? "pre" : undefined}
                key={`${character}-${index}`}
                sx={{
                  animation: `${scribbleCharacter} ${0.82 + (index % 5) * 0.07}s steps(2, end) infinite`,
                  animationDelay: `${(index % 9) * -0.11}s`,
                  transformOrigin: "50% 70%",
                }}
              >
                {character}
              </Box>
            );
          })}
        </Box>
      ))}
    </Text>
  );
}

function BrowserCallout() {
  return (
    <Box display={{ base: "none", xl: "block" }} pointerEvents="none" position="absolute" inset={0} zIndex={8}>
      <Box position="absolute" top="68px" right="clamp(-270px, calc(-188px - (100vw - 1640px) * 0.36), -126px)" w="220px" color={ui.yellow}>
        <ScribbleText label={".eth works natively\nvia your local IPFS node"} />
        <Box as="svg" viewBox="0 0 130 78" position="absolute" top="32px" left="-102px" w="126px" h="76px" overflow="visible" transform="rotate(12deg)">
          <Box
            as="path"
            d="M118 12 A70 70 0 0 1 48 68"
            fill="none"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="180"
            strokeDashoffset="180"
            sx={{ animation: `${drawCalloutStroke} 0.78s cubic-bezier(0.22, 1, 0.36, 1) 0.12s forwards` }}
          />
          <Box
            as="path"
            d="M47 69 L65 57 L68 76 Z"
            fill="currentColor"
            opacity={0}
            sx={{
              transformBox: "fill-box",
              transformOrigin: "50% 50%",
              animation: `${revealCalloutHead} 0.24s cubic-bezier(0.22, 1, 0.36, 1) 0.12s forwards`,
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

function BrowserWindowPreview() {
  return (
    <Box borderRadius="30px" overflow="hidden" sx={preserve3d}>
      <BrowserChrome />
      <Box position="relative" h={{ base: "410px", lg: "492px" }} bg="#101112" overflow="hidden" borderBottomRadius="30px">
        <Box position="absolute" inset={0} animation={`${browserResolving} 9.2s linear infinite`} sx={preserve3d}>
          <EnsResolvingInterstitial />
        </Box>
        <Box position="absolute" inset={0} animation={`${browserPage} 9.2s linear infinite`} sx={preserve3d}>
          <Image src="/images/home-v2/vitalik-eth-limo.png" alt="Vitalik Buterin website loaded through ENS" w="100%" h="100%" objectFit="cover" objectPosition="center top" />
          <WalletChanEnsBanner />
        </Box>
        <Box position="absolute" inset={0} animation={`${browserTyping} 9.2s linear infinite`}>
          <Box position="absolute" inset={0} opacity={0.55} backgroundImage="linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)" backgroundSize="34px 34px" />
          <Flex h="100%" align="center" justify="center" direction="column" gap={3} color={ui.faint}>
            <SearchIcon boxSize={8} />
            <Text fontSize="13px" fontWeight="900" textTransform="uppercase" letterSpacing="0.08em">Type any ENS site</Text>
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}

function BrowserChrome() {
  return (
    <Box bg="#151a26" borderBottom="1px solid" borderColor={ui.borderStrong} borderTopRadius="30px" px={3.5} pt={3} pb={2.5} transform="translateZ(10px)">
      <HStack spacing={2.5} align="center">
        <HStack spacing={1.5} flexShrink={0}>
          {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
            <Box key={color} w="9px" h="9px" borderRadius="full" bg={color} />
          ))}
        </HStack>
        <HStack flex={1} minW={0} h="36px" borderRadius="999px" bg="#0b0d13" border="1px solid rgba(255,255,255,0.12)" px={3} spacing={2} overflow="hidden">
          <LockIcon color={ui.faint} boxSize={3.5} flexShrink={0} />
          <Box position="relative" flex="1" minW={0} h="18px" fontFamily="mono" fontWeight="900" fontSize="13px" color={ui.text}>
            <Text position="absolute" inset={0} noOfLines={1} animation={`${browserResolving} 9.2s linear infinite`} color={ui.muted}>walletchan://ens/vitalik.eth</Text>
            <Text position="absolute" inset={0} noOfLines={1} animation={`${browserPage} 9.2s linear infinite`}>vitalik.eth</Text>
            <HStack position="absolute" inset={0} spacing={0} animation={`${browserTyping} 9.2s linear infinite`}>
              <Box as="span" display="inline-block" overflow="hidden" whiteSpace="nowrap" animation={`${typeVitalik} 9.2s steps(11, end) infinite`}>
                vitalik.eth
              </Box>
              <Box as="span" w="2px" h="16px" bg={ui.yellow} ml="1px" animation={`${caretBlink} 0.7s steps(1, end) infinite`} />
            </HStack>
          </Box>
          <HStack spacing={1} color="#61e6a6" fontSize="10px" fontWeight="900" flexShrink={0}>
            <Box w="7px" h="7px" borderRadius="full" bg="#61e6a6" animation={`${resolverPulse} 1.1s ease-in-out infinite`} />
            <Text display={{ base: "none", md: "block" }} textTransform="uppercase">Local Kubo</Text>
          </HStack>
        </HStack>
      </HStack>
    </Box>
  );
}

function EnsResolvingInterstitial() {
  return (
    <Flex h="100%" align="center" justify="center" p={6}>
      <Box position="relative" maxW="430px" w="100%" p={5} borderRadius="22px" bg="#171b26" border="1px solid rgba(255,255,255,0.18)" boxShadow="0 18px 60px rgba(0,0,0,0.34)" transform="translateZ(48px)">
        <VStack align="stretch" spacing={5}>
          <HStack spacing={3}>
            <Box p={1.5} bg="#111827" border="1px solid rgba(255,255,255,0.16)" borderRadius="12px">
              <Image src="/images/walletchan-animated.gif" alt="" w="32px" h="32px" borderRadius="8px" />
            </Box>
            <Text fontSize="10px" color={ui.faint} letterSpacing="0.08em" fontWeight="900">
              WALLETCHAN · DAPP3 - ENS BROWSING
            </Text>
          </HStack>
          <VStack align="start" spacing={2}>
            <HStack spacing={2} color={ui.muted}>
              <Box w="13px" h="13px" borderRadius="full" border="2px solid rgba(255,255,255,0.18)" borderTopColor={ui.yellow} sx={{ animation: `${resolverSpin} 0.6s linear infinite` }} />
              <Text fontSize="11px" fontWeight="900" letterSpacing="0.08em" textTransform="uppercase">Resolving</Text>
            </HStack>
            <Text fontFamily="mono" fontWeight="900" fontSize={{ base: "26px", lg: "32px" }} color={ui.text} lineHeight="1.1">
              vitalik.eth
            </Text>
          </VStack>
          <Box borderTop="1px solid rgba(255,255,255,0.12)" pt={3}>
            <Text fontSize="11px" color={ui.faint}>
              Manage in <Text as="span" fontWeight="900" color={ui.muted}>Settings - dapp3 - ENS Browsing</Text>
            </Text>
          </Box>
        </VStack>
      </Box>
    </Flex>
  );
}

function WalletChanEnsBanner() {
  return (
    <HStack position="absolute" left={4} right={4} bottom={4} spacing={3} borderRadius="18px" bg="rgba(9,11,18,0.82)" border="1px solid rgba(255,255,255,0.16)" color={ui.text} px={3.5} py={3} backdropFilter="blur(10px)" transform="translateZ(58px)">
      <Image src="/images/walletchan-icon-nobg.png" alt="" w="30px" h="30px" />
      <Box minW={0}>
        <Text fontSize="12px" fontWeight="900" color={ui.yellow}>vitalik.eth resolved</Text>
        <Text fontSize="11px" color={ui.faint} noOfLines={1}>ENS contenthash served through your local IPFS gateway</Text>
      </Box>
      <Spacer />
      <ExternalLinkIcon color={ui.yellow} boxSize={4} />
    </HStack>
  );
}

function PreviewHeader() {
  const buttonProps = {
    variant: "ghost" as const,
    size: "sm" as const,
    color: ui.text,
    h: "30px",
    minW: "30px",
    borderRadius: "10px",
    _hover: { bg: "rgba(255,255,255,0.1)" },
  };

  return (
    <Flex py={2.5} px={4} bg={ui.strip} color={ui.text} align="center" borderBottom="1px solid" borderColor={ui.border} borderTopRadius="34px" sx={preserve3d}>
      <HStack spacing={2}>
        <Image src="/images/walletchan-icon-nobg.png" alt="WalletChan" h="36px" w="36px" />
        <Text fontWeight="900" fontSize="18px" textTransform="uppercase" letterSpacing="0">WalletChan</Text>
      </HStack>
      <Spacer />
      <HStack spacing={1}>
        <IconButton aria-label="Lock wallet" icon={<LockIcon />} {...buttonProps} />
        <IconButton aria-label="Switch layout" icon={<SidePanelIcon />} {...buttonProps} />
        <IconButton aria-label="Open fullscreen" icon={<FullscreenIcon />} {...buttonProps} />
        <IconButton aria-label="Settings" icon={<SettingsIcon />} {...buttonProps} />
      </HStack>
    </Flex>
  );
}

function PoweredStrip() {
  return (
    <HStack spacing={0} align="stretch" borderBottom="1px solid" borderColor={ui.border}>
      <HStack flex="1" bg="#2c1e06" py={1.5} pl={3} pr={2} spacing={2}>
        <Text fontSize="11px" fontWeight="900" color="#c9b27d" textTransform="uppercase">Powered by</Text>
        <Text color={ui.yellow} fontWeight="900" fontSize="12px" textTransform="uppercase">$WCHAN</Text>
      </HStack>
      <Box w="28px" alignSelf="stretch" bgGradient="linear(110deg, #2c1e06 50%, #111832 50%)" flexShrink={0} />
      <HStack flex="1" bg="#111832" py={1.5} px={3} spacing={1} justify="flex-end">
        <Text fontSize="11px" fontWeight="900" color={ui.yellow} textTransform="uppercase" whiteSpace="nowrap">WalletChan OS</Text>
        <ExternalLinkIcon boxSize={3} color={ui.yellow} />
      </HStack>
    </HStack>
  );
}

function AccountNetworkControls() {
  return (
    <HStack spacing={2} align="stretch" sx={preserve3d}>
      <HStack flex={1} minW="0" minH="76px" p={2.5} spacing={2} borderRadius="18px" bg={ui.raised} border="3px solid rgba(49,56,82,0.95)" transform={depths.card}>
        <Image src="/images/walletchan-icon.png" alt="" w="28px" h="28px" borderRadius="full" />
        <Box minW={0} flex="1">
          <Text color={ui.text} fontSize="17px" fontWeight="900" whiteSpace="nowrap">walletchan.eth</Text>
          <HStack spacing={2} mt={1}>
            <Text color={ui.faint} fontSize="13px" fontWeight="900" whiteSpace="nowrap">0xab7d...10e6</Text>
            <Text px={1.5} py="1px" borderRadius="999px" bg="rgba(132,92,246,0.2)" border="1px solid rgba(132,92,246,0.7)" color="#bda8ff" fontSize="8px" fontWeight="900" textTransform="uppercase" whiteSpace="nowrap">Private key</Text>
          </HStack>
        </Box>
        <ChevronDownIcon color={ui.muted} />
      </HStack>
      <HStack flex="0 0 146px" minH="76px" p={2.5} spacing={2} borderRadius="18px" bg={ui.raised} border="3px solid rgba(49,56,82,0.95)" transform={depths.card}>
        <Image src="/images/base.svg" alt="" w="30px" h="30px" borderRadius="full" />
        <Box minW={0}>
          <Text color={ui.faint} fontSize="9px" fontWeight="900" textTransform="uppercase">Network</Text>
          <Text color={ui.text} fontSize="15px" fontWeight="900">Base</Text>
        </Box>
        <Spacer />
        <ChevronDownIcon color={ui.muted} />
      </HStack>
    </HStack>
  );
}

function AnimatedStoryPanel({ active, panel }: { active: StoryId; panel: (typeof storyPanels)[StoryId] }) {
  return (
    <Box borderRadius="24px" bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} minH="442px" p={3.5} overflow="visible" transform={depths.card} sx={preserve3d}>
      <AnimatePresence mode="wait" initial={false}>
        <MotionBox key={active} initial={{ opacity: 0, y: 18, rotateX: -4 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -14, rotateX: 4 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} sx={preserve3d}>
          <HStack justify="space-between" mb={4} transform={depths.pop}>
            <HStack color={panel.accent}>{panel.icon}<Text fontSize="11px" fontWeight="900" textTransform="uppercase">{panel.eyebrow}</Text></HStack>
            <Text color={ui.faint} fontSize="11px" fontWeight="900">app.uniswap.org</Text>
          </HStack>
          <Text color={ui.text} fontSize="28px" lineHeight="0.98" fontWeight="900" letterSpacing="0" transform={depths.pop}>{panel.title}</Text>
          <Box mt={4} sx={preserve3d}>{panel.body}</Box>
        </MotionBox>
      </AnimatePresence>
    </Box>
  );
}

const SidePanelIcon = (props: any) => (
  <ChakraIcon viewBox="0 0 24 24" {...props}><path fill="currentColor" d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 2v14h5V5h-5zM4 5v14h10V5H4z" /></ChakraIcon>
);

const FullscreenIcon = (props: any) => (
  <ChakraIcon viewBox="0 0 24 24" {...props}><path fill="currentColor" d="M14 3v2h3.59l-4.3 4.29 1.42 1.42L19 6.41V10h2V3h-7zM5 17.59V14H3v7h7v-2H6.41l4.3-4.29-1.42-1.42L5 17.59z" /></ChakraIcon>
);
