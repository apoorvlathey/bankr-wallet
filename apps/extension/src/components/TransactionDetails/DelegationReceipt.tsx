import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";

import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import {
  EIP_7702_DEFAULT_DELEGATE,
  getKnownDelegateName,
} from "@/constants/chainRegistry";

function SummaryRow({
  label,
  children,
  divider = true,
}: {
  label: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <HStack
      minH="48px"
      px={3}
      py={2.5}
      spacing={3}
      justify="space-between"
      borderTopWidth={divider ? "1px" : 0}
      borderTopStyle="solid"
      borderTopColor="border.subtle"
    >
      <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
        {label}
      </Text>
      <Box minW={0} textAlign="right">
        {children}
      </Box>
    </HStack>
  );
}

export default function DelegationReceipt({
  target,
  kind,
  explorer,
  resolvedLabel,
}: {
  target: string;
  kind: "revoke" | "setDelegate";
  explorer?: string;
  resolvedLabel?: string | null;
}) {
  const isRevoke = kind === "revoke";
  const isDefault =
    !isRevoke &&
    target.toLowerCase() === EIP_7702_DEFAULT_DELEGATE.toLowerCase();
  const delegateLabel =
    resolvedLabel ||
    getKnownDelegateName(target) ||
    `${target.slice(0, 8)}...${target.slice(-6)}`;

  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <VStack align="stretch" spacing={0}>
        <SummaryRow label="Action" divider={false}>
          <Text
            color="fg.primary"
            fontSize="md"
            fontWeight="700"
            lineHeight="short"
            textAlign="right"
            overflowWrap="anywhere"
          >
            {isRevoke
              ? "Remove smart account delegation"
              : "Enable smart account"}
          </Text>
        </SummaryRow>

        {isRevoke ? (
          <SummaryRow label="Result">
            <Text color="fg.primary" fontSize="sm" fontWeight="700">
              Delegation removed
            </Text>
          </SummaryRow>
        ) : (
          <>
            <SummaryRow label="Delegate">
              <LabeledAddressPopover
                address={target}
                contextLabel="smart account delegate"
                explorer={explorer}
                label={delegateLabel}
                maxW="220px"
              />
            </SummaryRow>
            <SummaryRow label="Policy">
              <Text color="fg.primary" fontSize="sm" fontWeight="700">
                {isDefault ? "WalletChan default" : "Custom delegate"}
              </Text>
            </SummaryRow>
          </>
        )}
      </VStack>
    </Box>
  );
}
