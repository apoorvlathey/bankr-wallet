"use client";

import { Box, Flex, HStack, Icon as ChakraIcon, IconButton, Image, Spacer, Text, VStack } from "@chakra-ui/react";
import { ArrowBackIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, ExternalLinkIcon, InfoOutlineIcon } from "@chakra-ui/icons";

const ui = {
  bg: "#090b12",
  raised: "#171b26",
  raised2: "#1e2433",
  sunken: "#10141f",
  border: "rgba(146,158,195,0.23)",
  borderStrong: "rgba(146,158,195,0.34)",
  text: "#f7f7f4",
  muted: "rgba(230,234,248,0.72)",
  faint: "rgba(230,234,248,0.52)",
  blue: "#5a81f3",
  yellow: "#f5c15b",
  green: "#61e6a6",
  red: "#ff7d83",
  purple: "#7d5af7",
};

const preserve3d = { transformStyle: "preserve-3d" } as const;

type DepthFocus = "batching" | "signing";

export function BatchTransactionPreview({ depthFocus = "batching" }: { depthFocus?: DepthFocus }) {
  return (
    <VStack align="stretch" spacing={3} bg={ui.bg} color={ui.text} p={3.5} minH="680px" borderRadius="34px" overflow="visible" sx={preserve3d}>
      <BatchHeader raised={depthFocus === "batching"} />
      <ClearSigningCard raised={depthFocus === "signing"} />
      <CallsList raised={depthFocus === "batching"} />
      <AssetChangesCard raised={depthFocus === "signing"} />
      <FooterActions />
    </VStack>
  );
}

function BatchHeader({ raised }: { raised: boolean }) {
  return (
    <HStack spacing={2} align="center" sx={preserve3d}>
      <IconButton aria-label="Back" icon={<ArrowBackIcon boxSize={5} />} variant="ghost" color={ui.text} minW="30px" h="30px" borderRadius="10px" _hover={{ bg: "rgba(255,255,255,0.08)" }} />
      <VStack flex={1} spacing={0.5} py={2} px={3} borderRadius="18px" bg={ui.blue} border="2px solid rgba(26,37,73,0.95)" boxShadow={raised ? "0 6px 0 rgba(0,0,0,0.28), 0 18px 30px rgba(0,0,0,0.22)" : "0 6px 0 rgba(0,0,0,0.24)"} transform={raised ? "translate3d(0,12px,76px)" : undefined}>
        <Text fontSize="15px" lineHeight="1" fontWeight="900" letterSpacing="0" textTransform="uppercase">Batch Transaction</Text>
        <Text fontSize="10px" lineHeight="1" fontWeight="900" opacity={0.9} textTransform="uppercase">(2 calls)</Text>
      </VStack>
      <IconButton aria-label="Copy batch calldata" icon={<CopyIcon boxSize={4} />} variant="ghost" color={ui.muted} minW="30px" h="30px" borderRadius="10px" _hover={{ bg: "rgba(255,255,255,0.08)", color: ui.yellow }} />
    </HStack>
  );
}

function ClearSigningCard({ raised }: { raised: boolean }) {
  return (
    <Box sx={preserve3d}>
      <HStack spacing={2} mb={1.5} color={ui.faint} transform={raised ? "translate3d(0,8px,54px)" : undefined}>
        <Text fontSize="11px" fontWeight="900" textTransform="uppercase" letterSpacing="0.04em" whiteSpace="nowrap">Call 2 of 2</Text>
        <Box h="1px" flex={1} bg={ui.borderStrong} />
      </HStack>
      <Box bg={ui.raised2} border="1px solid" borderColor={ui.borderStrong} borderRadius="17px" p={3} boxShadow={raised ? "none" : "0 10px 0 rgba(0,0,0,0.17)"} transform={raised ? "translate3d(0,10px,104px)" : undefined}>
        <HStack align="center">
          <Text fontSize="18px" fontWeight="900">Swap</Text>
          <Spacer />
          <Text fontSize="10px" fontWeight="900" color={ui.faint}>via Velora</Text>
        </HStack>
        <Box h="1px" bg={ui.border} my={2.5} />
        <VStack spacing={2.5} align="stretch">
          <DetailRow label="Amount to Send" amount="5" symbol="USDC" icon="/images/extension-preview/usdc.png" />
          <DetailRow label="Minimum to Receive" amount="0.00278533" symbol="ETH" icon="/images/ethereum.svg" sub="$4.95" />
          <HStack align="center" minW={0}>
            <Text flex={1} fontSize="12px" fontWeight="900" color={ui.muted}>Beneficiary</Text>
            <Text fontFamily="mono" fontSize="12px" fontWeight="900" color={ui.blue}>0x0000...0000</Text>
            <CopyIcon boxSize={3} color={ui.faint} />
            <ExternalLinkIcon boxSize={3} color={ui.faint} />
          </HStack>
        </VStack>
      </Box>
    </Box>
  );
}

function DetailRow({ label, amount, symbol, icon, sub }: { label: string; amount: string; symbol: string; icon: string; sub?: string }) {
  return (
    <HStack align="start" minW={0}>
      <Text flex={1} fontSize="12px" fontWeight="900" color={ui.muted}>{label}</Text>
      <VStack align="end" spacing={0}>
        <HStack spacing={1.5}>
          <Text fontSize={amount.length > 4 ? "20px" : "19px"} lineHeight="1" fontWeight="900">{amount}</Text>
          <Image src={icon} alt="" boxSize="22px" borderRadius="full" />
          <Text fontSize="15px" lineHeight="1" fontWeight="900" color={ui.muted}>{symbol}</Text>
        </HStack>
        {sub && <Text mt={1} fontSize="13px" lineHeight="1" color={ui.muted} fontWeight="900">{sub}</Text>}
      </VStack>
    </HStack>
  );
}

function CallsList({ raised }: { raised: boolean }) {
  return (
    <VStack spacing={1.5} align="stretch" transform={raised ? "translate3d(0,-4px,132px)" : undefined} sx={preserve3d}>
      <Text px={0.5} fontSize="14px" fontWeight="900" color={ui.muted} textTransform="uppercase" transform={raised ? "translateZ(28px)" : undefined}>Calls</Text>
      <CallRow index={1} raised={raised} accent={ui.purple} title={<HStack spacing={1} minW={0}><Text as="span">Approve 5</Text><Image src="/images/extension-preview/usdc.png" alt="" boxSize="15px" borderRadius="full" /><Text as="span" isTruncated>USDC to AugustusV6</Text></HStack>} />
      <CallRow index={2} raised={raised} accent={ui.blue} title={<Text isTruncated>swapExactAmountIn</Text>} right="0x6a00...1068" />
    </VStack>
  );
}

function CallRow({ index, raised, accent, title, right }: { index: number; raised: boolean; accent: string; title: React.ReactNode; right?: string }) {
  return (
    <HStack position="relative" minH="42px" pl={3} pr={2.5} py={2} bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} borderRadius="14px" overflow="hidden" boxShadow={raised ? "0 10px 24px rgba(0,0,0,0.24)" : undefined} transform={raised ? `translate3d(0,0,${52 - index * 10}px)` : undefined}>
      <Box position="absolute" left={0} top={0} bottom={0} w="4px" bg={accent} />
      <Flex w="22px" h="22px" borderRadius="8px" bg={accent} color={ui.text} border="1px solid" borderColor="rgba(255,255,255,0.25)" align="center" justify="center" fontSize="12px" fontWeight="900" flexShrink={0}>{index}</Flex>
      <Box flex={1} minW={0} fontSize="12px" fontWeight="900" color={ui.text}>{title}</Box>
      {right && <Text fontFamily="mono" fontSize="11px" color={ui.faint}>{right}</Text>}
      <ChevronDownIcon boxSize={4} color={ui.muted} flexShrink={0} />
    </HStack>
  );
}

function AssetChangesCard({ raised }: { raised: boolean }) {
  return (
    <Box
      bg={ui.raised}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="18px"
      p={3}
      boxShadow="none"
      overflow="hidden"
      isolation="isolate"
      transform={raised ? "translate3d(0,-3px,100px)" : undefined}
      sx={{ transformStyle: "flat", backfaceVisibility: "hidden" }}
    >
      <HStack>
        <HStack spacing={1}>
          <Text fontSize="13px" fontWeight="900" color={ui.muted} textTransform="uppercase">Asset Changes</Text>
          <InfoOutlineIcon boxSize={3} color={ui.faint} />
        </HStack>
        <Spacer />
        <ChevronUpIcon boxSize={4} color={ui.muted} />
      </HStack>
      <Box h="1px" bg={ui.border} my={2.5} />
      <AssetDeltaSection kind="send" />
      <AssetDeltaSection kind="receive" />
    </Box>
  );
}

function AssetDeltaSection({ kind }: { kind: "send" | "receive" }) {
  const outgoing = kind === "send";
  return (
    <Box mt={outgoing ? 0 : 3}>
      <Text mb={1.5} fontSize="11px" fontWeight="900" color={outgoing ? ui.red : ui.green} textTransform="uppercase">{outgoing ? "Send" : "Receive"}</Text>
      <HStack align="center">
        <Box h="52px" w="3px" bg={outgoing ? ui.red : ui.green} />
        <Image src={outgoing ? "/images/extension-preview/usdc.png" : "/images/ethereum.svg"} alt="" boxSize="28px" borderRadius="full" ml={2} />
        <VStack align="start" spacing={0} minW={0}>
          <Text fontSize="15px" fontWeight="900">{outgoing ? "USDC" : "ETH"}</Text>
          {outgoing && (
            <HStack spacing={1} color={ui.faint}>
              <Text fontSize="10px" fontFamily="mono" fontWeight="700">0x8335...2913</Text>
              <CopyIcon boxSize={3} />
              <ExternalLinkIcon boxSize={3} />
            </HStack>
          )}
        </VStack>
        <Spacer />
        <VStack align="end" spacing={0}>
          <Text fontSize="18px" fontFamily="mono" fontWeight="900" color={outgoing ? ui.red : ui.green}>{outgoing ? "-5" : "+0.00281302"}</Text>
          <Text fontSize="11px" fontWeight="900" color={ui.muted}>$5.00</Text>
        </VStack>
      </HStack>
    </Box>
  );
}

function FooterActions() {
  return (
    <VStack spacing={2} align="stretch" mt="auto" sx={preserve3d}>
      <HStack spacing={2}>
        <HStack flex={1} justify="center" minH="42px" bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} borderRadius="14px" spacing={2}>
          <CopyIcon boxSize={4} color={ui.muted} />
          <TenderlyIcon boxSize={5} color="#9b7cff" />
          <Text fontSize="13px" fontWeight="900" textTransform="uppercase">Simulate on Tenderly</Text>
          <ExternalLinkIcon boxSize={3.5} />
        </HStack>
        <Flex as="button" minH="42px" px={4} borderRadius="14px" bg={ui.yellow} color="#121212" align="center" justify="center" fontSize="13px" fontWeight="900" textTransform="uppercase">+ Batch</Flex>
      </HStack>
      <HStack spacing={2}>
        <Flex flex={1} minH="46px" borderRadius="14px" bg={ui.raised} border="1px solid" borderColor={ui.borderStrong} align="center" justify="center" fontSize="17px" fontWeight="900">Reject</Flex>
        <Flex flex={1} minH="46px" borderRadius="14px" bg={ui.yellow} color="#121212" border="1px solid" borderColor={ui.borderStrong} align="center" justify="center" fontSize="17px" fontWeight="900">Confirm</Flex>
      </HStack>
    </VStack>
  );
}

const TenderlyIcon = (props: any) => (
  <ChakraIcon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M20.7 3.1 13.4 7 8.2 4.8 3.3 7.6l5.3 3.1-1 7.6 5.8-4 7.3 2.4-3.3-6.5 3.3-7.1Z" />
  </ChakraIcon>
);
