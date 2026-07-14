import {
  Box,
  Text,
} from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import { EstimatedChangesHeading } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";

interface TransactionOutcomeProps {
  txRequest: PendingTxRequest;
  iconChipBg: string;
  isInternalWalletChan: boolean;
  originHostname: string | null;
  originInitials: string;
}

export function TransactionOutcome({
  txRequest,
  iconChipBg,
  isInternalWalletChan,
  originHostname,
  originInitials,
}: TransactionOutcomeProps) {
  return (
    <RequestIdentity
      origin={txRequest.origin}
      originHostname={originHostname}
      favicon={txRequest.favicon}
      iconChipBg={iconChipBg}
      isInternalWalletChan={isInternalWalletChan}
      originInitials={originInitials}
    />
  );
}

interface TransactionEstimatedChangesTitleProps {
  txRequest: PendingTxRequest;
  resolvedChainName: string;
}

export function TransactionEstimatedChangesTitle({
  txRequest,
  resolvedChainName,
}: TransactionEstimatedChangesTitleProps) {
  return (
    <EstimatedChangesHeading
      chainId={txRequest.tx.chainId}
      chainName={resolvedChainName}
    />
  );
}

interface FinancialImpactProps {
  txRequest: PendingTxRequest;
  isValueMalformed: boolean;
  isValueZero: boolean;
  onRevertedChange: (reverted: boolean) => void;
  onSimulationUnavailableChange: (unavailable: boolean) => void;
}

export function TransactionFinancialImpact({
  txRequest,
  isValueMalformed,
  isValueZero,
  onRevertedChange,
  onSimulationUnavailableChange,
}: FinancialImpactProps) {
  const { tx } = txRequest;
  return (
    <Box
      px={3}
      bg="surface.raised"
      borderWidth="1px"
      borderStyle="solid"
      borderColor="border.subtle"
      borderRadius="lg"
      overflow="hidden"
      boxShadow="none"
    >
      {tx.to && !isValueMalformed && (
        <AssetChangesDisplay
          txRequest={txRequest}
          embedded
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
    </Box>
  );
}
