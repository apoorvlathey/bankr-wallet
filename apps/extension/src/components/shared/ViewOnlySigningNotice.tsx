import { WarningIcon } from "@chakra-ui/icons";
import { HStack, Text } from "@chakra-ui/react";

/** Shared reject-only notice for signing requests pinned to a view-only account. */
export function ViewOnlySigningNotice() {
  return (
    <HStack
      role="status"
      align="center"
      spacing={2}
      minH={10}
      px={3}
      py={2}
      bg="accent.highlight"
      color="accentFg.highlight"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
    >
      <WarningIcon boxSize={4} flexShrink={0} aria-hidden="true" />
      <Text fontSize="sm" fontWeight="700" lineHeight="short">
        View-only accounts can't sign
      </Text>
    </HStack>
  );
}
