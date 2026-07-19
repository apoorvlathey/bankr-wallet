import { WarningIcon } from "@chakra-ui/icons";
import { HStack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

/** Shared reject-only notice for accounts that cannot sign the current request. */
export function ViewOnlySigningNotice({
  message = "View-only accounts can't sign",
  icon,
  trailing,
}: {
  message?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
}) {
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
      {icon ?? (
        <WarningIcon boxSize={4} flexShrink={0} aria-hidden="true" />
      )}
      <Text flex="1" minW={0} fontSize="sm" fontWeight="700" lineHeight="short">
        {message}
      </Text>
      {trailing}
    </HStack>
  );
}
