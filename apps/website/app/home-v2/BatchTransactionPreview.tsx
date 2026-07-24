"use client";

import {
  Box,
  Flex,
  HStack,
  IconButton,
  Image,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  InfoOutlineIcon,
} from "@chakra-ui/icons";
import { warmMockup } from "./design";
import { MockSignerIdentity } from "./MockSignerIdentity";

const ui = {
  bg: warmMockup.base,
  raised: warmMockup.surface,
  raisedHover: warmMockup.surfaceHover,
  border: warmMockup.border,
  borderStrong: warmMockup.borderStrong,
  text: warmMockup.text,
  secondary: warmMockup.secondary,
  muted: warmMockup.muted,
  blue: warmMockup.blue,
  amber: warmMockup.amber,
  green: warmMockup.green,
  red: warmMockup.red,
};

const preserve3d = { transformStyle: "preserve-3d" } as const;
type DepthFocus = "batching" | "signing";

export function BatchTransactionPreview({
  depthFocus = "batching",
}: {
  depthFocus?: DepthFocus;
}) {
  const callsRaised = depthFocus === "batching";
  const impactRaised = depthFocus === "signing";

  return (
    <Flex
      direction="column"
      bg={ui.bg}
      color={ui.text}
      minH="700px"
      borderRadius="22px"
      overflow="visible"
      sx={preserve3d}
    >
      <BatchHeader />
      <Box px={4} pt={3} pb={3.5} sx={preserve3d}>
        <VStack align="stretch" spacing={4} sx={preserve3d}>
          <RequestIdentity />
          <FinancialImpact raised={impactRaised} />
          <RequestDetails raised={callsRaised} overviewRaised={impactRaised} />
        </VStack>
      </Box>
      <DecisionBar feeRaised={callsRaised} />
    </Flex>
  );
}

function BatchHeader() {
  return (
    <HStack
      minH="52px"
      px={2.5}
      borderBottom="1px solid"
      borderColor={ui.border}
      transform="translateZ(22px)"
      sx={preserve3d}
    >
      <IconButton
        aria-label="Back"
        icon={<ArrowBackIcon boxSize={5} />}
        variant="ghost"
        color={ui.text}
        minW="34px"
        h="34px"
        borderRadius="8px"
        _hover={{ bg: ui.raisedHover }}
        _focusVisible={{ boxShadow: `0 0 0 3px ${ui.blue}` }}
      />
      <Text flex={1} fontSize="20px" fontWeight="700" letterSpacing="-0.02em">
        Batch request
      </Text>
      <IconButton
        aria-label="Copy batch JSON"
        icon={<CopyIcon boxSize={4} />}
        variant="ghost"
        color={ui.secondary}
        minW="34px"
        h="34px"
        borderRadius="8px"
        _hover={{ bg: ui.raisedHover, color: ui.amber }}
        _focusVisible={{ boxShadow: `0 0 0 3px ${ui.blue}` }}
      />
    </HStack>
  );
}

function RequestIdentity() {
  return (
    <VStack
      as="section"
      aria-label="Requesting application"
      spacing={2}
      py={0.5}
      transform="translateZ(34px)"
    >
      <Flex
        boxSize="42px"
        borderRadius="10px"
        bg="#f4f4f5"
        border="1px solid"
        borderColor={ui.borderStrong}
        align="center"
        justify="center"
        overflow="hidden"
        boxShadow="0 10px 22px rgba(0,0,0,0.22)"
      >
        <Image
          src="https://swap.defillama.com/favicon.ico"
          alt=""
          boxSize="28px"
          objectFit="contain"
        />
      </Flex>
      <Text fontSize="15px" lineHeight="1.2" fontWeight="700">
        swap.defillama.com
      </Text>
    </VStack>
  );
}

function FinancialImpact({ raised }: { raised: boolean }) {
  return (
    <Box as="section" sx={preserve3d}>
      <HStack
        mb={2.5}
        minH="28px"
        transform={raised ? "translate3d(0,0,84px)" : "translateZ(28px)"}
      >
        <HStack spacing={1}>
          <Text fontSize="19px" fontWeight="700" letterSpacing="-0.02em">
            Estimated changes
          </Text>
          <Flex boxSize="22px" align="center" justify="center" color={ui.muted}>
            <InfoOutlineIcon boxSize="13px" />
          </Flex>
        </HStack>
        <Spacer />
        <HStack
          spacing={1}
          h="30px"
          px={2}
          bg={ui.raised}
          border="1px solid"
          borderColor={ui.border}
          borderRadius="8px"
        >
          <Text color={ui.secondary} fontSize="12px" fontWeight="500">
            on
          </Text>
          <Flex
            boxSize="17px"
            borderRadius="full"
            bg="#f4f4f5"
            align="center"
            justify="center"
          >
            <Image src="/images/base.svg" alt="" boxSize="13px" />
          </Flex>
          <Text fontSize="12px" fontWeight="600">
            Base
          </Text>
        </HStack>
      </HStack>

      <Box
        px={3}
        py={2.5}
        bg={ui.raised}
        border="1px solid"
        borderColor={ui.border}
        borderRadius="12px"
        boxShadow={raised ? "0 18px 38px rgba(0,0,0,0.30)" : "none"}
        transform={raised ? "translateZ(62px)" : "translateZ(42px)"}
        transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s ease"
        sx={preserve3d}
      >
        <AssetChange kind="send" raised={raised} />
        <AssetChange kind="receive" raised={raised} />
      </Box>
    </Box>
  );
}

function AssetChange({
  kind,
  raised,
}: {
  kind: "send" | "receive";
  raised: boolean;
}) {
  const outgoing = kind === "send";
  const color = outgoing ? ui.red : ui.green;

  return (
    <Box pt={outgoing ? 0 : 2.5} pb={outgoing ? 2 : 0} sx={preserve3d}>
      <HStack
        spacing={1.5}
        mb={2}
        transform={raised ? "translateZ(38px)" : "translateZ(12px)"}
        transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1)"
      >
        <Flex
          boxSize="20px"
          borderRadius="full"
          bg={color}
          color={ui.bg}
          align="center"
          justify="center"
        >
          {outgoing ? (
            <ArrowUpIcon boxSize="11px" transform="rotate(45deg)" />
          ) : (
            <ArrowDownIcon boxSize="11px" transform="rotate(45deg)" />
          )}
        </Flex>
        <Text
          color={color}
          fontSize="11px"
          fontWeight="700"
          textTransform="uppercase"
        >
          {outgoing ? "Send" : "Receive"}
        </Text>
      </HStack>
      <HStack
        align="center"
        minW={0}
        transform={raised ? "translateZ(68px)" : "translateZ(18px)"}
        transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1)"
      >
        <Image
          src={
            outgoing
              ? "/images/extension-preview/usdc.png"
              : "/images/ethereum.svg"
          }
          alt=""
          boxSize="30px"
          borderRadius="full"
        />
        <VStack align="start" spacing={0} minW={0}>
          <Text fontSize="15px" lineHeight="1.2" fontWeight="700">
            {outgoing ? "USDC" : "ETH"}
          </Text>
          {outgoing && (
            <HStack spacing={1} color={ui.muted}>
              <Text fontFamily="mono" fontSize="10px">
                0x8335...2913
              </Text>
              <CopyIcon boxSize="11px" />
              <ExternalLinkIcon boxSize="10px" />
            </HStack>
          )}
        </VStack>
        <Spacer />
        <VStack align="end" spacing={0}>
          <Text
            color={color}
            fontFamily="mono"
            fontSize="16px"
            lineHeight="1.2"
            fontWeight="700"
          >
            {outgoing ? "-5" : "+0.00256622"}
          </Text>
          <Text color={ui.secondary} fontSize="11px" fontWeight="600">
            $5.00
          </Text>
        </VStack>
      </HStack>
    </Box>
  );
}

function RequestDetails({
  raised,
  overviewRaised,
}: {
  raised: boolean;
  overviewRaised: boolean;
}) {
  return (
    <Box
      as="section"
      transform={raised ? "translate3d(0,0,54px)" : "translateZ(0)"}
      transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1)"
      willChange="transform"
      sx={preserve3d}
    >
      <HStack
        mb={2.5}
        transform={raised ? "translateZ(24px)" : "translateZ(30px)"}
      >
        <Text fontSize="19px" fontWeight="700" letterSpacing="-0.02em">
          Request details
        </Text>
        <Spacer />
        <Text color={ui.secondary} fontSize="12px" fontWeight="600">
          2 calls
        </Text>
      </HStack>

      <HStack
        px={1}
        mb={1}
        spacing={2}
        transform={overviewRaised ? "translateZ(86px)" : "translateZ(32px)"}
        transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1)"
        sx={preserve3d}
      >
        <Text
          color={ui.secondary}
          fontSize="11px"
          fontWeight="600"
          whiteSpace="nowrap"
        >
          Batch overview
        </Text>
        <Box
          flex={1}
          h="1px"
          bg={ui.border}
          transform={overviewRaised ? "translateZ(18px)" : "translateZ(0)"}
        />
        <HStack spacing={1} fontSize="13px" fontWeight="700">
          <Text>Approve</Text>
          <Text color={ui.amber}>+</Text>
          <Text>Swap</Text>
        </HStack>
      </HStack>

      <VStack spacing={1.5} align="stretch" sx={preserve3d}>
        <CallRow index={1} raised={raised}>
          <HStack spacing={1} minW={0}>
            <Text as="span" whiteSpace="nowrap">
              Approve 5
            </Text>
            <Image
              src="/images/extension-preview/usdc.png"
              alt=""
              boxSize="15px"
              borderRadius="full"
            />
            <Text as="span" isTruncated>
              USDC to AugustusV6
            </Text>
          </HStack>
        </CallRow>
        <CallRow index={2} raised={raised} right="0x6a00...1068">
          <Text isTruncated>swapExactAmountIn</Text>
        </CallRow>
      </VStack>
    </Box>
  );
}

function CallRow({
  index,
  raised,
  right,
  children,
}: {
  index: number;
  raised: boolean;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <HStack
      minH="46px"
      px={3}
      py={2}
      bg={ui.raised}
      border="1px solid"
      borderColor={ui.borderStrong}
      borderRadius="12px"
      boxShadow={
        raised
          ? index === 1
            ? "0 22px 42px rgba(0,0,0,0.40)"
            : "0 12px 28px rgba(0,0,0,0.30)"
          : "none"
      }
      transform={
        raised ? `translateZ(${index === 1 ? 92 : 58}px)` : "translateZ(38px)"
      }
      transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s ease"
    >
      <Flex
        boxSize="23px"
        flexShrink={0}
        borderRadius="8px"
        border="1px solid"
        borderColor={ui.borderStrong}
        color={ui.amber}
        align="center"
        justify="center"
        fontSize="12px"
        fontWeight="700"
      >
        {index}
      </Flex>
      <Box flex={1} minW={0} fontSize="13px" fontWeight="700">
        {children}
      </Box>
      {right && (
        <Text color={ui.muted} fontFamily="mono" fontSize="10px">
          {right}
        </Text>
      )}
      <ChevronDownIcon boxSize={4} color={ui.secondary} flexShrink={0} />
    </HStack>
  );
}

function DecisionBar({ feeRaised }: { feeRaised: boolean }) {
  return (
    <Box
      mt="auto"
      px={4}
      pt={2.5}
      pb={3}
      bg={ui.raised}
      borderTop="1px solid"
      borderColor={ui.border}
      transform="translateZ(0)"
      sx={preserve3d}
    >
      <VStack align="stretch" spacing={2} sx={preserve3d}>
        <HStack minH="28px">
          <Text color={ui.secondary} fontSize="11px" fontWeight="600">
            Signing with
          </Text>
          <Spacer />
          <MockSignerIdentity />
        </HStack>
        <HStack
          minH="32px"
          mt={-3}
          mx={-2}
          px={2}
          borderRadius="8px"
          bg={ui.raised}
          boxShadow={feeRaised ? "0 16px 34px rgba(0,0,0,0.34)" : "none"}
          transform={
            feeRaised ? "translate3d(0, -14px, 72px)" : "translateZ(0)"
          }
          transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s ease"
        >
          <Text color={ui.secondary} fontSize="11px" fontWeight="600">
            Pay network fee with
          </Text>
          <Spacer />
          <HStack
            h="32px"
            px={2.5}
            border="1px solid"
            borderColor={ui.border}
            borderRadius="8px"
            bg={ui.bg}
          >
            <Image
              src="/images/extension-preview/usdc.png"
              alt=""
              boxSize="18px"
              borderRadius="full"
            />
            <Text fontSize="12px" fontWeight="700">
              USDC
            </Text>
            <ChevronDownIcon boxSize={4} />
          </HStack>
        </HStack>
        <HStack spacing={2} pt={1}>
          <Flex
            as="button"
            flex={1}
            minH="44px"
            borderRadius="8px"
            bg={ui.raisedHover}
            align="center"
            justify="center"
            fontSize="15px"
            fontWeight="600"
            _hover={{ bg: "#202024" }}
            _active={{ transform: "translateY(1px)" }}
            _focusVisible={{ boxShadow: `0 0 0 3px ${ui.blue}` }}
          >
            Reject
          </Flex>
          <Flex
            as="button"
            flex={1}
            minH="44px"
            borderRadius="8px"
            bg={ui.amber}
            color={ui.bg}
            align="center"
            justify="center"
            fontSize="15px"
            fontWeight="700"
            _hover={{ bg: warmMockup.amberSoft }}
            _active={{ transform: "translateY(1px)" }}
            _focusVisible={{ boxShadow: `0 0 0 3px ${ui.blue}` }}
          >
            Confirm
          </Flex>
        </HStack>
      </VStack>
    </Box>
  );
}
