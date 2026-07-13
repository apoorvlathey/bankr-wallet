import { InfoOutlineIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { Box, HStack, Text } from "@chakra-ui/react";

interface SimulationBannerProps {
  borders: { medium: string };
}

/** Warning shown above confirmation content when the simulated call reverted. */
export function SimulationRevertedBanner({
  borders,
}: SimulationBannerProps) {
  return (
    <Box
      border={borders.medium}
      borderColor="status.error.border"
      borderRadius="lg"
      bg="status.error.bg"
      boxShadow="card"
      px={3}
      py={2.5}
    >
      <HStack spacing={2} align="flex-start">
        <WarningTwoIcon
          boxSize="14px"
          color="status.error.fg"
          mt="2px"
          flexShrink={0}
        />
        <Text
          fontSize="xs"
          fontWeight="700"
          color="status.error.fg"
          lineHeight="short"
        >
          Simulated transaction reverted. Signing this is likely to fail
          onchain.
        </Text>
      </HStack>
    </Box>
  );
}

/** Informational banner shown when simulation could not produce a result. */
export function SimulationUnavailableBanner({
  borders,
}: SimulationBannerProps) {
  return (
    <Box
      border={borders.medium}
      borderColor="status.info.border"
      borderRadius="lg"
      bg="status.info.bg"
      boxShadow="card"
      px={3}
      py={2.5}
    >
      <HStack spacing={2} align="flex-start">
        <InfoOutlineIcon
          boxSize="14px"
          color="status.info.fg"
          mt="2px"
          flexShrink={0}
        />
        <Text
          fontSize="xs"
          fontWeight="700"
          color="status.info.fg"
          lineHeight="short"
        >
          Asset change simulation unavailable. Onchain transfers may still
          occur.
        </Text>
      </HStack>
    </Box>
  );
}
