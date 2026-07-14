import { Box, HStack, Switch, Text, VStack } from "@chakra-ui/react";

interface ForceInclusionOptionProps {
  l1ChainName: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  ariaLabel?: string;
}

/** Shared last-row advanced option for OP Stack force inclusion. */
export function ForceInclusionOption({
  l1ChainName,
  enabled,
  onChange,
  ariaLabel = "Force transaction inclusion",
}: ForceInclusionOptionProps) {
  return (
    <Box w="full" px={3} py={2.5}>
      <HStack justify="space-between" spacing={3}>
        <VStack align="stretch" spacing={0.5} minW={0}>
          <Text fontSize="xs" fontWeight="600" color="fg.primary">
            Force inclusion
          </Text>
          <Text fontSize="2xs" color="fg.secondary" fontWeight="500">
            Submit through {l1ChainName} to guarantee inclusion. Usually takes
            1–10 minutes.
          </Text>
        </VStack>
        <Switch
          size="sm"
          flexShrink={0}
          isChecked={enabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={ariaLabel}
          colorScheme="blue"
        />
      </HStack>
    </Box>
  );
}
