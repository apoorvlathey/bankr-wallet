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
      border="2px solid"
      borderColor="bauhaus.black"
      boxShadow="3px 3px 0px 0px #121212"
      px={3}
      py={1.5}
      cursor="pointer"
      onClick={handleClick}
      _hover={{
        transform: "translateY(-2px)",
        boxShadow: "5px 5px 0px 0px #121212",
      }}
      _active={{
        transform: "translate(2px, 2px)",
        boxShadow: "none",
      }}
      transition="all 0.2s ease-out"
    >
      <HStack spacing={2}>
        <Box
          p={1}
          bg="bauhaus.black"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <BellIcon boxSize={3} color="bauhaus.yellow" sx={{ animation: "bell-ring 1.5s ease-in-out infinite", transformOrigin: "top center" }} />
        </Box>
        <Text flex="1" textAlign="center" fontSize="xs" fontWeight="700" color="bauhaus.black" textTransform="uppercase" letterSpacing="wider">
          {getLabel()}
        </Text>
        <Box
          bg="bauhaus.black"
          p={0.5}
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <ChevronRightIcon boxSize={3.5} color="bauhaus.yellow" />
        </Box>
      </HStack>
    </Box>
  );
}

export default memo(PendingTxBanner);
