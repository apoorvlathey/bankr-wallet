import { memo } from "react";
import { HStack, Box, Text } from "@chakra-ui/react";
import { BellIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { useTheme } from "@/theme";

interface PendingTxBannerProps {
  txCount: number;
  signatureCount: number;
  batchCount?: number;
  /** Number of entries staged in the user-assembled cross-dapp batch */
  crossDappBatchCount?: number;
  onClickTx: () => void;
  onClickSignature: () => void;
  onClickBatch?: () => void;
  onClickCrossDappBatch?: () => void;
}

function PendingTxBanner({
  txCount,
  signatureCount,
  batchCount = 0,
  crossDappBatchCount = 0,
  onClickTx,
  onClickSignature,
  onClickBatch,
  onClickCrossDappBatch,
}: PendingTxBannerProps) {
  const { tokens, themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const totalCount = txCount + signatureCount + batchCount + crossDappBatchCount;
  if (totalCount === 0) return null;

  // Determine the label and action based on what's pending
  const getLabel = () => {
    const parts: string[] = [];
    if (txCount > 0) parts.push(`${txCount} TX`);
    if (batchCount > 0) parts.push(`${batchCount} Batch`);
    if (signatureCount > 0) parts.push(`${signatureCount} Sig`);
    if (crossDappBatchCount > 0)
      parts.push(`${crossDappBatchCount} in Batch`);
    if (parts.length > 1) return parts.join(", ");
    if (txCount > 0) return `${txCount} Pending Request${txCount > 1 ? "s" : ""}`;
    if (batchCount > 0) return `${batchCount} Batch Request${batchCount > 1 ? "s" : ""}`;
    if (crossDappBatchCount > 0)
      return `Batch (${crossDappBatchCount} call${crossDappBatchCount > 1 ? "s" : ""})`;
    return `${signatureCount} Signature Request${signatureCount > 1 ? "s" : ""}`;
  };

  const handleClick = () => {
    // Priority: pending dapp tx > dapp-initiated batch > cross-dapp batch > sig.
    // Tx requests need user action first; the cross-dapp batch can keep waiting.
    if (txCount > 0) {
      onClickTx();
    } else if (batchCount > 0) {
      onClickBatch?.();
    } else if (crossDappBatchCount > 0) {
      onClickCrossDappBatch?.();
    } else {
      onClickSignature();
    }
  };

  return (
    <Box
      bg="accent.highlight"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius={tokens.radii.badge}
      boxShadow="card"
      px={3}
      py={1.5}
      cursor="pointer"
      onClick={handleClick}
      _hover={{
        transform: tokens.motion.hover.transform,
        boxShadow: tokens.motion.hover.shadowOverride ?? tokens.shadows.cardHover,
      }}
      _active={{
        transform: tokens.motion.press.transform,
        boxShadow: tokens.motion.press.shadowOverride ?? tokens.shadows.card,
      }}
      transition={tokens.motion.transitionBase}
    >
      <HStack spacing={2}>
        <Box
          p={1}
          bg="border.default"
          borderRadius={tokens.radii.badge}
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <BellIcon boxSize={3} color="accent.highlight" sx={{ animation: "bell-ring 1.5s ease-in-out infinite", transformOrigin: "top center" }} />
        </Box>
        <Text flex="1" textAlign="center" fontSize="xs" fontWeight="700" color="accentFg.highlight" textTransform="uppercase" letterSpacing="wider">
          {getLabel()}
        </Text>
        {isDarkTheme ? (
          <ChevronRightIcon boxSize={5} color="border.default" flexShrink={0} />
        ) : (
          <Box
            bg="border.default"
            p={0.5}
            borderRadius={tokens.radii.badge}
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <ChevronRightIcon boxSize={3.5} color="accent.highlight" />
          </Box>
        )}
      </HStack>
    </Box>
  );
}

export default memo(PendingTxBanner);
