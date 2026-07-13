import { ExternalLinkIcon, SettingsIcon } from "@chakra-ui/icons";
import {
  Badge,
  Box,
  Collapse,
  Flex,
  HStack,
  IconButton,
  Image,
  Switch,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import ChainIcon from "@/components/ChainIcon";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import NativeValueAmount from "@/components/NativeValueAmount";
import SafeImage from "@/components/SafeImage";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useTheme } from "@/theme";
import { CopyButton } from "./CopyButton";
import type { ForceInclusionInfo } from "./types";

interface TransactionInfoCardProps {
  txRequest: PendingTxRequest;
  resolvedChainName: string;
  explorer?: string;
  nativeSymbol: string;
  parsedApproval: unknown;
  isValueZero: boolean;
  isInternalWalletChan: boolean;
  iconChipBg: string;
  originHostname: string | null;
  originInitials: string;
  toLabels: string[];
  resolvedToName: string | null;
  forceInclusion: boolean;
  forceInclusionInfo: ForceInclusionInfo | null;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  onForceInclusionChange: (enabled: boolean) => void;
}

export function TransactionInfoCard({
  txRequest,
  resolvedChainName,
  explorer,
  nativeSymbol,
  parsedApproval,
  isValueZero,
  isInternalWalletChan,
  iconChipBg,
  originHostname,
  originInitials,
  toLabels,
  resolvedToName,
  forceInclusion,
  forceInclusionInfo,
  showAdvanced,
  onToggleAdvanced,
  onForceInclusionChange,
}: TransactionInfoCardProps) {
  const { tokens } = useTheme();
  const { tx, origin, favicon } = txRequest;
  const originInitialsFallback = (
    <Box
      boxSize="14px"
      borderRadius="sm"
      bg="bg.muted"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize="7px" fontWeight="900" color="text.secondary">
        {originInitials}
      </Text>
    </Box>
  );

  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="none"
      overflow="hidden"
      position="relative"
    >
      <VStack spacing={0} align="stretch">
        <HStack w="full" minH="48px" py={2} px={3} justify="space-between">
          <Text fontSize="xs" color="text.secondary" fontWeight="600">
            Origin
          </Text>
          <HStack spacing={1.5}>
            <Box
              bg={isInternalWalletChan ? "transparent" : iconChipBg}
              border={isInternalWalletChan ? "none" : "1.5px solid"}
              borderColor="border.subtle"
              borderRadius="md"
              p={isInternalWalletChan ? 0 : 0.5}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {isInternalWalletChan ? (
                <Image
                  src="/walletchan-icon.png"
                  alt="WalletChan"
                  boxSize="20px"
                  sx={{
                    filter:
                      "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))",
                  }}
                />
              ) : favicon || originHostname ? (
                <SafeImage
                  src={favicon || undefined}
                  fallbackSrc={
                    originHostname ? googleFaviconUrl(originHostname) : undefined
                  }
                  alt="favicon"
                  boxSize="14px"
                  sx={{
                    filter:
                      "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))",
                  }}
                  fallback={originInitialsFallback}
                />
              ) : (
                originInitialsFallback
              )}
            </Box>
            <Text fontSize="sm" fontWeight="600" color="text.primary">
              {originHostname || origin}
            </Text>
          </HStack>
        </HStack>

        <HStack
          w="full"
          minH="48px"
          py={2}
          px={3}
          justify="space-between"
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <Text fontSize="xs" color="text.secondary" fontWeight="600">
            From
          </Text>
          <FromAccountDisplay address={tx.from} />
        </HStack>

        <HStack
          w="full"
          minH="48px"
          py={2}
          px={3}
          justify="space-between"
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <Text fontSize="xs" color="text.secondary" fontWeight="600">
            Network
          </Text>
          <HStack spacing={1}>
            <Badge
              fontSize="xs"
              bg="surface.sunken"
              color="text.primary"
              border="1px solid"
              borderColor="border.subtle"
              fontWeight="600"
              px={2}
              py={0.5}
              display="flex"
              alignItems="center"
              gap={1}
            >
              <ChainIcon
                chainId={tx.chainId}
                chainName={resolvedChainName}
                size="12px"
                withChip
              />
              {resolvedChainName}
              {forceInclusion && forceInclusionInfo && (
                <Text as="span" fontSize="2xs" opacity={0.7}>
                  via {forceInclusionInfo.l1ChainName}
                </Text>
              )}
            </Badge>
            {forceInclusionInfo && (
              <Tooltip label="Advanced options" fontSize="xs" hasArrow>
                <IconButton
                  aria-label="Advanced options"
                  icon={<SettingsIcon boxSize="10px" />}
                  size="xs"
                  variant="ghost"
                  minW="20px"
                  h="20px"
                  color={showAdvanced ? "accent.secondary" : "text.tertiary"}
                  onClick={onToggleAdvanced}
                  _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                />
              </Tooltip>
            )}
          </HStack>
        </HStack>

        {forceInclusionInfo && (
          <Collapse in={showAdvanced} animateOpacity>
            <Box w="full" py={2} px={3} bg="bg.muted">
              <HStack justify="space-between" mb={1}>
                <Text fontSize="xs" fontWeight="600" color="text.primary">
                  Force Inclusion
                </Text>
                <Switch
                  size="sm"
                  isChecked={forceInclusion}
                  onChange={(event) =>
                    onForceInclusionChange(event.target.checked)
                  }
                  colorScheme="blue"
                />
              </HStack>
              <Text fontSize="2xs" color="text.tertiary" fontWeight="500">
                Submit via L1 deposit ({forceInclusionInfo.l1ChainName}) to
                guarantee inclusion. Takes ~1-10 min.
              </Text>
            </Box>
          </Collapse>
        )}

        {!parsedApproval && (
          <Box
            w="full"
            minH="48px"
            py={2}
            px={3}
            borderTop="1px solid"
            borderColor="border.subtle"
          >
            <HStack
              justify="space-between"
              mb={toLabels.length > 0 || resolvedToName ? 1 : 0}
            >
              <Text fontSize="xs" color="text.secondary" fontWeight="600">
                {tx.to ? "To" : "Type"}
              </Text>
              {tx.to ? (
                <VStack spacing={1} align="flex-end">
                  {resolvedToName && (
                    <Badge
                      fontSize="2xs"
                      bg="accent.highlight"
                      color="accentFg.highlight"
                      border="1.5px solid"
                      borderColor="border.default"
                      px={1.5}
                      py={0}
                      fontWeight="700"
                      maxW="200px"
                      isTruncated
                    >
                      {resolvedToName}
                    </Badge>
                  )}
                  <HStack spacing={0.5} px={1.5} py={0.5} bg="transparent">
                    <Text
                      fontSize="xs"
                      color="text.primary"
                      fontFamily="mono"
                      fontWeight="600"
                    >
                      {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
                    </Text>
                    <CopyButton value={tx.to} />
                    {explorer && (
                      <IconButton
                        aria-label="View on explorer"
                        icon={<ExternalLinkIcon boxSize="12px" />}
                        size="xs"
                        variant="ghost"
                        minW="24px"
                        w="24px"
                        h="24px"
                        color="text.tertiary"
                        onClick={() =>
                          window.open(
                            `${explorer}/address/${tx.to}`,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                        _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                      />
                    )}
                  </HStack>
                </VStack>
              ) : (
                <Badge
                  fontSize="xs"
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  border="1.5px solid"
                  borderColor="border.default"
                  fontWeight="700"
                  px={2}
                  py={0.5}
                >
                  Contract Deployment
                </Badge>
              )}
            </HStack>
            {toLabels.length > 0 && (
              <Flex justify="flex-end">
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
                  {toLabels[0]}
                </Badge>
              </Flex>
            )}
          </Box>
        )}

        {(!parsedApproval || !isValueZero) && (
          <HStack
            w="full"
            minH="48px"
            py={2}
            px={3}
            justify="space-between"
            borderTop="1px solid"
            borderColor="border.subtle"
          >
            <Text fontSize="xs" color="text.secondary" fontWeight="600">
              Value
            </Text>
            <NativeValueAmount
              value={tx.value}
              symbol={nativeSymbol}
              fontSize="xs"
              fontWeight="700"
            />
          </HStack>
        )}
      </VStack>
    </Box>
  );
}
