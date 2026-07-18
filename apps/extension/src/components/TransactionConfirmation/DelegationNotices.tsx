import {
  Badge,
  Box,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import { AddressActionsPopover } from "@/components/shared/LabeledAddressPopover";
import { useTheme } from "@/theme";

function NoticeShell({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Box
      p={3}
      bg="status.warning.bg"
      border={tokens.borders.medium}
      borderColor="status.warning.border"
      borderRadius="lg"
      boxShadow="card"
    >
      <VStack spacing={2.5} align="stretch">
        {children}
      </VStack>
    </Box>
  );
}

export function DelegationRevokeNotice({ chainName }: { chainName: string }) {
  return (
    <NoticeShell>
      <Text
        fontSize="xs"
        color="status.warning.fg"
        fontWeight="600"
        lineHeight="short"
      >
        This removes smart account capabilities on {chainName}. Regular account
        use is unaffected.
      </Text>
    </NoticeShell>
  );
}

interface DelegationSetNoticeProps {
  delegation: NonNullable<PendingTxRequest["delegation7702Meta"]>;
  chainName: string;
  delegateLabels: string[];
  explorer?: string;
}

export function DelegationSetNotice({
  delegation,
  chainName,
  delegateLabels,
  explorer,
}: DelegationSetNoticeProps) {
  return (
    <NoticeShell>
      <VStack spacing={1} align="stretch">
        <Text fontSize="sm" color="status.warning.fg" fontWeight="700">
          Enable smart account on {chainName}
        </Text>
        <Text fontSize="xs" color="status.warning.fg" lineHeight="short">
          Allows atomic batches. You can revoke this anytime in account settings.
        </Text>
      </VStack>

      <Box
        p={2}
        bg="surface.raised"
        border="1.5px solid"
        borderColor="status.warning.border"
        borderRadius="md"
      >
        <HStack mb={1.5} spacing={2} justify="space-between" align="center">
          <Text
            fontSize="2xs"
            color="status.warning.fg"
            fontWeight="700"
          >
            Delegating to
          </Text>
          {delegateLabels.length > 0 && (
            <Badge
              maxW="62%"
              bg="accent.secondary"
              color="accentFg.secondary"
              fontSize="2xs"
              fontWeight="800"
              px={1.5}
              py={0}
              border="1px solid"
              borderColor="border.default"
              noOfLines={1}
              title={delegateLabels[0]}
            >
              {delegateLabels[0]}
            </Badge>
          )}
        </HStack>
        <HStack w="full" minW={0} spacing={1} align="center" color="text.primary">
          <MiddleTruncatedAddress address={delegation.targetDelegate} />
          <AddressActionsPopover
            address={delegation.targetDelegate}
            contextLabel="delegate"
            explorer={explorer}
            compact
            showAddress={false}
            suggestedLabel={delegateLabels[0]}
          />
        </HStack>
      </Box>
    </NoticeShell>
  );
}
