import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
  Badge,
  IconButton,
  Spacer,
  Tooltip,
} from "@chakra-ui/react";
import {
  WarningIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { useState } from "react";

import type { ClearSignedMeta } from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { useTheme } from "@/theme";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";

/**
 * Snapshot-driven "what did this transaction do?" hero card for the
 * Transaction Details modal.
 *
 * Mirrors the layout of `ERC20ApproveDisplay` (header strip / big action /
 * counterparty pill) so users get the same human-readable surface they saw on
 * the confirmation screen. Unlike the confirmation screen this card is fed
 * entirely by the `ClearSignedMeta` captured at submission time — no RPC,
 * eth.sh, or ENS calls happen during render — and is read-only (no edit
 * button on the amount).
 */

interface Props {
  meta: ClearSignedMeta;
  chainId: number;
}

// Card backgrounds.
//   approve: warning tint in Bauhaus (cornsilk yellow) / lifted navy in
//     Midnight — same colors `ERC20ApproveDisplay` uses, so the user
//     recognizes the "approve, with care" visual across confirmation and
//     activity-detail surfaces.
//   everything else: surface.sunken to integrate with the modal's other
//     section cards (transferMeta, From→To, gas).
function useCardBg(kind: ClearSignedMeta["kind"]) {
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  if (kind === "approve") {
    return isDarkTheme ? "surface.raisedHover" : "status.warning.tint";
  }
  return "surface.sunken";
}

function actionLabel(kind: ClearSignedMeta["kind"]): string {
  switch (kind) {
    case "approve":
      return "Approve Amount";
    case "transfer":
    case "nativeSend":
      return "Send Amount";
    case "erc7730":
      return "Action";
  }
}

function CopyIconButton({
  value,
  label,
  size = "xs",
}: {
  value: string;
  label: string;
  size?: "xs" | "sm";
}) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be unavailable in some contexts — silently no-op
    }
  };
  return (
    <IconButton
      aria-label={label}
      icon={copied ? <CheckIcon boxSize="9px" /> : <CopyIcon boxSize="9px" />}
      size={size}
      variant="ghost"
      minW={size === "xs" ? "18px" : "20px"}
      h={size === "xs" ? "18px" : "20px"}
      color={copied ? "accent.highlight" : "text.tertiary"}
      onClick={handle}
      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
    />
  );
}

export default function ClearSignedSummaryCard({ meta, chainId }: Props) {
  const { tokens, themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const cardBg = useCardBg(meta.kind);
  const chainConfig = getChainConfig(chainId);

  // Token logo: prewarm via the shared avatar cache so reopens are
  // synchronous. `useCachedAvatarSrc` returns null while warming, in which
  // case we fall back to the raw URL so the row never has a flicker frame.
  const cachedTokenLogo = useCachedAvatarSrc(meta.tokenLogo || undefined);
  const tokenLogoSrc = cachedTokenLogo || meta.tokenLogo || undefined;

  // Header strip content varies per kind so the same outer shell can host
  // an ERC-20 row, a chain-native row, or a contract row.
  const headerLogo =
    meta.kind === "erc7730" || (meta.kind === "nativeSend" && !meta.tokenLogo)
      ? null
      : tokenLogoSrc;

  const headerTitle = (() => {
    if (meta.kind === "erc7730") {
      return meta.contractName || meta.counterpartyLabel || "Contract Call";
    }
    if (meta.kind === "nativeSend") {
      return meta.tokenSymbol || "Native Asset";
    }
    return meta.tokenSymbol || "Token";
  })();

  const headerBadge = (() => {
    if (meta.kind === "approve" || meta.kind === "transfer") {
      return meta.tokenSymbol;
    }
    return null;
  })();

  const counterpartyAddress = meta.counterparty;
  const counterpartySectionLabel = (() => {
    switch (meta.kind) {
      case "approve":
        return "Spender";
      case "transfer":
      case "nativeSend":
        return "Recipient";
      case "erc7730":
        return "Contract";
    }
  })();

  return (
    <Box
      bg={cardBg}
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      overflow="hidden"
    >
      <VStack spacing={0} align="stretch">
        {/* Header strip — mirrors ERC20ApproveDisplay so the visual is
            recognizable across confirmation and activity-detail surfaces.
            Midnight gets a recessed sunken navy strip to read as a title bar
            against the lifted card bg; Bauhaus inherits the card bg. */}
        <HStack
          w="full"
          py={1.5}
          px={3}
          spacing={2}
          bg={isDarkTheme && meta.kind === "approve" ? "surface.sunken" : "transparent"}
        >
          {headerLogo ? (
            <Image
              src={headerLogo}
              alt={meta.tokenSymbol || ""}
              boxSize="20px"
              borderRadius="full"
              border="1.5px solid"
              borderColor="border.default"
            />
          ) : (
            <Box
              boxSize="20px"
              bg="accent.secondary"
              borderRadius="full"
              border="1.5px solid"
              borderColor="border.default"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize="8px" fontWeight="900" color="accentFg.secondary">
                {(meta.tokenSymbol || headerTitle).slice(0, 2).toUpperCase()}
              </Text>
            </Box>
          )}
          <Text fontSize="xs" fontWeight="700" color="text.primary" isTruncated>
            {headerTitle}
          </Text>
          {headerBadge && (
            <Badge
              fontSize="2xs"
              bg="surface.raised"
              color="text.secondary"
              border="1px solid"
              borderColor="border.subtle"
              px={1.5}
              py={0}
              fontWeight="700"
            >
              {headerBadge}
            </Badge>
          )}
          <Spacer />
          {/* For ERC-20 kinds we copy the token contract; for native sends
              there's no token contract; for erc7730 the contract == the
              counterparty (shown below). */}
          {meta.tokenAddress && (
            <CopyIconButton
              value={meta.tokenAddress}
              label="Copy token address"
              size="sm"
            />
          )}
          {meta.tokenAddress && chainConfig.explorer && (
            <IconButton
              aria-label="View token on explorer"
              icon={<ExternalLinkIcon boxSize="10px" />}
              size="xs"
              variant="ghost"
              minW="20px"
              h="20px"
              color="text.tertiary"
              onClick={() =>
                chrome.tabs.create({
                  url: `${chainConfig.explorer}/address/${meta.tokenAddress}`,
                })
              }
              _hover={{ color: "accent.secondary", bg: "surface.raised" }}
            />
          )}
        </HStack>

        {/* Main action block. Amount + symbol dominates for approve/transfer/
            nativeSend. For erc7730 we show the intent string (the descriptor's
            human-readable function summary). */}
        <Box
          w="full"
          py={3}
          px={3}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <Text
            fontSize="2xs"
            color="text.secondary"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="wider"
            mb={1}
          >
            {actionLabel(meta.kind)}
          </Text>
          {meta.kind === "approve" && meta.isInfinite ? (
            <Tooltip
              label="This grants unlimited spending of your tokens."
              fontSize="xs"
              hasArrow
              bg="fg.primary"
              color="fg.inverse"
              maxW="240px"
            >
              <HStack
                spacing={1.5}
                bg="status.error.bg"
                px={2}
                py={1}
                border={isDarkTheme ? "none" : "1.5px solid"}
                borderColor={isDarkTheme ? undefined : "status.error.border"}
                borderRadius={isDarkTheme ? "md" : "none"}
                display="inline-flex"
                w="fit-content"
              >
                <WarningIcon boxSize={3} color="status.error.fg" />
                <Text
                  fontSize="md"
                  fontWeight="900"
                  color="status.error.fg"
                  textTransform="uppercase"
                  letterSpacing="wide"
                >
                  Unlimited {meta.tokenSymbol || ""}
                </Text>
              </HStack>
            </Tooltip>
          ) : meta.kind === "erc7730" ? (
            <Text
              fontSize="md"
              fontWeight="800"
              color="text.primary"
              lineHeight="1.25"
            >
              {meta.intent || meta.contractName || "Contract interaction"}
            </Text>
          ) : (
            <Text
              fontSize="xl"
              fontWeight="900"
              color="text.primary"
              fontFamily="mono"
              lineHeight="1.1"
              isTruncated
            >
              {meta.amount}
              <Text as="span" fontSize="sm" fontWeight="700" color="text.secondary" ml={1}>
                {meta.tokenSymbol}
              </Text>
            </Text>
          )}
        </Box>

        {/* Counterparty (spender / recipient / contract). Same shape as the
            outer "To" row on the confirmation screen: ENS badge on top,
            address pill in the middle, eth.sh label on the bottom. Any subset
            may be visible; address pill is always present when we have a
            counterparty at all. */}
        {counterpartyAddress && (
          <Box
            w="full"
            py={2}
            px={3}
            borderTop="1px solid"
            borderColor="border.subtle"
          >
            <HStack justify="space-between" align="flex-start" spacing={2}>
              <Text
                fontSize="2xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="wider"
                pt={0.5}
              >
                {counterpartySectionLabel}
              </Text>
              <VStack spacing={1} align="flex-end" minW={0}>
                {meta.counterpartyEns && (
                  <Badge
                    fontSize="2xs"
                    bg="accent.highlight"
                    color="accentFg.highlight"
                    border="1.5px solid"
                    borderColor="border.default"
                    px={1.5}
                    py={0}
                    fontWeight="700"
                    maxW="180px"
                    isTruncated
                  >
                    {meta.counterpartyEns}
                  </Badge>
                )}
                <HStack
                  spacing={0.5}
                  px={1.5}
                  py={0.5}
                  bg="surface.raised"
                  border="1.5px solid"
                  borderColor="border.default"
                  borderRadius="md"
                  flexShrink={0}
                >
                  <Text fontSize="2xs" color="text.secondary" fontFamily="mono" fontWeight="700">
                    {counterpartyAddress.slice(0, 6)}...{counterpartyAddress.slice(-4)}
                  </Text>
                  <CopyIconButton
                    value={counterpartyAddress}
                    label={`Copy ${counterpartySectionLabel.toLowerCase()}`}
                  />
                  {chainConfig.explorer && (
                    <IconButton
                      aria-label="View on explorer"
                      icon={<ExternalLinkIcon boxSize="9px" />}
                      size="xs"
                      variant="ghost"
                      minW="18px"
                      h="18px"
                      color="text.tertiary"
                      onClick={() =>
                        chrome.tabs.create({
                          url: `${chainConfig.explorer}/address/${counterpartyAddress}`,
                        })
                      }
                      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                    />
                  )}
                </HStack>
                {meta.counterpartyLabel && (
                  <Badge
                    fontSize="2xs"
                    bg="accent.secondary"
                    color="accentFg.secondary"
                    border="1.5px solid"
                    borderColor="border.default"
                    px={1.5}
                    py={0}
                    fontWeight="700"
                    maxW="200px"
                    isTruncated
                  >
                    {meta.counterpartyLabel}
                  </Badge>
                )}
              </VStack>
            </HStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
}
