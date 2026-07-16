import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { ClearSignedMeta } from "@/chrome/txHistoryStorage";
import TokenLogo from "@/components/TokenLogo";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { getChainConfig } from "@/constants/chainConfig";

interface Props {
  meta: ClearSignedMeta;
  chainId: number;
  details?: ReactNode;
  showDetails?: boolean;
}

interface ActionPresentation {
  label: string;
  description?: string;
}

function getActionPresentation(meta: ClearSignedMeta): ActionPresentation {
  const symbol = meta.tokenSymbol || "token";

  if (meta.kind === "approve") {
    if (meta.isRevoke) {
      return {
        label: `Revoke ${symbol} approval`,
        description: "The spender can no longer move this token.",
      };
    }
    if (meta.isInfinite) {
      return {
        label: `Approve unlimited ${symbol}`,
        description: "This approval does not have a spending limit.",
      };
    }
    return {
      label: `Approve ${meta.amount || "an amount of"} ${symbol}`,
    };
  }

  if (meta.kind === "erc7730") {
    return {
      label: meta.intent || meta.contractName || "Contract interaction",
    };
  }

  return {
    label: `Send ${meta.amount || "an amount of"} ${symbol}`,
  };
}

function counterpartyLabel(meta: ClearSignedMeta): string {
  if (meta.kind === "approve") return "Spender";
  if (meta.kind === "erc7730") return "Contract";
  return "Recipient";
}

export default function ClearSignedSummaryCard({
  meta,
  chainId,
  details,
  showDetails = false,
}: Props) {
  const explorer = getChainConfig(chainId).explorer;
  const action = getActionPresentation(meta);
  const fallbackCounterparty = meta.counterparty
    ? `${meta.counterparty.slice(0, 8)}…${meta.counterparty.slice(-6)}`
    : "";

  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderStyle="solid"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <VStack align="stretch" spacing={0}>
        <HStack
          minH="48px"
          px={3}
          py={2.5}
          spacing={3}
          justify="space-between"
          align={action.description ? "flex-start" : "center"}
        >
          <Text
            color="fg.secondary"
            fontSize="xs"
            fontWeight="600"
            flexShrink={0}
          >
            Action
          </Text>
          <VStack
            align="flex-end"
            justify="center"
            spacing={0.5}
            minW={0}
            flex="1"
          >
            <Text
              color="fg.primary"
              fontSize="md"
              fontWeight="700"
              lineHeight="short"
              textAlign="right"
              overflowWrap="anywhere"
            >
              {action.label}
            </Text>
            {action.description && (
              <Text
                color="fg.secondary"
                fontSize="xs"
                lineHeight="short"
                textAlign="right"
              >
                {action.description}
              </Text>
            )}
          </VStack>
        </HStack>

        {meta.tokenSymbol && meta.kind !== "erc7730" && (
          <HStack
            minH="48px"
            px={3}
            py={2.5}
            justify="space-between"
            spacing={3}
            borderTopWidth="1px"
            borderTopStyle="solid"
            borderTopColor="border.subtle"
          >
            <Text color="fg.secondary" fontSize="xs" fontWeight="600">
              Asset
            </Text>
            <HStack spacing={2} minW={0}>
              <TokenLogo
                logoUrl={meta.tokenLogo}
                symbol={meta.tokenSymbol}
                alt={meta.tokenSymbol}
                size="20px"
              />
              <Text color="fg.primary" fontSize="xs" fontWeight="700" noOfLines={1}>
                {meta.tokenSymbol}
              </Text>
            </HStack>
          </HStack>
        )}

        {meta.counterparty && (
          <HStack
            minH="48px"
            px={3}
            py={2.5}
            justify="space-between"
            spacing={3}
            borderTopWidth="1px"
            borderTopStyle="solid"
            borderTopColor="border.subtle"
          >
            <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
              {counterpartyLabel(meta)}
            </Text>
            <LabeledAddressPopover
              address={meta.counterparty}
              contextLabel={counterpartyLabel(meta).toLowerCase()}
              explorer={explorer}
              label={
                meta.counterpartyLabel ||
                meta.counterpartyEns ||
                fallbackCounterparty
              }
              maxW="220px"
            />
          </HStack>
        )}

        {details && (
          <Box
            display={showDetails ? "block" : "none"}
            bg="surface.sunken"
            borderTopWidth="1px"
            borderTopStyle="solid"
            borderTopColor="border.subtle"
          >
            {details}
          </Box>
        )}
      </VStack>
    </Box>
  );
}
