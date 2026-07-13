import { Badge, Box, Image, Text, VStack } from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import SafeImage from "@/components/SafeImage";
import { AssetDeltaRow, OutcomeCard } from "@/components/ui";
import { googleFaviconUrl } from "@/constants/externalUrls";
import type { ParsedTransactionValue } from "./transactionValue";

interface TransactionOutcomeProps {
  txRequest: PendingTxRequest;
  outcomeText: string;
  iconChipBg: string;
  isInternalWalletChan: boolean;
  originHostname: string | null;
  originInitials: string;
  simulationReverted: boolean;
  simulationUnavailable: boolean;
}

export function TransactionOutcome({
  txRequest,
  outcomeText,
  iconChipBg,
  isInternalWalletChan,
  originHostname,
  originInitials,
  simulationReverted,
  simulationUnavailable,
}: TransactionOutcomeProps) {
  const { favicon } = txRequest;
  return (
    <OutcomeCard
      outcome={outcomeText}
      context={`Requested on ${txRequest.chainName}`}
      media={
        <Box
          boxSize="40px"
          borderRadius="md"
          bg={isInternalWalletChan ? "transparent" : iconChipBg}
          borderWidth={isInternalWalletChan ? 0 : "1px"}
          borderStyle="solid"
          borderColor="border.subtle"
          display="flex"
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
        >
          {isInternalWalletChan ? (
            <Image src="/walletchan-icon.png" alt="WalletChan" boxSize="32px" />
          ) : favicon || originHostname ? (
            <SafeImage
              src={favicon || undefined}
              fallbackSrc={
                originHostname ? googleFaviconUrl(originHostname) : undefined
              }
              alt=""
              boxSize="24px"
              fallback={
                <Text fontSize="xs" fontWeight="700" color="text.secondary">
                  {originInitials}
                </Text>
              }
            />
          ) : (
            <Text fontSize="xs" fontWeight="700" color="text.secondary">
              {originInitials}
            </Text>
          )}
        </Box>
      }
      status={
        simulationReverted ? (
          <Badge variant="error">Likely to fail</Badge>
        ) : simulationUnavailable ? (
          <Badge variant="warning">Not simulated</Badge>
        ) : null
      }
    />
  );
}

interface FinancialImpactProps {
  txRequest: PendingTxRequest;
  parsedTxValue: ParsedTransactionValue;
  isValueMalformed: boolean;
  isValueZero: boolean;
  nativeSymbol: string;
  nativeValueCompact: string;
  onRevertedChange: (reverted: boolean) => void;
  onSimulationUnavailableChange: (unavailable: boolean) => void;
}

export function TransactionFinancialImpact({
  txRequest,
  parsedTxValue,
  isValueMalformed,
  isValueZero,
  nativeSymbol,
  nativeValueCompact,
  onRevertedChange,
  onSimulationUnavailableChange,
}: FinancialImpactProps) {
  const { tx } = txRequest;
  return (
    <VStack spacing={0} align="stretch">
      {parsedTxValue.ok && parsedTxValue.wei > 0n && (
        <AssetDeltaRow
          direction="send"
          asset={nativeSymbol}
          amount={nativeValueCompact}
          meta="Native token value included with this request"
        />
      )}
      {tx.to && !isValueMalformed && (
        <AssetChangesDisplay
          txRequest={txRequest}
          onRevertedChange={onRevertedChange}
          onSimulationUnavailableChange={onSimulationUnavailableChange}
        />
      )}
      {!tx.to && isValueZero && (
        <Text color="text.secondary" fontSize="sm">
          No token transfer is expected. Contract deployment costs are shown
          with the network fee below.
        </Text>
      )}
      {isValueMalformed && (
        <Text color="status.error.fg" fontSize="sm" fontWeight="600">
          Financial impact cannot be calculated because the transaction value
          is malformed.
        </Text>
      )}
    </VStack>
  );
}
