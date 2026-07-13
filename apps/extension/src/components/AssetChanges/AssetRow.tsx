import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { Box, HStack, IconButton, Text, Tooltip, VStack } from "@chakra-ui/react";
import { useState } from "react";
import type { AssetChange } from "@/chrome/txSimulation";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { NftPreview, NftStandardTag } from "./NftMedia";
import { TokenIcon } from "./TokenIcon";

export function AssetRow({
  change,
  explorerUrl,
}: {
  change: AssetChange;
  explorerUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const isNative = change.address === "native";
  const isNft = !!change.nft;

  const handleCopy = async () => {
    if (isNative) return;
    try {
      await navigator.clipboard.writeText(change.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard writes can fail when the extension view is not focused.
    }
  };

  const directionColor =
    change.direction === "out" ? "chart.negative" : "chart.positive";
  const showName = change.name && change.name !== change.symbol;
  const amountLabel = isNft
    ? `${change.direction === "out" ? "\u2212" : "+"}${
        change.nft!.amount ?? change.formattedAmount
      }`
    : `${change.direction === "out" ? "\u2212" : "+"}${change.formattedAmount}`;
  const nftDisplayName =
    change.nft?.metadata?.name ||
    (showName ? change.name : null) ||
    `${change.address.slice(0, 6)}...${change.address.slice(-4)}`;

  return (
    <Box w="full" py={2}>
      <HStack spacing={2.5} align={isNft ? "flex-start" : "center"}>
        {isNft ? <NftPreview change={change} /> : <TokenIcon change={change} />}

        <VStack spacing={0} flex="1" minW={0} align="stretch">
          <HStack w="full" justify="space-between" spacing={2} align="center">
            <HStack spacing={1.5} minW={0}>
              <Text
                fontSize="sm"
                fontWeight="700"
                color="text.primary"
                noOfLines={1}
              >
                {change.symbol}
              </Text>
              {isNft && <NftStandardTag standard={change.nft!.standard} />}
            </HStack>
            <VStack spacing={0} align="flex-end" flexShrink={0}>
              <Text
                fontSize="sm"
                fontWeight="700"
                fontFamily="mono"
                color={directionColor}
              >
                {amountLabel}
              </Text>
              {isNative && change.valueUsd !== null && (
                <Text fontSize="2xs" fontWeight="600" color="text.secondary">
                  {formatUsd(change.valueUsd)}
                </Text>
              )}
            </VStack>
          </HStack>

          {!isNative && (
            <HStack w="full" justify="space-between" spacing={2}>
              <HStack spacing={0.5} minW={0}>
                <Text fontSize="2xs" color="text.tertiary" noOfLines={1}>
                  {isNft
                    ? nftDisplayName
                    : showName
                      ? change.name
                      : `${change.address.slice(0, 6)}...${change.address.slice(-4)}`}
                </Text>
                <Tooltip label="Copy address" fontSize="xs" hasArrow>
                  <IconButton
                    aria-label="Copy"
                    icon={copied ? <CheckIcon /> : <CopyIcon />}
                    size="xs"
                    variant="ghost"
                    minW="24px"
                    w="24px"
                    h="24px"
                    color={copied ? "accent.highlight" : "text.tertiary"}
                    onClick={handleCopy}
                    _hover={{ color: "accent.secondary", bg: "transparent" }}
                  />
                </Tooltip>
                {explorerUrl && (
                  <Tooltip label="View on explorer" fontSize="xs" hasArrow>
                    <IconButton
                      aria-label="View on explorer"
                      icon={<ExternalLinkIcon boxSize="9px" />}
                      size="xs"
                      variant="ghost"
                      minW="24px"
                      w="24px"
                      h="24px"
                      color="text.tertiary"
                      onClick={() =>
                        window.open(
                          `${explorerUrl}/address/${change.address}`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      _hover={{ color: "accent.secondary", bg: "transparent" }}
                    />
                  </Tooltip>
                )}
              </HStack>
              {!isNft && change.valueUsd !== null && (
                <Text
                  fontSize="2xs"
                  fontWeight="600"
                  color="text.secondary"
                  flexShrink={0}
                >
                  {formatUsd(change.valueUsd)}
                </Text>
              )}
            </HStack>
          )}

          {isNft && change.nft!.tokenId !== null && (
            <Text
              fontSize="2xs"
              fontFamily="mono"
              fontWeight="700"
              color="text.secondary"
              noOfLines={1}
              mt={0.5}
            >
              #{change.nft!.tokenId}
            </Text>
          )}
        </VStack>
      </HStack>
    </Box>
  );
}
