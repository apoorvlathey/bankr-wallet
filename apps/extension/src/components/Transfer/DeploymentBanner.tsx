import { Box, Text, VStack } from "@chakra-ui/react";
import { useTheme } from "@/theme";

export function DeploymentBanner() {
  const { tokens } = useTheme();
  return (
    <Box
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      bg="surface.raised"
      px={3}
      py={2.5}
    >
      <VStack align="stretch" spacing={0.5}>
        <Text fontSize="xs" fontWeight="800" color="text.primary">
          Contract deployment
        </Text>
        <Text
          fontSize="2xs"
          fontWeight="600"
          color="text.tertiary"
          lineHeight="short"
        >
          No recipient. The hex data below is sent as the deployment bytecode.
          Use the gear in the Hex Data section to switch back to a normal send.
        </Text>
      </VStack>
    </Box>
  );
}
