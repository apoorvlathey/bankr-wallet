"use client";

import { ChevronDownIcon } from "@chakra-ui/icons";
import { Box, Flex, HStack, Image, Text, VStack } from "@chakra-ui/react";
import { Link2Off } from "lucide-react";
import {
  ActionBar,
  AmountCard,
  DirectionMarker,
  PrivacyShieldIcon,
  ScreenHeader,
  privacyPreserve3d as preserve3d,
  privacyUi as ui,
} from "./PrivacyPoolsPreviewPrimitives";

function ShieldScreen() {
  return (
    <>
      <ScreenHeader title="Shield" />
      <VStack align="stretch" spacing={2.5} p={3} sx={preserve3d}>
        <HStack
          minH="48px"
          px={2.5}
          justify="space-between"
          bg={ui.raised}
          border="1px solid"
          borderColor={ui.border}
          borderRadius="10px"
          transform="translateZ(24px)"
        >
          <Text color={ui.secondary} fontSize="10px" fontWeight="600">
            Deposit from
          </Text>
          <HStack spacing={1.5}>
            <Image
              src="/images/home-v2/apoorv-eth.png"
              alt=""
              boxSize="25px"
              borderRadius="7px"
            />
            <Box>
              <Text fontSize="9px" fontWeight="700">
                apoorv.eth
              </Text>
              <Text color={ui.muted} fontSize="7px">
                Local signer
              </Text>
            </Box>
            <ChevronDownIcon boxSize={3} />
          </HStack>
        </HStack>
        <AmountCard
          label="From"
          amount="0.01"
          detail="$34.20"
          slider
        />
        <DirectionMarker />
        <AmountCard
          label="You get"
          amount="0.01"
          detail="~0.00005025 ETH protocol fee"
          shielded
        />
        <HStack justify="space-between" px={0.5}>
          <Text color={ui.secondary} fontSize="8px">
            Privacy Pools · Ethereum
          </Text>
          <Text color={ui.secondary} fontSize="8px">
            Network fee shown in review
          </Text>
        </HStack>
      </VStack>
      <ActionBar label="Review shield" />
    </>
  );
}

function UnshieldScreen() {
  return (
    <>
      <ScreenHeader title="Unshield" />
      <VStack align="stretch" spacing={2.5} p={3} sx={preserve3d}>
        <AmountCard
          label="From"
          amount="0.005"
          detail="$17.10"
          shielded
          slider
          sliderPercent={50}
        />
        <DirectionMarker />
        <Box
          p={2.5}
          bg={ui.raised}
          border="1px solid"
          borderColor={ui.border}
          borderRadius="11px"
          transform="translateZ(40px)"
        >
          <HStack mb={1.5} spacing={1.5}>
            <Text color={ui.secondary} fontSize="10px" fontWeight="600">
              Receive at
            </Text>
            <Text color={ui.blue} fontSize="10px" fontWeight="600">
              Fresh address
            </Text>
          </HStack>
          <HStack
            minH="42px"
            px={2.5}
            justify="space-between"
            bg={ui.sunken}
            border="1px solid"
            borderColor={ui.border}
            borderRadius="8px"
          >
            <Text fontFamily="mono" fontSize="10px">
              0x7B20...90e1
            </Text>
            <Text
              px={1.5}
              py={0.5}
              bg="rgba(96,165,250,0.12)"
              color={ui.blue}
              borderRadius="5px"
              fontSize="7px"
              fontWeight="700"
            >
              NEW
            </Text>
          </HStack>
        </Box>
        <HStack justify="space-between" px={0.5}>
          <Text color={ui.secondary} fontSize="8px">
            Privacy Pools · Ethereum
          </Text>
          <Text color={ui.secondary} fontSize="8px">
            Withdrawal method in review
          </Text>
        </HStack>
      </VStack>
      <ActionBar label="Review unshield" />
    </>
  );
}

function PrivacyPhone({
  mode,
  left,
  top,
  depth,
  rotate,
}: {
  mode: "shield" | "unshield";
  left: any;
  top: any;
  depth: number;
  rotate: string;
}) {
  return (
    <Box
      position="absolute"
      left={left}
      top={top}
      w={{ base: "276px", lg: "330px" }}
      h={{ base: "500px", lg: "570px" }}
      bg={ui.bg}
      color={ui.text}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="18px"
      boxShadow="0 32px 80px rgba(0,0,0,0.5)"
      overflow="hidden"
      transform={`translateZ(${depth}px) rotate(${rotate})`}
      sx={preserve3d}
    >
      {mode === "shield" ? <ShieldScreen /> : <UnshieldScreen />}
    </Box>
  );
}

export function PrivacyPoolsPreview() {
  return (
    <Box
      position="relative"
      w="100%"
      h={{ base: "610px", lg: "660px" }}
      sx={preserve3d}
    >
      <PrivacyPhone
        mode="shield"
        left={{ base: "0", lg: "-16px" }}
        top="8px"
        depth={30}
        rotate="-1.6deg"
      />
      <PrivacyPhone
        mode="unshield"
        left={{ base: "112px", lg: "246px" }}
        top={{ base: "88px", lg: "76px" }}
        depth={92}
        rotate="1.2deg"
      />

      <HStack
        position="absolute"
        left={{ base: "83px", lg: "196px" }}
        top={{ base: "258px", lg: "285px" }}
        zIndex={6}
        spacing={2}
        px={3}
        py={2}
        bg="rgba(9,9,11,0.96)"
        border="1px solid rgba(245,158,11,0.34)"
        borderRadius="10px"
        color={ui.amber}
        boxShadow="0 18px 50px rgba(0,0,0,0.48)"
        transform="translateZ(150px) rotate(-2deg)"
      >
        <Link2Off size={17} strokeWidth={2.3} />
        <Box>
          <Text fontSize="10px" fontWeight="800" lineHeight="1.15">
            Public link broken
          </Text>
          <Text color={ui.secondary} fontSize="7px">
            funder ≠ fresh receiver
          </Text>
        </Box>
      </HStack>

      <Flex
        position="absolute"
        right={{ base: "8px", lg: "10px" }}
        top={{ base: "34px", lg: "24px" }}
        align="center"
        gap={1.5}
        px={2.5}
        py={1.5}
        bg="rgba(245,158,11,0.10)"
        border="1px solid rgba(245,158,11,0.28)"
        borderRadius="9px"
        color={ui.amber}
        transform="translateZ(122px)"
      >
        <PrivacyShieldIcon />
        <Text fontSize="8px" fontWeight="800">
          Native Ethereum privacy
        </Text>
      </Flex>
    </Box>
  );
}
