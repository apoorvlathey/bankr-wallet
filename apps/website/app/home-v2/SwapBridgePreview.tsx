"use client";

import { useEffect, useState } from "react";
import { Badge, Box, Flex, HStack, Icon as ChakraIcon, IconButton, Image, Spacer, Text, VStack } from "@chakra-ui/react";
import { ArrowBackIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon, SettingsIcon } from "@chakra-ui/icons";
import { keyframes } from "@emotion/react";
import { warmMockup } from "./design";

const ui = {
  bg: warmMockup.base,
  raised: warmMockup.surface,
  sunken: warmMockup.sunken,
  border: warmMockup.border,
  borderStrong: warmMockup.borderStrong,
  text: warmMockup.text,
  muted: warmMockup.secondary,
  faint: warmMockup.muted,
  blue: warmMockup.blue,
  yellow: warmMockup.amber,
  purple: warmMockup.blueSoft,
};

const preserve3d = { transformStyle: "preserve-3d" } as const;
const FACE_RADIUS = 238;
const ctaPressBounce = keyframes`
  0% {
    transform: translateZ(82px) scale(1);
    box-shadow: 0 18px 28px rgba(0,0,0,0.34);
    filter: brightness(1);
  }
  42% {
    transform: translate3d(0, 2px, 62px) scale(0.99);
    box-shadow: 0 10px 16px rgba(0,0,0,0.28);
    filter: brightness(0.94);
  }
  72% {
    transform: translate3d(0, -1px, 76px) scale(1.003);
    box-shadow: 0 16px 24px rgba(0,0,0,0.32);
    filter: brightness(1.02);
  }
  100% {
    transform: translate3d(0, 1px, 70px) scale(0.996);
    box-shadow: 0 13px 20px rgba(0,0,0,0.3);
    filter: brightness(0.98);
  }
`;

const frames = ["bridge-entry", "bridge-confirm", "swap-entry", "swap-confirm"] as const;
type Frame = (typeof frames)[number];

export function SwapBridgePreview() {
  const [rotationStep, setRotationStep] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  const activeFrameIndex = rotationStep % frames.length;

  useEffect(() => {
    setIsPressing(false);
    const pressTimer = window.setTimeout(() => setIsPressing(true), 2140);
    const advanceTimer = window.setTimeout(() => {
      setIsPressing(false);
      setRotationStep((step) => step + 1);
    }, 2600);
    return () => {
      window.clearTimeout(pressTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [rotationStep]);

  return (
    <Box bg={ui.bg} color={ui.text} p={3} minH="680px" borderRadius="34px" overflow="visible" position="relative" sx={{ ...preserve3d, perspective: "1100px" }}>
      <Box
        position="absolute"
        inset={0}
        transform={`translateZ(-${FACE_RADIUS}px) rotateY(${-rotationStep * 90}deg)`}
        transition="transform 0.82s cubic-bezier(0.22, 1, 0.36, 1)"
        willChange="transform"
        sx={{ ...preserve3d, transformOrigin: "center center", backfaceVisibility: "hidden" }}
      >
        {frames.map((frame, index) => {
          const distance = getFaceDistance(index, activeFrameIndex);
          const isActive = distance === 0;

          return (
            <Box
              key={frame}
              position="absolute"
              top={3}
              bottom={3}
              left={3}
              right={3}
              pointerEvents={isActive ? "auto" : "none"}
              sx={{
                ...preserve3d,
                backfaceVisibility: "hidden",
                transform: `rotateY(${index * 90}deg) translateZ(${FACE_RADIUS}px)`,
              }}
            >
              {renderFrame(frame, index === activeFrameIndex && isPressing)}
              {!isActive && (
                <Box
                  pointerEvents="none"
                  position="absolute"
                  inset="-18px"
                  borderRadius="42px"
                  bg={distance === 1 ? "rgba(5,7,12,0.68)" : "rgba(5,7,12,0.88)"}
                  backdropFilter={distance === 1 ? "blur(4px) saturate(0.65)" : "blur(7px) saturate(0.45)"}
                  boxShadow={
                    distance === 1
                      ? "inset 0 0 140px rgba(0,0,0,0.72), inset 0 0 40px rgba(5,7,12,0.9), 0 42px 110px rgba(0,0,0,0.68)"
                      : "inset 0 0 180px rgba(0,0,0,0.86), inset 0 0 70px rgba(5,7,12,0.95), 0 54px 130px rgba(0,0,0,0.78)"
                  }
                  transform="translateZ(190px)"
                  sx={{ backfaceVisibility: "hidden" }}
                />
              )}
            </Box>
          );
        })}
      </Box>
      <AmbientSideFog side="left" />
      <AmbientSideFog side="right" />
    </Box>
  );
}

function AmbientSideFog({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";

  return (
    <Box
      pointerEvents="none"
      position="absolute"
      top="-40px"
      bottom="-40px"
      left={isLeft ? "-170px" : undefined}
      right={isLeft ? undefined : "-260px"}
      w={isLeft ? "190px" : "280px"}
      zIndex={2}
      bg={
        isLeft
          ? "linear-gradient(90deg, rgba(5,7,12,0) 0%, rgba(5,7,12,0.42) 54%, rgba(5,7,12,0.88) 100%)"
          : "linear-gradient(270deg, rgba(5,7,12,0) 0%, rgba(5,7,12,0.56) 46%, rgba(5,7,12,0.94) 100%)"
      }
      backdropFilter="blur(4px)"
      boxShadow={isLeft ? "48px 0 90px rgba(0,0,0,0.42)" : "-48px 0 90px rgba(0,0,0,0.42)"}
      sx={{
        WebkitMaskImage: isLeft
          ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.22) 42%, #000 100%)"
          : "linear-gradient(270deg, transparent 0%, rgba(0,0,0,0.3) 38%, #000 100%)",
        maskImage: isLeft
          ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.22) 42%, #000 100%)"
          : "linear-gradient(270deg, transparent 0%, rgba(0,0,0,0.3) 38%, #000 100%)",
      }}
    />
  );
}

function getFaceDistance(index: number, activeIndex: number) {
  const forward = (index - activeIndex + frames.length) % frames.length;
  const backward = (activeIndex - index + frames.length) % frames.length;
  return Math.min(forward, backward);
}

function renderFrame(frame: Frame, isPressing: boolean) {
  if (frame === "bridge-entry") return <SwapEntryScreen mode="bridge" isPressing={isPressing} />;
  if (frame === "bridge-confirm") return <ConfirmScreen mode="bridge" isPressing={isPressing} />;
  if (frame === "swap-entry") return <SwapEntryScreen mode="swap" isPressing={isPressing} />;
  return <ConfirmScreen mode="swap" isPressing={isPressing} />;
}

function SwapEntryScreen({ mode, isPressing }: { mode: "bridge" | "swap"; isPressing: boolean }) {
  const isBridge = mode === "bridge";

  return (
    <VStack align="stretch" spacing={3} sx={preserve3d}>
      <SwapHeader />
      <SwapAmountCard
        label="You Sell"
        token="USDC"
        tokenIcon="usdc"
        amount="100"
        topRight="$100.01"
        modeLabel="USD"
        address="0x8335...2913"
        balance="BAL: 296.009 ($296.04)"
        slider
        raised
      />
      <Flex justify="center" my={-0.5} transform="translateZ(78px)">
        <Flex w="38px" h="38px" borderRadius="10px" bg={ui.purple} border="1px solid" borderColor={ui.borderStrong} boxShadow="0 8px 18px rgba(0,0,0,0.24)" align="center" justify="center">
          <SwapArrowIcon boxSize={5} />
        </Flex>
      </Flex>
      <SwapAmountCard
        label="You Receive"
        token={isBridge ? "ETH" : "USDT"}
        tokenIcon={isBridge ? "eth" : "usdt"}
        chainIcon={isBridge ? "/images/ethereum.svg" : "/images/base.svg"}
        amount={isBridge ? "0.056537" : "99.721226"}
        address={isBridge ? undefined : "0xfde4...9bb2"}
        quote={isBridge ? "~$99.13 (-0.88%)" : "~$99.57 (-0.44%)"}
        raised
      />
      <HStack mt={5} mb={2.5} minH="18px" justify={isBridge ? "space-between" : "flex-end"} color={ui.muted} transform="translateZ(24px)">
        {isBridge && (
          <HStack spacing={1}>
            <ClockIcon boxSize={3.5} />
            <Text fontSize="11px" fontWeight="900">Est. time: 1 min</Text>
          </HStack>
        )}
        <HStack spacing={1}>
          <Text fontSize="11px" fontWeight="900">3% slippage</Text>
          <SettingsIcon boxSize={3} />
        </HStack>
      </HStack>
      <MinReceivedRow token={isBridge ? "ETH" : "USDT"} amount={isBridge ? "0.056537" : "96.7284"} usd={isBridge ? "~$99.13" : "~$96.58"} />
      <PrimaryAction label={isBridge ? "Bridge" : "Swap"} isPressing={isPressing} />
    </VStack>
  );
}

function ConfirmScreen({ mode, isPressing }: { mode: "bridge" | "swap"; isPressing: boolean }) {
  const isBridge = mode === "bridge";

  return (
    <VStack align="stretch" spacing={2.5} sx={preserve3d}>
      <HStack>
        <IconButton aria-label="Back" icon={<ArrowBackIcon boxSize={5} />} variant="ghost" color={ui.text} minW="30px" h="30px" borderRadius="10px" _hover={{ bg: "rgba(255,255,255,0.08)" }} />
      </HStack>
      <TitleBanner title={isBridge ? "Confirm Bridge" : "Confirm Swap"} />
      <Box mt={3} bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} borderRadius="12px" overflow="hidden" boxShadow="0 20px 34px rgba(0,0,0,0.3)" transform="translateZ(92px)">
        <ConfirmAssetRow label="You Sell" token="USDC" icon="usdc" amount="100 USDC" usd="$100.01" />
        <Box position="relative" h="26px">
          <Box position="absolute" top="50%" left={0} right={0} h="1px" bg={ui.border} />
          <Flex position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" w="30px" h="30px" borderRadius="full" bg={ui.blue} border="1px solid" borderColor={ui.borderStrong} align="center" justify="center">
            <ArrowDownIcon boxSize={4} />
          </Flex>
        </Box>
        <ConfirmAssetRow label="You Receive (est.)" token={isBridge ? "ETH" : "USDT"} icon={isBridge ? "eth" : "usdt"} amount={isBridge ? "0.056579 ETH" : "99.7222 USDT"} usd={isBridge ? "$99.13" : "$99.57"} />
        <HStack px={3} py={2} borderTop="1px solid" borderColor={ui.border} justify="space-between">
          <Text fontSize="12px" color={ui.muted} fontWeight="900" textTransform="uppercase">{isBridge ? "Route" : "Network"}</Text>
          {isBridge ? (
            <HStack spacing={1.5}>
              <ChainBadge icon="/images/base.svg" label="Base" />
              <Text fontSize="16px" fontWeight="900" color={ui.muted}>→</Text>
              <ChainBadge icon="/images/ethereum.svg" label="Ethereum" />
            </HStack>
          ) : (
            <ChainBadge icon="/images/base.svg" label="Base" />
          )}
        </HStack>
        {isBridge && (
          <HStack px={3} py={2} borderTop="1px solid" borderColor={ui.border} justify="space-between">
            <Text fontSize="12px" color={ui.muted} fontWeight="900" textTransform="uppercase">Bridge</Text>
            <HStack spacing={2}><Text fontSize="12px" fontWeight="900">Across</Text><Text fontSize="12px" fontWeight="900" color={ui.muted}>~1m</Text></HStack>
          </HStack>
        )}
      </Box>
      <TransactionsList mode={mode} />
      <GasFee amount={isBridge ? "0.00005790227490768 ETH (~$0.10)" : "0.000016567422892702 ETH (~$0.03)"} />
      <HStack spacing={2} pt={1} sx={preserve3d}>
        <Flex flex={1} h="46px" borderRadius="10px" bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} align="center" justify="center" fontSize="16px" fontWeight="600" transform="translateZ(28px)">
          Cancel
        </Flex>
        <Flex
          flex={1}
          h="46px"
          borderRadius="10px"
          bg={ui.yellow}
          color="#121212"
          border="1px solid"
          borderColor={ui.borderStrong}
          align="center"
          justify="center"
          fontSize="16px"
          fontWeight="900"
          boxShadow="0 18px 28px rgba(0,0,0,0.34)"
          transform="translateZ(82px)"
          animation={isPressing ? `${ctaPressBounce} 0.46s cubic-bezier(0.22, 1, 0.36, 1) both` : undefined}
        >
          {isBridge ? "Confirm Bridge" : "Confirm Swap"}
        </Flex>
      </HStack>
    </VStack>
  );
}

function SwapHeader() {
  return (
    <HStack spacing={2} minH="66px" pb={4} w="full" minW={0} transform="translateZ(36px)" position="relative" zIndex={3}>
      <IconButton aria-label="Back" icon={<ArrowBackIcon boxSize={5} />} variant="ghost" color={ui.text} flex="0 0 34px" minW="34px" h="34px" borderRadius="10px" transform="translateZ(12px)" _hover={{ bg: "rgba(255,255,255,0.08)" }} />
      <Text flex={1} minW={0} fontSize="22px" fontWeight="900" textTransform="uppercase" letterSpacing="0" noOfLines={1}>Swap / Bridge</Text>
      <HStack spacing={1.25} flexShrink={0} maxW="142px" minW={0}>
        <Image src="/images/walletchan-icon-nobg.png" alt="" boxSize="28px" flexShrink={0} />
        <Box minW={0}>
          <Text fontSize="11px" fontWeight="900" lineHeight="1" noOfLines={1}>walletchan.eth</Text>
          <Text fontFamily="mono" fontSize="10px" fontWeight="700" color={ui.faint} noOfLines={1}>0xab7d...10e6</Text>
        </Box>
      </HStack>
    </HStack>
  );
}

function SwapAmountCard({
  label,
  token,
  tokenIcon,
  chainIcon = "/images/base.svg",
  amount,
  topRight,
  modeLabel,
  address,
  balance,
  quote,
  slider,
  raised,
}: {
  label: string;
  token: string;
  tokenIcon: TokenIconKind;
  chainIcon?: string;
  amount: string;
  topRight?: string;
  modeLabel?: string;
  address?: string;
  balance?: string;
  quote?: string;
  slider?: boolean;
  raised?: boolean;
}) {
  return (
    <Box bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} borderRadius="12px" p={3} boxShadow={raised ? "0 20px 34px rgba(0,0,0,0.3)" : "0 10px 22px rgba(0,0,0,0.22)"} transform={raised ? "translateZ(92px)" : undefined}>
      <HStack mb={2} justify="space-between">
        <Text fontSize="12px" color={ui.muted} fontWeight="900" textTransform="uppercase">{label}</Text>
        {topRight && (
          <HStack spacing={1}>
            <Text fontSize="12px" color={ui.faint} fontWeight="900">{topRight}</Text>
            <Text fontSize="12px" color={ui.blue} fontWeight="900">{modeLabel}</Text>
            <SwapArrowIcon boxSize={3} color={ui.blue} />
          </HStack>
        )}
      </HStack>
      <HStack spacing={2}>
        <TokenButton token={token} icon={tokenIcon} chainIcon={chainIcon} />
        <HStack flex={1} h="46px" px={3} borderRadius="10px" border="1px solid" borderColor={topRight ? ui.blue : ui.borderStrong} bg={ui.sunken}>
          <Text fontFamily="mono" fontSize="18px" color={ui.text}>{amount}</Text>
          {topRight && <Spacer />}
          {topRight && <Text color={ui.blue} fontSize="14px" fontWeight="900">MAX</Text>}
        </HStack>
      </HStack>
      {(address || balance || quote) && (
        <HStack mt={2} color={ui.faint} justify="space-between" minH="18px">
          {address ? <AddressMini value={address} /> : <Box />}
          {balance && <Text fontSize="11px" fontWeight="700" textAlign="right">{balance}</Text>}
          {quote && <Text fontSize="12px" fontWeight="900" textAlign="right">{quote}</Text>}
        </HStack>
      )}
      {slider && <SliderMock />}
    </Box>
  );
}

function TokenButton({ token, icon, chainIcon }: { token: string; icon: TokenIconKind; chainIcon: string }) {
  return (
    <HStack h="46px" minW="126px" px={2.5} borderRadius="10px" border="1px solid" borderColor={ui.borderStrong} bg={ui.sunken}>
      <TokenIcon kind={icon} size="28px" chainBadge={chainIcon} />
      <Text fontSize="16px" fontWeight="900">{token}</Text>
      <ChevronDownIcon color={ui.muted} />
    </HStack>
  );
}

function SliderMock() {
  return (
    <Box px={1} pt={3} pb={1}>
      <Box position="relative" h="7px" borderRadius="full" bg={ui.sunken}>
        <Box position="absolute" left={0} top={0} bottom={0} w="34%" borderRadius="full" bg={ui.blue} />
        <Box position="absolute" left="32%" top="50%" transform="translate(-50%, -50%)" boxSize="22px" borderRadius="full" bg={ui.blue} border="2px solid" borderColor={ui.raised} />
      </Box>
      <HStack justify="space-between" mt={2.5}>
        {["0%", "25%", "50%", "75%", "100%"].map((pct, index) => <Text key={pct} fontSize="11px" fontWeight="900" color={index < 2 ? ui.blue : ui.faint}>{pct}</Text>)}
      </HStack>
    </Box>
  );
}

function MinReceivedRow({ token, amount, usd }: { token: string; amount: string; usd: string }) {
  return (
    <HStack mt={-5} bg={ui.sunken} border="1px solid" borderColor={ui.borderStrong} borderRadius="10px" px={3} py={2.5} justify="space-between" transform="translateZ(40px)">
      <Text fontSize="12px" color={ui.muted} fontWeight="900" textTransform="uppercase">Min. Received</Text>
      <VStack align="end" spacing={0}>
        <HStack spacing={1}><Text fontSize="15px" fontWeight="900">{amount} {token}</Text><ChevronDownIcon color={ui.muted} /></HStack>
        <Text fontSize="12px" color={ui.faint} fontWeight="900">{usd}</Text>
      </VStack>
    </HStack>
  );
}

function PrimaryAction({ label, isPressing }: { label: string; isPressing: boolean }) {
  return (
    <Flex
      h="50px"
      borderRadius="17px"
      bg={ui.purple}
      border="1px solid"
      borderColor={ui.borderStrong}
      align="center"
      justify="center"
      fontSize="18px"
      fontWeight="900"
      boxShadow="0 18px 28px rgba(0,0,0,0.34)"
      transform="translateZ(82px)"
      animation={isPressing ? `${ctaPressBounce} 0.46s cubic-bezier(0.22, 1, 0.36, 1) both` : undefined}
    >
      {label}
    </Flex>
  );
}

function TitleBanner({ title }: { title: string }) {
  return (
    <HStack justify="center" spacing={2} bg={ui.blue} color={ui.text} py={2} px={3} borderRadius="10px" border="1px solid" borderColor={ui.borderStrong} boxShadow="0 8px 20px rgba(0,0,0,0.24)" transform="translateZ(70px)">
      <Text fontSize="15px" fontWeight="900" textTransform="uppercase" letterSpacing="0.05em">{title}</Text>
      <Badge bg={ui.yellow} color="#121212" border="1.5px solid #121212" borderRadius="8px" fontSize="10px" fontWeight="900" px={2}>ATOMIC</Badge>
    </HStack>
  );
}

function ConfirmAssetRow({ label, token, icon, amount, usd }: { label: string; token: string; icon: TokenIconKind; amount: string; usd: string }) {
  return (
    <HStack px={3} py={2.5} spacing={3}>
      <TokenIcon kind={icon} size="32px" />
      <VStack align="start" spacing={0} minW={0} flex={1}>
        <Text fontSize="12px" color={ui.faint} fontWeight="900" textTransform="uppercase">{label}</Text>
        <Text fontSize="16px" fontWeight="900" noOfLines={1}>{amount}</Text>
      </VStack>
      <Text fontSize="14px" color={ui.muted} fontWeight="900">{usd}</Text>
    </HStack>
  );
}

function TransactionsList({ mode }: { mode: "bridge" | "swap" }) {
  const isBridge = mode === "bridge";
  const rows = isBridge
    ? [["Approve USDC for bridge", "0x8335...2913"], ["Bridge USDC → Ethereum", "0x3a23...97a5"]]
    : [["Approve USDC for swap", "0x8335...2913"], ["Swap USDC to USDT", "0x0000...2734"]];

  return (
    <VStack spacing={1.5} align="stretch" transform="translateZ(60px)">
      <Text px={0.5} fontSize="12px" fontWeight="900" color={ui.muted} textTransform="uppercase">Transactions (batched)</Text>
      {rows.map(([title, to], index) => <TransactionRow key={title} index={index + 1} title={title} to={to} />)}
    </VStack>
  );
}

function TransactionRow({ index, title, to }: { index: number; title: string; to: string }) {
  const accent = index === 1 ? ui.purple : ui.blue;
  return (
    <HStack position="relative" minH="42px" pl={3} pr={2.5} py={2} bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} borderRadius="14px" overflow="hidden">
      <Box position="absolute" left={0} top={0} bottom={0} w="4px" bg={accent} />
      <Flex w="22px" h="22px" borderRadius="8px" bg={accent} color={ui.text} border="1px solid rgba(255,255,255,0.25)" align="center" justify="center" fontSize="12px" fontWeight="900">{index}</Flex>
      <Text flex={1} minW={0} fontSize="12px" fontWeight="900" noOfLines={1}>{title}</Text>
      <Text fontFamily="mono" fontSize="11px" color={ui.faint}>{to}</Text>
      <ChevronDownIcon boxSize={4} color={ui.muted} />
    </HStack>
  );
}

function GasFee({ amount }: { amount: string }) {
  return (
    <HStack mt={4} minH="42px" px={3} bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} borderRadius="14px" transform="translateZ(28px)">
      <Text fontSize="12px" fontWeight="900" color={ui.muted} textTransform="uppercase">Gas Fee</Text>
      <Spacer />
      <Text fontFamily="mono" fontSize="12px" fontWeight="900">{amount}</Text>
      <ChevronDownIcon color={ui.muted} />
    </HStack>
  );
}

function ChainBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <HStack px={2} py={1} borderRadius="8px" bg="rgba(255,255,255,0.94)" color={ui.blue} border="1.5px solid" borderColor={ui.blue} spacing={1}>
      <Image src={icon} alt="" boxSize="14px" borderRadius="full" />
      <Text fontSize="12px" fontWeight="900">{label}</Text>
    </HStack>
  );
}

function AddressMini({ value }: { value: string }) {
  return (
    <HStack spacing={1} color={ui.faint}>
      <Text fontFamily="mono" fontSize="11px" fontWeight="700">{value}</Text>
      <CopyIcon boxSize={3} />
      <ExternalLinkIcon boxSize={3} />
    </HStack>
  );
}

type TokenIconKind = "usdc" | "eth" | "usdt";

function TokenIcon({ kind, size, chainBadge }: { kind: TokenIconKind; size: string; chainBadge?: string }) {
  const image = kind === "usdc" ? "/images/extension-preview/usdc.png" : kind === "eth" ? "/images/ethereum.svg" : "/images/extension-preview/usdt.png";
  return (
    <Box position="relative" boxSize={size} flexShrink={0}>
      <Image src={image} alt="" boxSize={size} borderRadius="full" />
      {chainBadge && (
        <Image
          src={chainBadge}
          alt=""
          position="absolute"
          right="-3px"
          bottom="-3px"
          boxSize="13px"
          borderRadius="full"
          bg={ui.bg}
          border="2px solid"
          borderColor={ui.bg}
        />
      )}
    </Box>
  );
}

const SwapArrowIcon = (props: any) => (
  <ChakraIcon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M7 3h2v13l3-3 1.4 1.4L8 19.8l-5.4-5.4L4 13l3 3V3zm10 18h-2V8l-3 3-1.4-1.4L16 4.2l5.4 5.4L20 11l-3-3v13z" />
  </ChakraIcon>
);

const ArrowDownIcon = (props: any) => (
  <ChakraIcon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M11 4h2v11.2l4-4 1.4 1.4L12 19 5.6 12.6 7 11.2l4 4V4z" />
  </ChakraIcon>
);

const ClockIcon = (props: any) => (
  <ChakraIcon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5h-2v6l5 3 1-1.7-4-2.3V7z" />
  </ChakraIcon>
);
