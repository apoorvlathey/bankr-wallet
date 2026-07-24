"use client";

import { Box, Flex, HStack, Spacer, Text, VStack } from "@chakra-ui/react";
import { ChevronDownIcon, SettingsIcon, TimeIcon } from "@chakra-ui/icons";
import {
  ChainPill,
  CommitButton,
  FlatActionBar,
  ScreenHeader,
  SwapArrowIcon,
  TokenPill,
  preserve3d,
  ui,
  type SwapBridgeMode,
} from "./SwapBridgePreviewPrimitives";

export function SwapBridgeEntryScreen({
  mode,
  isPressing,
}: {
  mode: SwapBridgeMode;
  isPressing: boolean;
}) {
  const bridge = mode === "bridge";

  return (
    <Flex minH="680px" direction="column" bg={ui.base} sx={preserve3d}>
      <ScreenHeader title="Swap or Bridge" signer />
      <VStack
        align="stretch"
        spacing={3}
        px={3}
        pt={3}
        flex={1}
        sx={preserve3d}
      >
        <PayCard />
        <Flex
          justify="center"
          my="-24px"
          position="relative"
          zIndex={3}
          transform={{ base: "translateZ(70px)", sm: "translateZ(102px)" }}
        >
          <Flex
            w="46px"
            h="42px"
            borderRadius="11px"
            bg={ui.amber}
            color="#09090b"
            border="3px solid"
            borderColor={ui.base}
            align="center"
            justify="center"
            boxShadow="0 12px 22px rgba(0,0,0,.3)"
          >
            <SwapArrowIcon boxSize={5} />
          </Flex>
        </Flex>
        <ReceiveCard mode={mode} />
        <QuoteSummary mode={mode} />
      </VStack>
      <FlatActionBar>
        <CommitButton
          label={bridge ? "Review bridge" : "Review swap"}
          isPressing={isPressing}
          lift="review"
        />
      </FlatActionBar>
    </Flex>
  );
}

function PayCard() {
  return (
    <Box
      px={3}
      pt={3}
      pb={4}
      bg={ui.surface}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="12px"
      transform={{ base: "translateZ(48px)", sm: "translateZ(72px)" }}
      boxShadow="0 18px 28px rgba(0,0,0,.25)"
      sx={preserve3d}
    >
      <HStack justify="space-between" mb={2} spacing={1}>
        <HStack spacing={1}>
          <Text fontSize="13px" color={ui.secondary} fontWeight="600">
            You pay on
          </Text>
          <ChainPill icon="/images/base.svg" label="Base" />
        </HStack>
        <TokenPill kind="usdc" label="USDC" />
      </HStack>
      <HStack
        minH="56px"
        px={3}
        bg={ui.sunken}
        border="1px solid"
        borderColor={ui.blue}
        borderRadius="10px"
        boxShadow={`0 0 0 3px ${ui.blue}44`}
      >
        <Text fontFamily="mono" fontSize="20px" fontWeight="500">
          100
        </Text>
        <Spacer />
        <Text color={ui.secondary} fontSize="13px" fontWeight="600">
          $99.99
        </Text>
        <Text color={ui.blueSoft} fontSize="13px" fontWeight="800">
          MAX
        </Text>
      </HStack>
      <Text
        mt={1.5}
        textAlign="right"
        fontSize="12px"
        color={ui.secondary}
        fontWeight="500"
      >
        Balance 147.566 ·{" "}
        <Text as="span" color={ui.muted}>
          $147.56
        </Text>
      </Text>
      <BalanceSlider />
    </Box>
  );
}

function BalanceSlider() {
  return (
    <Box px={1} pt={3}>
      <Box position="relative" h="4px" borderRadius="3px" bg={ui.neutral}>
        <Box
          position="absolute"
          insetY={0}
          left={0}
          w="68%"
          bg={ui.amber}
          borderRadius="3px"
        />
        <Box
          position="absolute"
          left="68%"
          top="50%"
          boxSize="20px"
          transform="translate(-50%, -50%)"
          bg={ui.amber}
          borderRadius="4px"
        />
      </Box>
      <HStack justify="space-between" mt={2.5}>
        {["0%", "25%", "50%", "75%", "100%"].map((value) => (
          <Text key={value} fontSize="11px" color={ui.muted} fontWeight="500">
            {value}
          </Text>
        ))}
      </HStack>
    </Box>
  );
}

function ReceiveCard({ mode }: { mode: SwapBridgeMode }) {
  const bridge = mode === "bridge";

  return (
    <Box
      px={3}
      pt={5}
      pb={3}
      bg={ui.surface}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="12px"
      transform={{ base: "translateZ(42px)", sm: "translateZ(56px)" }}
      sx={preserve3d}
    >
      <HStack justify="space-between" mb={2} spacing={1}>
        <HStack spacing={1}>
          <Text fontSize="13px" color={ui.secondary} fontWeight="600">
            You get on
          </Text>
          <ChainPill
            icon={bridge ? "/images/ethereum.svg" : "/images/base.svg"}
            label={bridge ? "Ethereum" : "Base"}
          />
        </HStack>
        <TokenPill
          kind={bridge ? "eth" : "usdt"}
          label={bridge ? "ETH" : "USDT"}
        />
      </HStack>
      <HStack
        minH="54px"
        px={3}
        bg={ui.sunken}
        border="1px solid"
        borderColor={ui.border}
        borderRadius="10px"
      >
        <Text fontFamily="mono" fontSize="19px" fontWeight="500">
          {bridge ? "0.051453" : "99.158794"}
        </Text>
        <Spacer />
        <Text fontSize="12px" color={ui.secondary} fontWeight="600">
          {bridge ? "~$98.79" : "~$99.09"}
        </Text>
      </HStack>
      <Text
        mt={1.5}
        textAlign="right"
        fontSize="12px"
        color={ui.muted}
        fontWeight="600"
      >
        {bridge ? "1.21%" : "0.90%"} price impact
      </Text>
    </Box>
  );
}

function QuoteSummary({ mode }: { mode: SwapBridgeMode }) {
  const bridge = mode === "bridge";

  return (
    <VStack
      align="stretch"
      spacing={2}
      mt={1}
      transform={{ base: "translateZ(24px)", sm: "translateZ(34px)" }}
    >
      <HStack justify="space-between" minH="26px">
        <HStack spacing={1.5} color={ui.secondary}>
          {bridge && <TimeIcon boxSize={3} />}
          <Text fontSize="12px" fontWeight="600">
            {bridge ? "Socket Intents · ~10s" : "Best available route"}
          </Text>
        </HStack>
        <HStack spacing={1.5} color={ui.secondary}>
          <Text fontSize="12px" fontWeight="600">
            Slippage 1%
          </Text>
          <SettingsIcon boxSize={3.5} />
        </HStack>
      </HStack>
      <HStack
        minH="58px"
        px={3}
        bg={ui.sunken}
        border="1px solid"
        borderColor={ui.borderStrong}
        borderRadius="11px"
      >
        <Text fontSize="12px" color={ui.secondary} fontWeight="600">
          Minimum received
        </Text>
        <Spacer />
        <VStack align="end" spacing={0}>
          <Text fontSize="14px" fontWeight="700">
            {bridge ? "0.050933 ETH" : "98.168415 USDT"}
          </Text>
          <Text fontSize="12px" color={ui.muted} fontWeight="600">
            {bridge ? "~$97.79" : "~$98.10"}
          </Text>
        </VStack>
        <ChevronDownIcon color={ui.muted} />
      </HStack>
    </VStack>
  );
}
