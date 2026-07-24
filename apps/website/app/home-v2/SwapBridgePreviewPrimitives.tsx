"use client";

import type { ComponentProps } from "react";
import { keyframes } from "@emotion/react";
import {
  Box,
  Flex,
  HStack,
  Icon as ChakraIcon,
  IconButton,
  Image,
  Text,
} from "@chakra-ui/react";
import { ArrowBackIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { MockSignerIdentity } from "./MockSignerIdentity";
import { warmMockup } from "./design";

export type SwapBridgeMode = "swap" | "bridge";
export type TokenKind = "usdc" | "usdt" | "eth";

export const ui = {
  ...warmMockup,
  neutral: warmMockup.surfaceHover,
};
export const preserve3d = { transformStyle: "preserve-3d" } as const;

const decisionPress = keyframes`
  0% { transform: translate3d(0, -28px, 100px) scale(1); filter: brightness(1); }
  45% { transform: translate3d(0, -26px, 76px) scale(.988); filter: brightness(.94); }
  100% { transform: translate3d(0, -28px, 94px) scale(.997); filter: brightness(.99); }
`;
const reviewPress = keyframes`
  0% { transform: translate3d(0, -78px, 100px) scale(1); filter: brightness(1); }
  45% { transform: translate3d(0, -76px, 76px) scale(.988); filter: brightness(.94); }
  100% { transform: translate3d(0, -78px, 94px) scale(.997); filter: brightness(.99); }
`;

export function ScreenHeader({
  title,
  signer = false,
}: {
  title: string;
  signer?: boolean;
}) {
  return (
    <HStack
      mt={2}
      h="62px"
      px={3}
      spacing={2}
      borderBottom="1px solid"
      borderColor={ui.border}
      transform={{ base: "translateZ(18px)", sm: "translateZ(28px)" }}
      sx={preserve3d}
    >
      <IconButton
        aria-label="Back"
        icon={<ArrowBackIcon boxSize={5} />}
        variant="ghost"
        color={ui.text}
        minW="36px"
        h="36px"
        borderRadius="8px"
      />
      <Text
        flex={1}
        fontSize="21px"
        lineHeight="1"
        fontWeight="700"
        letterSpacing="-.03em"
      >
        {title}
      </Text>
      {signer && <MockSignerIdentity avatarSize={25} />}
    </HStack>
  );
}

export function FlatActionBar({ children }: { children: React.ReactNode }) {
  return (
    <Box
      p={3}
      borderTop="1px solid"
      borderColor={ui.border}
      bg={ui.surface}
      transform={{ base: "translateZ(18px)", sm: "translateZ(32px)" }}
      boxShadow="0 -12px 26px rgba(0,0,0,.18)"
      sx={preserve3d}
    >
      {children}
    </Box>
  );
}

export function CommitButton({
  label,
  isPressing,
  flex,
  lift = "decision",
}: {
  label: string;
  isPressing: boolean;
  flex?: number;
  lift?: "decision" | "review";
}) {
  const liftY = lift === "review" ? "-78px" : "-28px";
  const pressAnimation = lift === "review" ? reviewPress : decisionPress;

  return (
    <Flex
      flex={flex}
      h="46px"
      bg={ui.amber}
      color="#09090b"
      borderRadius="10px"
      align="center"
      justify="center"
      fontSize="15px"
      fontWeight="700"
      transform={{
        base: `translate3d(0, ${liftY}, 64px)`,
        sm: `translate3d(0, ${liftY}, 100px)`,
      }}
      boxShadow="0 18px 30px rgba(0,0,0,.38)"
      animation={
        isPressing
          ? `${pressAnimation} .46s cubic-bezier(.22,1,.36,1) both`
          : undefined
      }
    >
      {label}
    </Flex>
  );
}

export function TokenIcon({
  kind,
  size = "24px",
}: {
  kind: TokenKind;
  size?: string;
}) {
  const src =
    kind === "usdc"
      ? "/images/extension-preview/usdc.png"
      : kind === "usdt"
        ? "/images/extension-preview/usdt.png"
        : "/images/ethereum.svg";
  return (
    <Image src={src} alt="" boxSize={size} borderRadius="full" flexShrink={0} />
  );
}

export function TokenPill({
  kind,
  label,
  compact = false,
}: {
  kind: TokenKind;
  label: string;
  compact?: boolean;
}) {
  return (
    <HStack
      h={compact ? "34px" : "40px"}
      px={compact ? 2 : 2.5}
      spacing={1.5}
      bg={ui.sunken}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="10px"
      flexShrink={0}
    >
      <TokenIcon kind={kind} size={compact ? "19px" : "24px"} />
      <Text fontSize={compact ? "12px" : "14px"} fontWeight="700">
        {label}
      </Text>
      <ChevronDownIcon color={ui.secondary} />
    </HStack>
  );
}

export function ChainPill({
  icon,
  label,
  compact = false,
}: {
  icon: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <HStack
      h={compact ? "30px" : "40px"}
      px={compact ? 2 : 2.5}
      spacing={1.5}
      bg={ui.sunken}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="10px"
      flexShrink={0}
    >
      <Image
        src={icon}
        alt=""
        boxSize={compact ? "17px" : "23px"}
        borderRadius="full"
      />
      <Text fontSize={compact ? "11px" : "13px"} fontWeight="700">
        {label}
      </Text>
      {!compact && <ChevronDownIcon color={ui.secondary} />}
    </HStack>
  );
}

export const SwapArrowIcon = (props: ComponentProps<typeof ChakraIcon>) => (
  <ChakraIcon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M7 3h2v13l3-3 1.4 1.4L8 19.8l-5.4-5.4L4 13l3 3V3zm10 18h-2V8l-3 3-1.4-1.4L16 4.2l5.4 5.4L20 11l-3-3v13z"
    />
  </ChakraIcon>
);

export const ArrowDownIcon = (props: ComponentProps<typeof ChakraIcon>) => (
  <ChakraIcon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M11 4h2v11.2l4-4 1.4 1.4L12 19 5.6 12.6 7 11.2l4 4V4z"
    />
  </ChakraIcon>
);
