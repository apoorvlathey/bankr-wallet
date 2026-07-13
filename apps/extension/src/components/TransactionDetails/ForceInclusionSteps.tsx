import { Box, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import { CheckCircleIcon, WarningIcon } from "@chakra-ui/icons";
import type { ForceInclusionMeta } from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { isDarkThemeId, useTheme } from "@/theme";
import { getForceInclusionState } from "./forceInclusionState";

export default function ForceInclusionSteps({
  meta,
  status,
  txHash,
}: {
  meta: ForceInclusionMeta;
  status: string;
  txHash: string | undefined;
}) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  // The step circles are vivid filled discs (red/green/blue) with a small icon
  // inside. White contrasts well against the vivid Bauhaus palette but vanishes
  // against Midnight's lighter chart tints — flip to a near-black icon there.
  const stepIconColor = isDarkTheme ? "fg.inverse" : "white";
  const l1Config = getChainConfig(meta.l1ChainId);
  const l2Config = getChainConfig(meta.l2ChainId);
  const l1HasHash = !!meta.l1TxHash;
  const { l1Confirmed, l1Reverted, l2Confirmed, l2Reverted } =
    getForceInclusionState(meta, status, txHash);

  return (
    <Box
      border="2px solid"
      borderColor="border.default"
      bg="bg.muted"
      p={3}
    >
      <Text fontSize="2xs" fontWeight="700" textTransform="uppercase" color="text.secondary" mb={2}>
        Force Inclusion Progress
      </Text>
      <VStack spacing={2} align="stretch">
        {/* Step 1: L1 */}
        <HStack spacing={2}>
          <Box
            w="18px" h="18px" flexShrink={0}
            border="2px solid" borderColor="border.default"
            bg={l1Reverted ? "chart.negative" : l1Confirmed ? "chart.positive" : "accent.secondary"}
            display="flex" alignItems="center" justifyContent="center"
          >
            {l1Reverted ? (
              <WarningIcon boxSize={2.5} color={stepIconColor} />
            ) : l1Confirmed ? (
              <CheckCircleIcon boxSize={2.5} color={stepIconColor} />
            ) : (
              <Spinner size="xs" color={stepIconColor} boxSize="10px" />
            )}
          </Box>
          <Text fontSize="xs" fontWeight="700" color="text.primary">
            L1 Deposit ({l1Config.name || "Ethereum"})
          </Text>
          {l1Reverted ? (
            <Text fontSize="2xs" color="chart.negative" fontWeight="600">Failed</Text>
          ) : l1Confirmed ? (
            <Text fontSize="2xs" color="chart.positive" fontWeight="600">Confirmed</Text>
          ) : l1HasHash ? (
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">Pending...</Text>
          ) : null}
        </HStack>
        {/* Step 2: L2 */}
        <HStack spacing={2}>
          <Box
            w="18px" h="18px" flexShrink={0}
            border="2px solid" borderColor="border.default"
            bg={
              l2Reverted
                ? "chart.negative"
                : l2Confirmed
                  ? "chart.positive"
                  : l1Confirmed
                    ? "accent.secondary"
                    : "border.subtle"
            }
            display="flex" alignItems="center" justifyContent="center"
          >
            {l2Reverted ? (
              <WarningIcon boxSize={2.5} color={stepIconColor} />
            ) : l2Confirmed ? (
              <CheckCircleIcon boxSize={2.5} color={stepIconColor} />
            ) : l1Confirmed ? (
              <Spinner size="xs" color={stepIconColor} boxSize="10px" />
            ) : (
              <Text fontSize="2xs" fontWeight="800" color="text.tertiary">2</Text>
            )}
          </Box>
          <Text fontSize="xs" fontWeight="700" color={l1Confirmed ? "text.primary" : "text.tertiary"}>
            L2 Sequencer ({l2Config.name || "L2"})
          </Text>
          {l2Reverted ? (
            <Text fontSize="2xs" color="chart.negative" fontWeight="600">Reverted</Text>
          ) : l2Confirmed ? (
            <Text fontSize="2xs" color="chart.positive" fontWeight="600">Confirmed</Text>
          ) : l1Confirmed ? (
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">Awaiting inclusion...</Text>
          ) : null}
        </HStack>
      </VStack>
    </Box>
  );
}
