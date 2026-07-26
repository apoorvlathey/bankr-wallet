import { WarningTwoIcon } from "@chakra-ui/icons";
import {
  Box,
  Flex,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";

import type { ApprovalChange } from "@/chrome/txSimulation";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import TokenLogo from "@/components/TokenLogo";
import { formatTokenAmountFromBase } from "@/lib/tokenFormatUtils";

function spenderLabel(change: ApprovalChange): string {
  return (
    change.spenderLabel ||
    change.spenderEns ||
    `${change.spender.slice(0, 6)}...${change.spender.slice(-4)}`
  );
}

function amountLabel(change: ApprovalChange): string {
  if (change.isUnlimited) return `Unlimited ${change.symbol}`;
  const raw =
    change.remainingAmount ??
    change.requestedAmount;
  try {
    return `${formatTokenAmountFromBase(raw, change.decimals, {
      thousandsSeparator: true,
    })} ${change.symbol}`;
  } catch {
    return change.symbol;
  }
}

function expirationLabel(expiration: number | null): string | null {
  if (!expiration) return null;
  try {
    const expirationDate = new Date(expiration * 1000);
    if (Number.isNaN(expirationDate.getTime())) return null;
    return `Expires ${expirationDate.toLocaleString()}`;
  } catch {
    return null;
  }
}

function ApprovalRow({
  change,
  explorerUrl,
}: {
  change: ApprovalChange;
  explorerUrl: string;
}) {
  const unverified = change.verification === "unverified";
  const expiration = expirationLabel(change.expiration);
  const semanticColor = change.isUnlimited
    ? "status.error.emphasis"
    : "status.warning.emphasis";
  const allowance = amountLabel(change);
  return (
    <Box
      py={3}
      borderTop="1px solid"
      borderColor="border.subtle"
      _first={{ borderTop: 0 }}
    >
      <HStack spacing={2.5} align="center">
        <TokenLogo
          logoUrl={change.logoUrl}
          symbol={change.symbol}
          alt={change.symbol}
          size="32px"
          fontSize="8px"
        />
        <Text
          flex="1"
          minW={0}
          fontSize="sm"
          fontWeight="700"
          color="fg.primary"
          noOfLines={1}
        >
          {change.symbol} approval
        </Text>
      </HStack>

      <VStack
        align="stretch"
        spacing={0}
        mt={2.5}
        borderTop="1px solid"
        borderColor="border.subtle"
      >
        <HStack minH="44px" py={2} justify="space-between" spacing={3}>
          <Text
            flexShrink={0}
            fontSize="sm"
            fontWeight="700"
            color="fg.secondary"
          >
            {unverified ? "Requested allowance" : "Allowance after request"}
          </Text>
          <Text
            minW={0}
            maxW="62%"
            color={change.isUnlimited ? semanticColor : "fg.primary"}
            fontFamily="mono"
            fontSize="md"
            fontWeight="700"
            textAlign="right"
            noOfLines={1}
            title={allowance}
          >
            {allowance}
          </Text>
        </HStack>

        <HStack
          minH="40px"
          py={1}
          justify="space-between"
          spacing={3}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <Text flexShrink={0} fontSize="2xs" color="fg.secondary">
            Spender
          </Text>
          <LabeledAddressPopover
            account={null}
            address={change.spender}
            contextLabel="spender"
            explorer={explorerUrl || undefined}
            label={spenderLabel(change)}
            maxW="180px"
          />
        </HStack>

        {expiration && (
          <HStack
            minH="34px"
            py={1.5}
            justify="space-between"
            spacing={3}
            borderTop="1px solid"
            borderColor="border.subtle"
          >
            <Text flexShrink={0} fontSize="2xs" color="fg.secondary">
              Expiration
            </Text>
            <Text
              minW={0}
              fontSize="2xs"
              color="fg.primary"
              textAlign="right"
              noOfLines={1}
              title={expiration}
            >
              {expiration.replace(/^Expires\s+/u, "")}
            </Text>
          </HStack>
        )}
      </VStack>

      {unverified && (
        <Text
          mt={2}
          fontSize="2xs"
          color="status.warning.emphasis"
          lineHeight="short"
        >
          The final onchain allowance could not be verified.
        </Text>
      )}
    </Box>
  );
}

export function ApprovalChangesGroup({
  changes,
  detectionIncomplete,
  explorerUrl,
}: {
  changes: ApprovalChange[];
  detectionIncomplete: boolean;
  explorerUrl: string;
}) {
  if (changes.length === 0) return null;
  const hasUnlimited = changes.some((change) => change.isUnlimited);
  return (
    <Box role="alert">
      <HStack spacing={2.5} py={2.5}>
        <Flex
          boxSize="24px"
          flexShrink={0}
          align="center"
          justify="center"
          borderRadius="md"
          bg={hasUnlimited ? "status.error.bg" : "status.warning.bg"}
        >
          <WarningTwoIcon
            boxSize="12px"
            color={hasUnlimited
              ? "status.error.emphasis"
              : "status.warning.emphasis"}
          />
        </Flex>
        <Text
          minW={0}
          fontSize="xs"
          fontWeight="700"
          color={hasUnlimited
            ? "status.error.emphasis"
            : "status.warning.emphasis"}
          noOfLines={1}
        >
          Approval changed
        </Text>
      </HStack>
      <VStack
        align="stretch"
        spacing={0}
        borderTop="1px solid"
        borderColor="border.subtle"
      >
        {changes.map((change) => (
          <ApprovalRow
            key={[
              change.system,
              change.tokenAddress,
              change.owner,
              change.spender,
            ].join(":")}
            change={change}
            explorerUrl={explorerUrl}
          />
        ))}
      </VStack>
      {detectionIncomplete && (
        <HStack
          spacing={1.5}
          py={2.5}
          align="flex-start"
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <WarningTwoIcon
            mt="1px"
            boxSize="10px"
            flexShrink={0}
            color="status.warning.emphasis"
          />
          <Text
            fontSize="2xs"
            color="status.warning.emphasis"
            lineHeight="short"
          >
            Additional approvals may be present.
          </Text>
        </HStack>
      )}
    </Box>
  );
}
