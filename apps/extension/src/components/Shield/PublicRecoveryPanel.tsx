import { ExternalLinkIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Text } from "@chakra-ui/react";

import { truncateAddress } from "@/lib/addressUtils";
import { getPublicWithdrawalCopy } from "./model/recovery";
import { formatShieldWei } from "./model/shieldQuote";

interface PublicRecoveryPanelProps {
  amountWei: bigint;
  depositAccountAddress: string;
  activeAccountMatches: boolean;
  waitingForAsp: boolean;
  isPrimaryRoute: boolean;
  status: "idle" | "preparing" | "queued" | "error";
  error: string | null;
  onRecover: () => void;
  onUseDepositAccount: () => void;
}

export default function PublicRecoveryPanel({
  amountWei,
  depositAccountAddress,
  activeAccountMatches,
  waitingForAsp,
  isPrimaryRoute,
  status,
  error,
  onRecover,
  onUseDepositAccount,
}: PublicRecoveryPanelProps) {
  if (amountWei <= 0n) return null;
  const copy = getPublicWithdrawalCopy(waitingForAsp);
  return (
    <Box
      borderTopWidth="1px"
      borderColor="border.subtle"
      px={1}
      pt={3}
    >
      <HStack align="center" spacing={2.5}>
        <Box
          boxSize="32px"
          flexShrink={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="surface.sunken"
          color="accent.highlight"
          borderRadius="sm"
          borderWidth="1px"
          borderColor="border.subtle"
        >
          <ExternalLinkIcon boxSize="15px" aria-hidden />
        </Box>
        <Box minW={0} flex="1">
          <Text fontSize="xs" fontWeight="700">
            {isPrimaryRoute ? "Public exit" : copy.title}
          </Text>
          <Text color="fg.secondary" fontSize="2xs" noOfLines={1}>
            {isPrimaryRoute
              ? "Available before eligibility"
              : `${formatShieldWei(amountWei)} ETH to ${truncateAddress(depositAccountAddress)}`}
          </Text>
        </Box>
        {!isPrimaryRoute && (
          <Button
            size="sm"
            variant="secondary"
            flexShrink={0}
            isLoading={activeAccountMatches && status === "preparing"}
            loadingText="Preparing"
            isDisabled={status === "queued"}
            onClick={activeAccountMatches ? onRecover : onUseDepositAccount}
          >
            {activeAccountMatches ? "Exit publicly" : "Use deposit account"}
          </Button>
        )}
      </HStack>
      <Text mt={1.5} color="accent.highlight" fontSize="2xs" fontWeight="600">
        Links this withdrawal directly to the deposit
      </Text>
      {(error || status === "queued") && (
        <Text
          mt={1}
          color={status === "error" ? "status.error.emphasis" : "fg.secondary"}
          fontSize="xs"
          role={status === "error" ? "alert" : "status"}
        >
          {error ?? "Open the wallet confirmation to continue."}
        </Text>
      )}
    </Box>
  );
}
