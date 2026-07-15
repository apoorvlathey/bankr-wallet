import { HStack, Text } from "@chakra-ui/react";

import { FromAccountDisplay } from "@/components/FromAccountDisplay";

export function PermissionDecisionSummary({ address }: { address: string }) {
  return (
    <HStack minW={0} justify="space-between" spacing={3}>
      <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
        Signing with
      </Text>
      <HStack minW={0} justify="flex-end">
        <FromAccountDisplay address={address} />
      </HStack>
    </HStack>
  );
}
