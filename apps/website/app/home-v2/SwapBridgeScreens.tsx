"use client";

import { Box, Flex, HStack, Spacer, Text, VStack } from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { MockSignerIdentity } from "./MockSignerIdentity";
import { SwapBridgeEntryScreen } from "./SwapBridgeEntryScreen";
import {
  ArrowDownIcon,
  ChainPill,
  CommitButton,
  ScreenHeader,
  TokenIcon,
  TokenPill,
  preserve3d,
  ui,
  type SwapBridgeMode,
} from "./SwapBridgePreviewPrimitives";

type Screen = "entry" | "confirm";

export function SwapBridgeScreen({
  mode,
  screen,
  isPressing,
}: {
  mode: SwapBridgeMode;
  screen: Screen;
  isPressing: boolean;
}) {
  return screen === "entry" ? (
    <SwapBridgeEntryScreen mode={mode} isPressing={isPressing} />
  ) : (
    <ConfirmScreen mode={mode} isPressing={isPressing} />
  );
}

function ConfirmScreen({
  mode,
  isPressing,
}: {
  mode: SwapBridgeMode;
  isPressing: boolean;
}) {
  const bridge = mode === "bridge";

  return (
    <Flex minH="680px" direction="column" bg={ui.base} sx={preserve3d}>
      <ScreenHeader title={bridge ? "Confirm Bridge" : "Confirm Swap"} />
      <VStack
        align="stretch"
        spacing={3}
        px={3}
        pt={10}
        flex={1}
        sx={preserve3d}
      >
        <Text
          color={ui.secondary}
          fontSize="15px"
          fontWeight="700"
          transform={{ base: "translateZ(24px)", sm: "translateZ(40px)" }}
        >
          {bridge ? "Bridge Overview" : "Swap Overview"}
        </Text>
        <OverviewCard mode={mode} />
        <HStack px={1} pt={1} color={ui.secondary} transform="translateZ(28px)">
          <Text fontSize="13px" fontWeight="600">
            Transactions (batched)
          </Text>
          <Spacer />
          <ChevronDownIcon />
        </HStack>
      </VStack>
      <ConfirmationFooter mode={mode} isPressing={isPressing} />
    </Flex>
  );
}

function OverviewCard({ mode }: { mode: SwapBridgeMode }) {
  const bridge = mode === "bridge";

  return (
    <Box
      mt={2}
      bg={ui.surface}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="12px"
      overflow="hidden"
      transform={{ base: "translateZ(42px)", sm: "translateZ(78px)" }}
      boxShadow="0 18px 30px rgba(0,0,0,.28)"
      sx={preserve3d}
    >
      <OverviewAsset
        kind="usdc"
        label="You sell"
        amount="100 USDC"
        usd="$99.99"
      />
      <Box position="relative" h="28px">
        <Box position="absolute" insetX={0} top="50%" h="1px" bg={ui.border} />
        <Flex
          position="absolute"
          left="50%"
          top="50%"
          boxSize="29px"
          transform="translate(-50%, -50%) translateZ(22px)"
          bg={ui.amber}
          color="#09090b"
          borderRadius="full"
          align="center"
          justify="center"
        >
          <ArrowDownIcon boxSize={4} />
        </Flex>
      </Box>
      <OverviewAsset
        kind={bridge ? "eth" : "usdt"}
        label="You get (est.)"
        amount={bridge ? "0.051458 ETH" : "99.1587 USDT"}
        usd={bridge ? "$98.79" : "$99.09"}
      />
      <HStack
        px={3}
        py={2}
        borderTop="1px solid"
        borderColor={ui.border}
        justify="space-between"
      >
        <Text fontSize="12px" color={ui.secondary} fontWeight="600">
          {bridge ? "Route" : "Network"}
        </Text>
        {bridge ? (
          <HStack spacing={1.5}>
            <ChainPill icon="/images/base.svg" label="Base" compact />
            <Text color={ui.secondary} fontWeight="700">
              →
            </Text>
            <ChainPill icon="/images/ethereum.svg" label="Ethereum" compact />
          </HStack>
        ) : (
          <ChainPill icon="/images/base.svg" label="Base" compact />
        )}
      </HStack>
      {bridge && (
        <HStack
          px={3}
          py={2}
          borderTop="1px solid"
          borderColor={ui.border}
          justify="space-between"
        >
          <Text fontSize="12px" color={ui.secondary} fontWeight="700">
            BRIDGE
          </Text>
          <HStack spacing={2}>
            <Text fontSize="12px" fontWeight="700">
              Socket Intents
            </Text>
            <Text fontSize="12px" color={ui.secondary} fontWeight="600">
              ~1m
            </Text>
          </HStack>
        </HStack>
      )}
    </Box>
  );
}

function OverviewAsset({
  kind,
  label,
  amount,
  usd,
}: {
  kind: "usdc" | "usdt" | "eth";
  label: string;
  amount: string;
  usd: string;
}) {
  return (
    <HStack
      px={3}
      py={3}
      spacing={3}
      transform={{ base: "translateZ(10px)", sm: "translateZ(18px)" }}
    >
      <TokenIcon kind={kind} size="32px" />
      <VStack align="start" spacing={0} flex={1}>
        <Text fontSize="12px" color={ui.muted} fontWeight="600">
          {label}
        </Text>
        <Text fontSize="16px" fontWeight="700">
          {amount}
        </Text>
      </VStack>
      <Text fontSize="14px" color={ui.secondary} fontWeight="700">
        {usd}
      </Text>
    </HStack>
  );
}

function ConfirmationFooter({
  mode,
  isPressing,
}: {
  mode: SwapBridgeMode;
  isPressing: boolean;
}) {
  const bridge = mode === "bridge";

  return (
    <VStack
      align="stretch"
      spacing={2}
      px={5}
      py={3}
      bg={ui.surface}
      borderTop="1px solid"
      borderColor={ui.border}
      transform={{
        base: "translate3d(0, -40px, 32px)",
        sm: "translate3d(0, -40px, 42px)",
      }}
      boxShadow="0 -12px 28px rgba(0,0,0,.18)"
      sx={preserve3d}
    >
      <HStack justify="space-between">
        <Text fontSize="12px" color={ui.secondary} fontWeight="600">
          Signing with
        </Text>
        <MockSignerIdentity avatarSize={24} />
      </HStack>
      <HStack justify="space-between">
        <Text fontSize="12px" color={ui.secondary} fontWeight="600">
          Pay network fee with
        </Text>
        <TokenPill kind="eth" label="ETH" compact />
      </HStack>
      <HStack mt={-2} spacing={2} sx={preserve3d}>
        <Flex
          flex={1}
          h="46px"
          bg={ui.neutral}
          borderRadius="10px"
          align="center"
          justify="center"
          fontWeight="600"
          transform={{
            base: "translate3d(0, -28px, 48px)",
            sm: "translate3d(0, -28px, 76px)",
          }}
          boxShadow="0 14px 24px rgba(0,0,0,.3)"
        >
          Cancel
        </Flex>
        <CommitButton
          label={bridge ? "Confirm Bridge" : "Confirm Swap"}
          isPressing={isPressing}
          flex={1.12}
        />
      </HStack>
    </VStack>
  );
}
