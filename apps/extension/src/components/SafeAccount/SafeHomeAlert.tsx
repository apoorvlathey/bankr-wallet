import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { ChevronRightIcon } from "@chakra-ui/icons";
import { SafeIcon } from "@/components/shared/AccountTypeIcons";
import { usePendingSafeProposalCount } from "./usePendingSafeProposalCount";

export function SafeHomeAlert({ safeAccountId, onOpen }: { safeAccountId: string; onOpen: () => void }) {
  const pendingCount = usePendingSafeProposalCount(safeAccountId);
  if (pendingCount === 0) return null;
  return (
    <Box
      as="button"
      type="button"
      aria-label="View pending Safe requests"
      onClick={onOpen}
      w="full"
      px={3}
      py={2}
      bg="accent.highlight"
      color="accentFg.highlight"
      border="1px solid"
      borderColor="accent.highlight"
      borderRadius="lg"
      appearance="none"
      cursor="pointer"
      fontFamily="inherit"
      textAlign="left"
      _hover={{ opacity: 0.92 }}
      _active={{ opacity: 0.84 }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "border.focus",
        outlineOffset: "2px",
      }}
    >
      <HStack spacing={2} align="center">
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxSize="32px"
          flexShrink={0}
          color="accentFg.highlight"
        >
          <SafeIcon boxSize="24px" />
        </Box>
        <VStack flex={1} minW={0} align="stretch" spacing={0.5}>
          <Text fontSize="sm" fontWeight="700" lineHeight="1.25" whiteSpace="nowrap">
            Pending Safe Requests
          </Text>
          <Text fontSize="xs" lineHeight="1.25" opacity={0.72}>
            {pendingCount} pending request{pendingCount === 1 ? "" : "s"}
          </Text>
        </VStack>
        <HStack
          spacing={1}
          flexShrink={0}
          minH="36px"
          px={2}
        >
          <Text fontSize="sm" fontWeight="700">View</Text>
          <ChevronRightIcon boxSize={4} />
        </HStack>
      </HStack>
    </Box>
  );
}
