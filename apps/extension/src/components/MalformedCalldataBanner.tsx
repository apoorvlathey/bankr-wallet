import { Box, HStack, VStack, Text } from "@chakra-ui/react";
import { WarningTwoIcon } from "@chakra-ui/icons";

/**
 * Banner shown at the top of every tx confirmation surface when the calldata
 * starts with a recognised ERC20-family selector but is not canonically
 * ABI-encoded (non-zero address padding, wrong length, etc.). Signing is
 * blocked while this is visible — the structured approval/transfer card is
 * also suppressed in this case so the user can't be tricked by a clean-looking
 * recipient extracted from malformed bytes.
 *
 * See `lib/calldataValidation.ts` for the validation rules.
 */
export function MalformedCalldataBanner({
  borders,
  reason,
  functionName,
}: {
  borders: { medium: string };
  reason: string;
  functionName?: string;
}) {
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
        <VStack spacing={0.5} align="start" flex={1}>
          <Text
            fontSize="xs"
            fontWeight="900"
            color="status.error.fg"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            Malformed calldata — signing blocked
            {functionName ? ` (${functionName})` : ""}
          </Text>
          <Text fontSize="xs" fontWeight="600" color="status.error.fg" lineHeight="short">
            {reason}
          </Text>
        </VStack>
      </HStack>
    </Box>
  );
}
