"use client";

import { ArrowBackIcon } from "@chakra-ui/icons";
import { Box, Flex, HStack, Icon, Image, Text, VStack } from "@chakra-ui/react";
import { ArrowDown } from "lucide-react";
import { warmMockup } from "./design";

export const privacyUi = {
  bg: warmMockup.base,
  raised: warmMockup.surface,
  sunken: warmMockup.sunken,
  floating: warmMockup.floating,
  border: warmMockup.border,
  borderStrong: warmMockup.borderStrong,
  text: warmMockup.text,
  secondary: warmMockup.secondary,
  muted: warmMockup.muted,
  amber: warmMockup.amber,
  blue: warmMockup.blueSoft,
};

export const privacyPreserve3d = {
  transformStyle: "preserve-3d",
} as const;

export function PrivacyShieldIcon() {
  return (
    <Icon viewBox="0 0 24 24" boxSize="18px" aria-hidden>
      <path
        d="M14 18a2 2 0 0 0-4 0M19 11l-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11M2 11h20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="17"
        cy="18"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="7"
        cy="18"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </Icon>
  );
}

function AssetIdentity({ shielded }: { shielded?: boolean }) {
  return (
    <HStack
      spacing={1.5}
      px={2}
      py={1.5}
      bg={privacyUi.raised}
      border="1px solid"
      borderColor={privacyUi.border}
      borderRadius="9px"
      flexShrink={0}
    >
      <Image
        src={
          shielded
            ? "/images/home-v2/shielded-eth.svg"
            : "/images/ethereum.svg"
        }
        alt=""
        boxSize="21px"
      />
      <VStack align="start" spacing={0}>
        <Text fontSize="10px" fontWeight="700" lineHeight="1.05">
          {shielded ? "Shielded ETH" : "ETH"}
        </Text>
        <Text color={privacyUi.muted} fontSize="8px" lineHeight="1.15">
          {shielded ? "Privacy Pools" : "Ethereum"}
        </Text>
      </VStack>
    </HStack>
  );
}

export function AmountCard({
  label,
  amount,
  shielded,
  detail,
  slider,
  sliderPercent = 25,
}: {
  label: string;
  amount: string;
  shielded?: boolean;
  detail: string;
  slider?: boolean;
  sliderPercent?: 25 | 50;
}) {
  return (
    <Box
      p={2.5}
      bg={privacyUi.raised}
      border="1px solid"
      borderColor={privacyUi.border}
      borderRadius="11px"
      transform="translateZ(32px)"
      sx={privacyPreserve3d}
    >
      <HStack justify="space-between" spacing={2}>
        <Text color={privacyUi.secondary} fontSize="10px" fontWeight="600">
          {label}
        </Text>
        <AssetIdentity shielded={shielded} />
      </HStack>
      <HStack
        mt={1.5}
        minH="42px"
        px={2.5}
        justify="space-between"
        bg={privacyUi.sunken}
        border="1px solid"
        borderColor={privacyUi.border}
        borderRadius="8px"
      >
        <Text fontFamily="mono" fontSize="17px" fontWeight="600">
          {amount}
        </Text>
        {detail.startsWith("$") && (
          <Text color={privacyUi.secondary} fontSize="10px">
            {detail}
          </Text>
        )}
      </HStack>
      {!detail.startsWith("$") && (
        <Text
          mt={1.5}
          color={privacyUi.secondary}
          fontSize="8px"
          textAlign="right"
        >
          {detail}
        </Text>
      )}
      {slider && (
        <Box px={1} pt={3} pb={3.5}>
          <Box
            position="relative"
            h="3px"
            bg={privacyUi.floating}
            borderRadius="full"
          >
            <Box
              w={`${sliderPercent}%`}
              h="full"
              bg={privacyUi.amber}
              borderRadius="full"
            />
            <Box
              position="absolute"
              left={`${sliderPercent}%`}
              top="50%"
              boxSize="14px"
              borderRadius="5px"
              bg={privacyUi.amber}
              transform="translate(-50%, -50%)"
            />
          </Box>
          <HStack mt={2} justify="space-between">
            {["0%", "25%", "50%", "75%", "100%"].map((mark) => (
              <Text
                key={mark}
                color={
                  mark === `${sliderPercent}%`
                    ? privacyUi.amber
                    : privacyUi.muted
                }
                fontSize="7px"
                fontWeight={mark === `${sliderPercent}%` ? "700" : "500"}
              >
                {mark}
              </Text>
            ))}
          </HStack>
        </Box>
      )}
    </Box>
  );
}

export function DirectionMarker() {
  return (
    <Flex
      align="center"
      justify="center"
      boxSize="30px"
      mx="auto"
      my="-8px"
      position="relative"
      zIndex={3}
      borderRadius="9px"
      bg={privacyUi.amber}
      color="#09090b"
      border="3px solid"
      borderColor={privacyUi.bg}
      transform="translateZ(70px)"
    >
      <ArrowDown size={15} strokeWidth={2.5} />
    </Flex>
  );
}

export function ScreenHeader({ title }: { title: string }) {
  return (
    <HStack
      minH="50px"
      px={3}
      spacing={2.5}
      borderBottom="1px solid"
      borderColor={privacyUi.border}
      transform="translateZ(18px)"
    >
      <ArrowBackIcon boxSize={4} />
      <Text fontSize="17px" fontWeight="700">
        {title}
      </Text>
    </HStack>
  );
}

export function ActionBar({ label }: { label: string }) {
  return (
    <Box
      position="absolute"
      left={0}
      right={0}
      bottom={0}
      p={3}
      bg={privacyUi.raised}
      borderTop="1px solid"
      borderColor={privacyUi.border}
      transform="translateZ(48px)"
    >
      <Flex
        minH="42px"
        align="center"
        justify="center"
        borderRadius="9px"
        bg={privacyUi.amber}
        color="#09090b"
        fontSize="11px"
        fontWeight="700"
      >
        {label}
      </Flex>
    </Box>
  );
}
