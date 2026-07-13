import { memo } from "react";
import { HStack, Box, Text, usePrefersReducedMotion } from "@chakra-ui/react";
import { BellIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { isDarkThemeId, useTheme } from "@/theme";

interface PendingTxBannerProps {
  txCount: number;
  signatureCount: number;
  permissionCount?: number;
  batchCount?: number;
  /** Number of entries staged in the user-assembled cross-dapp batch */
  crossDappBatchCount?: number;
  onClickTx: () => void;
  onClickSignature: () => void;
  onClickPermission?: () => void;
  onClickBatch?: () => void;
  onClickCrossDappBatch?: () => void;
}

function PendingTxBanner({
  txCount,
  signatureCount,
  permissionCount = 0,
  batchCount = 0,
  crossDappBatchCount = 0,
  onClickTx,
  onClickSignature,
  onClickPermission,
  onClickBatch,
  onClickCrossDappBatch,
}: PendingTxBannerProps) {
  const { tokens, themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const prefersReducedMotion = usePrefersReducedMotion();
  const totalCount =
    txCount + signatureCount + permissionCount + batchCount + crossDappBatchCount;
  if (totalCount === 0) return null;

  // Determine the label and action based on what's pending
  const getLabel = () => {
    const parts: string[] = [];
    if (txCount > 0) parts.push(`${txCount} TX`);
    if (batchCount > 0) parts.push(`${batchCount} Batch`);
    if (permissionCount > 0) parts.push(`${permissionCount} Perm`);
    if (signatureCount > 0) parts.push(`${signatureCount} Sig`);
    if (crossDappBatchCount > 0)
      parts.push(`${crossDappBatchCount} in Batch`);
    if (parts.length > 1) return parts.join(", ");
    if (txCount > 0) return `${txCount} Pending Request${txCount > 1 ? "s" : ""}`;
    if (batchCount > 0) return `${batchCount} Batch Request${batchCount > 1 ? "s" : ""}`;
    if (permissionCount > 0) return `${permissionCount} Permission Request${permissionCount > 1 ? "s" : ""}`;
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
    } else if (permissionCount > 0) {
      onClickPermission?.();
    } else if (crossDappBatchCount > 0) {
      onClickCrossDappBatch?.();
    } else {
      onClickSignature();
    }
  };

  return (
    <Box
      as="button"
      type="button"
      w="full"
      appearance="none"
      fontFamily="inherit"
      bg="accent.highlight"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius={tokens.radii.badge}
      boxShadow="card"
      px={3}
      py={1.5}
      cursor="pointer"
      textAlign="start"
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
        <BellIcon
          boxSize={4}
          ml={1}
          flexShrink={0}
          color="accentFg.highlight"
          sx={{
            animation: prefersReducedMotion
              ? undefined
              : "bell-ring 1.5s ease-in-out infinite",
            transformOrigin: "top center",
          }}
        />
        <Text
          flex="1"
          textAlign="center"
          fontSize="xs"
          fontWeight="600"
          color="accentFg.highlight"
          textTransform={isDarkTheme ? "none" : "uppercase"}
          letterSpacing={isDarkTheme ? "normal" : "wider"}
        >
          {getLabel()}
        </Text>
        <ChevronRightIcon
          boxSize={5}
          color="accentFg.highlight"
          flexShrink={0}
        />
      </HStack>
    </Box>
  );
}

export default memo(PendingTxBanner);
