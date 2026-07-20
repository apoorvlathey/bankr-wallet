import { InfoIcon } from "@chakra-ui/icons";
import { HStack, Text } from "@chakra-ui/react";
import type { TransactionReplacementMeta } from "@/chrome/requests/pendingTxStorage";

export function ReplacementNotice({
  replacement,
}: {
  replacement: TransactionReplacementMeta;
}) {
  return (
    <HStack
      align="flex-start"
      spacing={2.5}
      p={3}
      bg="status.info.bg"
      color="status.info.fg"
      borderWidth="1px"
      borderColor="status.info.border"
      borderRadius="lg"
    >
      <InfoIcon boxSize={3.5} mt={0.5} flexShrink={0} aria-hidden />
      <Text fontSize="xs" fontWeight="600" lineHeight="short">
        {`Resubmits the pending transaction with nonce ${replacement.nonce} and higher fees. You can raise the gas further below.`}
      </Text>
    </HStack>
  );
}
