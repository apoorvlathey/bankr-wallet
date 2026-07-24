"use client";

import { ArrowBackIcon } from "@chakra-ui/icons";
import { Box, Flex, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import {
  AccountTypeArtwork,
  type AccountArtworkKind,
} from "./AccountTypeArtwork";
import { warmMockup } from "./design";

const ui = {
  bg: warmMockup.base,
  raised: warmMockup.surface,
  border: warmMockup.border,
  borderStrong: warmMockup.borderStrong,
  text: warmMockup.text,
  secondary: warmMockup.secondary,
  blue: warmMockup.blue,
  amber: warmMockup.amber,
  green: warmMockup.green,
};

const preserve3d = { transformStyle: "preserve-3d" } as const;

const accountTypes = [
  {
    title: "Seed phrase",
    description: "Import or create",
    kind: "seedPhrase",
    color: ui.blue,
    tint: "rgba(59,130,246,0.12)",
    depth: 38,
  },
  {
    title: "Private key",
    description: "Import a local signer",
    kind: "privateKey",
    color: ui.amber,
    tint: "rgba(245,158,11,0.12)",
    depth: 32,
  },
  {
    title: "View-only",
    description: "Watch an address",
    kind: "viewOnly",
    color: ui.green,
    tint: "rgba(74,222,128,0.10)",
    depth: 46,
  },
  {
    title: "Ledger",
    description: "Connect a hardware wallet",
    kind: "ledger",
    color: ui.text,
    tint: "rgba(0,0,0,0.46)",
    depth: 96,
    featured: true,
  },
  {
    title: "Safe",
    description: "Use an existing multisig",
    kind: "safe",
    color: ui.green,
    tint: "rgba(74,222,128,0.10)",
    depth: 82,
    featured: true,
  },
  {
    title: "Bankr API",
    description: "Connect your account",
    kind: "bankr",
    color: ui.text,
    tint: "transparent",
    depth: 28,
  },
] as const;

export function AccountTypesPreview() {
  return (
    <Flex
      direction="column"
      minH="700px"
      bg={ui.bg}
      color={ui.text}
      borderRadius="22px"
      overflow="visible"
      sx={preserve3d}
    >
      <Flex
        minH="54px"
        px={3}
        align="center"
        gap={3}
        borderBottom="1px solid"
        borderColor={ui.border}
        transform="translateZ(22px)"
      >
        <Flex boxSize="34px" align="center" justify="center" borderRadius="8px">
          <ArrowBackIcon boxSize={5} />
        </Flex>
        <Text fontSize="20px" fontWeight="700" letterSpacing="-0.02em">
          Add account
        </Text>
      </Flex>

      <Box px={4} pt={6} pb={5} sx={preserve3d}>
        <Text
          mb={4}
          fontSize="22px"
          lineHeight="1.15"
          fontWeight="700"
          letterSpacing="-0.025em"
          transform="translateZ(34px)"
        >
          Choose an account type
        </Text>

        <SimpleGrid columns={2} spacing={3} sx={preserve3d}>
          {accountTypes.map((account) => {
            const featured = "featured" in account && account.featured;
            return (
              <VStack
                key={account.title}
                align="stretch"
                justify="space-between"
                minH="146px"
                p={4}
                spacing={4}
                bg={ui.raised}
                border="1px solid"
                borderColor={
                  featured
                    ? account.title === "Safe"
                      ? "rgba(74,222,128,0.34)"
                      : ui.borderStrong
                    : ui.border
                }
                borderRadius="12px"
                boxShadow={
                  featured
                    ? "0 20px 38px rgba(0,0,0,0.34)"
                    : "none"
                }
                transform={`translateZ(${account.depth}px)`}
                transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s ease"
              >
                <Flex
                  boxSize="42px"
                  align="center"
                  justify="center"
                  borderRadius="9px"
                  bg={account.tint}
                  color={account.color}
                  transform={featured ? "translateZ(22px)" : "translateZ(10px)"}
                >
                  <AccountTypeArtwork
                    kind={account.kind as AccountArtworkKind}
                  />
                </Flex>
                <Box transform={featured ? "translateZ(18px)" : "translateZ(8px)"}>
                  <Text fontSize="16px" lineHeight="1.2" fontWeight="700">
                    {account.title}
                  </Text>
                  <Text
                    mt={1}
                    color={ui.secondary}
                    fontSize="13px"
                    lineHeight="1.3"
                    fontWeight="400"
                  >
                    {account.description}
                  </Text>
                </Box>
              </VStack>
            );
          })}
        </SimpleGrid>
      </Box>
    </Flex>
  );
}
