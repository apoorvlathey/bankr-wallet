import {
  Badge,
  Box,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import NativeValueAmount from "@/components/NativeValueAmount";
import {
  AddressActions,
  LabeledAddressPopover,
} from "@/components/shared/LabeledAddressPopover";
import { useTheme } from "@/theme";

interface TransactionInfoCardProps {
  txRequest: PendingTxRequest;
  actionLabel: string | null;
  explorer?: string;
  nativeSymbol: string;
  nativePriceUsd: number | null;
  parsedApproval: unknown;
  isValueZero: boolean;
  toLabels: string[];
  resolvedToName: string | null;
}

export function TransactionInfoCard({
  txRequest,
  actionLabel,
  explorer,
  nativeSymbol,
  nativePriceUsd,
  parsedApproval,
  isValueZero,
  toLabels,
  resolvedToName,
}: TransactionInfoCardProps) {
  const { tokens } = useTheme();
  const { tx } = txRequest;
  const interactingLabel = toLabels[0] ?? resolvedToName;

  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="none"
      overflow="hidden"
      position="relative"
    >
      <VStack spacing={0} align="stretch">
        {actionLabel && (
          <HStack
            w="full"
            minH="48px"
            py={2}
            px={3}
            justify="space-between"
            spacing={3}
          >
            <Text
              fontSize="xs"
              color="fg.secondary"
              fontWeight="600"
              flexShrink={0}
            >
              Action
            </Text>
            <Text
              minW={0}
              color="fg.primary"
              fontSize="md"
              fontWeight="700"
              lineHeight="1.2"
              textAlign="right"
              noOfLines={1}
              title={actionLabel}
            >
              {actionLabel}
            </Text>
          </HStack>
        )}

        {!parsedApproval && (
          <VStack
            w="full"
            minH="56px"
            py={2.5}
            px={3}
            spacing={0}
            align="stretch"
            borderTop={actionLabel ? "1px solid" : 0}
            borderColor="border.subtle"
          >
            {tx.to ? (
              <HStack justify="space-between" spacing={3} minW={0}>
                <Text
                  fontSize="xs"
                  color="fg.secondary"
                  fontWeight="600"
                  flexShrink={0}
                >
                  Interacting with
                </Text>
                {interactingLabel ? (
                  <LabeledAddressPopover
                    address={tx.to}
                    contextLabel="interacting address"
                    explorer={explorer}
                    label={interactingLabel}
                  />
                ) : (
                  <AddressActions
                    address={tx.to}
                    compact
                    contextLabel="interacting address"
                    explorer={explorer}
                  />
                )}
              </HStack>
            ) : (
              <HStack justify="space-between" spacing={3}>
                <Text fontSize="xs" color="fg.secondary" fontWeight="600">
                  Type
                </Text>
                <Badge
                  fontSize="xs"
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  border="1.5px solid"
                  borderColor="border.default"
                  fontWeight="700"
                  px={2}
                  py={0.5}
                >
                  Contract deployment
                </Badge>
              </HStack>
            )}
          </VStack>
        )}

        {(!parsedApproval || !isValueZero) && (
          <HStack
            w="full"
            minH="48px"
            py={2}
            px={3}
            justify="space-between"
            borderTop={parsedApproval ? 0 : "1px solid"}
            borderColor="border.subtle"
          >
            <Text fontSize="xs" color="fg.secondary" fontWeight="600">
              Value
            </Text>
            <NativeValueAmount
              value={tx.value}
              symbol={nativeSymbol}
              priceUsd={nativePriceUsd}
              fontSize="xs"
              fontWeight="700"
            />
          </HStack>
        )}
      </VStack>
    </Box>
  );
}
