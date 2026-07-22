import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Text } from "@chakra-ui/react";

import type { Account } from "@/chrome/types";
import PublicRecoveryAccountIdentity from "./PublicRecoveryAccountIdentity";

interface PublicRecoveryPanelProps {
  amountWei: bigint;
  depositAccountAddress: string;
  depositAccount: Account | null;
  displayName: string | null;
  ensAvatar: string | null;
  secondaryIdentity: string | null;
  canReview: boolean;
  status: "idle" | "previewing" | "ready" | "preparing" | "queued" | "error";
  error: string | null;
  onReview: () => void;
}

export default function PublicRecoveryPanel({
  amountWei,
  depositAccountAddress,
  depositAccount,
  displayName,
  ensAvatar,
  secondaryIdentity,
  canReview,
  status,
  error,
  onReview,
}: PublicRecoveryPanelProps) {
  if (amountWei <= 0n) return null;

  return (
    <Box
      bg="surface.sunken"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
      px={3}
      py={2.5}
    >
      <Text fontSize="xs" fontWeight="700" color="fg.primary">
        Public exit available
      </Text>

      <HStack mt={2.5} spacing={2.5} justify="space-between">
        <Box minW={0} flex="1">
          <PublicRecoveryAccountIdentity
            account={depositAccount}
            address={depositAccountAddress}
            displayName={displayName}
            ensAvatar={ensAvatar}
            secondaryIdentity={secondaryIdentity}
          />
        </Box>
        <Button
          size="sm"
          variant="secondary"
          h="36px"
          px={3}
          flexShrink={0}
          isLoading={status === "previewing"}
          loadingText="Checking"
          isDisabled={!canReview || status === "queued" || status === "preparing"}
          onClick={onReview}
        >
          Review exit
        </Button>
      </HStack>

      <HStack mt={2.5} spacing={1.5} color="status.warning.emphasis">
        <InfoOutlineIcon boxSize="12px" flexShrink={0} aria-hidden />
        <Text fontSize="2xs" fontWeight="600" lineHeight="short">
          Public transaction · directly linked to this deposit
        </Text>
      </HStack>

      {error && status === "error" ? (
        <Text mt={2} color="status.error.emphasis" fontSize="xs" role="alert">
          {error}
        </Text>
      ) : null}
    </Box>
  );
}
