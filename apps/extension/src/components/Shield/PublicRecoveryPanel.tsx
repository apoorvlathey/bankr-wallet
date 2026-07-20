import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";

import { truncateAddress } from "@/lib/addressUtils";
import { getPublicWithdrawalCopy } from "./model/recovery";
import { formatShieldWei } from "./model/shieldQuote";

interface PublicRecoveryPanelProps {
  amountWei: bigint;
  depositAccountAddress: string;
  activeAccountMatches: boolean;
  waitingForAsp: boolean;
  status: "idle" | "preparing" | "queued" | "error";
  error: string | null;
  onRecover: () => void;
}

export default function PublicRecoveryPanel({
  amountWei,
  depositAccountAddress,
  activeAccountMatches,
  waitingForAsp,
  status,
  error,
  onRecover,
}: PublicRecoveryPanelProps) {
  if (amountWei <= 0n) return null;
  const copy = getPublicWithdrawalCopy(waitingForAsp);
  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor={waitingForAsp ? "border.default" : "status.warning.border"}
      borderRadius="lg"
      px={4}
      py={4}
    >
      <Text fontSize="sm" fontWeight="600">
        {copy.title}
      </Text>
      <Text mt={1} color="fg.secondary" fontSize="xs">
        Return up to {formatShieldWei(amountWei)} ETH to {truncateAddress(depositAccountAddress)}.
        This publicly links the withdrawal to your deposit.
      </Text>
      {!activeAccountMatches ? (
        <Text mt={2} color="status.warning.emphasis" fontSize="xs">
          Switch to {truncateAddress(depositAccountAddress)} to withdraw these funds.
        </Text>
      ) : null}
      <HStack mt={3} justify="flex-end" align="center" spacing={3}>
        <VStack flex="1" minW={0} align="start" spacing={0}>
          <Text
            color={status === "error" ? "status.error.emphasis" : "fg.secondary"}
            fontSize="xs"
            role={status === "error" ? "alert" : undefined}
          >
            {error ?? (status === "queued"
              ? "Open the wallet confirmation to continue."
              : "")}
          </Text>
        </VStack>
        <Button
          size="sm"
          variant="secondary"
          isLoading={status === "preparing"}
          loadingText="Preparing"
          isDisabled={status === "queued" || !activeAccountMatches}
          onClick={onRecover}
        >
          {activeAccountMatches ? copy.action : "Switch account first"}
        </Button>
      </HStack>
    </Box>
  );
}
