import { memo } from "react";
import { HStack, Box, Text } from "@chakra-ui/react";
import { BellIcon, ChevronRightIcon } from "@chakra-ui/icons";

interface PendingTxBannerProps {
  txCount: number;
  signatureCount: number;
  batchCount?: number;
  onClickTx: () => void;
  onClickSignature: () => void;
  onClickBatch?: () => void;
}

function PendingTxBanner({ txCount, signatureCount, batchCount = 0, onClickTx, onClickSignature, onClickBatch }: PendingTxBannerProps) {
  const totalCount = txCount + signatureCount + batchCount;
  if (totalCount === 0) return null;

  // Determine the label and action based on what's pending
  const getLabel = () => {
    const parts: string[] = [];
    if (txCount > 0) parts.push(`${txCount} TX`);
    if (batchCount > 0) parts.push(`${batchCount} Batch`);
    if (signatureCount > 0) parts.push(`${signatureCount} Sig`);
    if (parts.length > 1) return parts.join(", ");
    if (txCount > 0) return `${txCount} Pending Request${txCount > 1 ? "s" : ""}`;
    if (batchCount > 0) return `${batchCount} Batch Request${batchCount > 1 ? "s" : ""}`;
    return `${signatureCount} Signature Request${signatureCount > 1 ? "s" : ""}`;
  };

  const handleClick = () => {
    if (txCount > 0) {
      onClickTx();
    } else if (batchCount > 0) {
      onClickBatch?.();
    } else {
      onClickSignature();
    }
  };

  return (
    <Box
      bg="bauhaus.yellow"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
      p={3}
      cursor="pointer"
      onClick={handleClick}
      _hover={{
        transform: "translateY(-2px)",
        boxShadow: "6px 6px 0px 0px #121212",
      }}
      _active={{
        transform: "translate(2px, 2px)",
        boxShadow: "none",
      }}
      transition="all 0.2s ease-out"
      position="relative"
    >
      {/* Corner decoration */}
      <Box
        position="absolute"
        top="-3px"
        right="-3px"
        w="10px"
        h="10px"
        bg="bauhaus.red"
        border="2px solid"
        borderColor="bauhaus.black"
      />

      <HStack spacing={0}>
        <Box w="40px" flexShrink={0}>
          <Box
            p={1.5}
            bg="bauhaus.black"
            w="fit-content"
          >
            <BellIcon boxSize={4} color="bauhaus.yellow" />
          </Box>
        </Box>
        <Box flex="1" textAlign="center">
          <Text fontSize="sm" fontWeight="700" color="bauhaus.black" textTransform="uppercase" letterSpacing="wider">
            {getLabel()}
          </Text>
        </Box>
        <Box w="40px" flexShrink={0} display="flex" justifyContent="flex-end">
          <Box bg="bauhaus.black" p={1}>
            <ChevronRightIcon color="bauhaus.yellow" />
          </Box>
        </Box>
      </HStack>
    </Box>
  );
}

export default memo(PendingTxBanner);
