import { WarningIcon } from "@chakra-ui/icons";
import { Badge, HStack, Text, VStack } from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import {
  SimulationRevertedBanner,
  SimulationUnavailableBanner,
} from "@/components/AssetChangesDisplay";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import Erc7715PermissionRevokeSummary from "@/components/Erc7715PermissionRevokeSummary";
import ERC20ApproveDisplay from "@/components/ERC20ApproveDisplay";
import { MalformedCalldataBanner } from "@/components/MalformedCalldataBanner";
import { useTheme } from "@/theme";
import type { detectAbiEncodingError } from "@/lib/calldataValidation";
import type { parseApproveCalldata } from "@/lib/erc20Approve";
import { DelegationRevokeNotice, DelegationSetNotice } from "./DelegationNotices";
import { RequestStatus } from "./RequestStatus";
import { TransactionInfoCard } from "./TransactionInfoCard";
import type { ConfirmationState } from "./types";
import type { SplitPriorTxState } from "./useSplitPriorTxState";

interface TransactionContextProps {
  txRequest: PendingTxRequest;
  actionLabel: string | null;
  explorer?: string;
  nativeSymbol: string;
  nativePriceUsd: number | null;
  toLabels: string[];
  delegateLabels: string[];
  resolvedToName: string | null;
  parsedApproval: ReturnType<typeof parseApproveCalldata>;
  isValueZero: boolean;
  isValueMalformed: boolean;
  calldataValidation: ReturnType<typeof detectAbiEncodingError>;
  clearSigningEligible: boolean;
  simulationReverted: boolean;
  simulationUnavailable: boolean;
  requestState: ConfirmationState;
  requestError: string;
  confirmDisabledReason: string | null;
  gasValid: boolean;
  splitState: SplitPriorTxState;
  onClearSigningResolved: (matched: boolean) => void;
}

export function TransactionContext({
  txRequest,
  actionLabel,
  explorer,
  nativeSymbol,
  nativePriceUsd,
  toLabels,
  delegateLabels,
  resolvedToName,
  parsedApproval,
  isValueZero,
  isValueMalformed,
  calldataValidation,
  clearSigningEligible,
  simulationReverted,
  simulationUnavailable,
  requestState,
  requestError,
  confirmDisabledReason,
  gasValid,
  splitState,
  onClearSigningResolved,
}: TransactionContextProps) {
  const { tokens } = useTheme();
  const { tx, chainName } = txRequest;
  const delegation = txRequest.delegation7702Meta;
  const is7702Revoke = delegation?.kind === "revoke";
  const is7702SetDelegate = delegation?.kind === "setDelegate";
  const revokeMeta = txRequest.erc7715PermissionRevokeMeta;

  return (
    <VStack spacing={3} align="stretch">
      {txRequest.parentBundleId !== undefined &&
        txRequest.bundleIndex !== undefined &&
        txRequest.bundleTotalCalls !== undefined && (
          <HStack
            w="full"
            py={2}
            px={3}
            bg="accent.secondary"
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            justify="space-between"
          >
            <Text
              fontSize="xs"
              color="accentFg.secondary"
              fontWeight="700"
              textTransform="uppercase"
            >
              Split batch
            </Text>
            <Badge
              fontSize="xs"
              bg="accentFg.secondary"
              color="accent.secondary"
              fontWeight="900"
              px={2}
              py={0.5}
            >
              Step {txRequest.bundleIndex + 1} of {txRequest.bundleTotalCalls}
            </Badge>
          </HStack>
        )}

      {calldataValidation.malformed && (
        <MalformedCalldataBanner
          borders={tokens.borders}
          reason={calldataValidation.reason!}
          functionName={calldataValidation.functionName}
        />
      )}

      {isValueMalformed && (
        <HStack
          align="flex-start"
          spacing={3}
          p={3}
          bg="status.error.bg"
          color="status.error.fg"
          border={tokens.borders.medium}
          borderColor="status.error.border"
          borderRadius="lg"
          boxShadow="card"
        >
          <WarningIcon boxSize={4} flexShrink={0} mt={0.5} />
          <VStack spacing={1} align="stretch">
            <Text
              fontSize="sm"
              fontWeight="900"
              textTransform="uppercase"
              lineHeight="short"
            >
              Malformed transaction value
            </Text>
            <Text fontSize="xs" fontWeight="600" lineHeight="short">
              This request includes an invalid native-token value. Reject it
              and ask the site to send a valid transaction.
            </Text>
          </VStack>
        </HStack>
      )}

      {tx.to && parsedApproval && !calldataValidation.malformed && (
        <ERC20ApproveDisplay
          tokenAddress={tx.to}
          approval={parsedApproval}
          chainId={tx.chainId}
          txId={txRequest.id}
        />
      )}

      {simulationReverted && <SimulationRevertedBanner borders={tokens.borders} />}
      {simulationUnavailable && !simulationReverted && (
        <SimulationUnavailableBanner borders={tokens.borders} />
      )}

      {is7702Revoke && <DelegationRevokeNotice chainName={chainName} />}
      {is7702SetDelegate && delegation && (
        <DelegationSetNotice
          delegation={delegation}
          chainName={chainName}
          delegateLabels={delegateLabels}
          explorer={explorer}
        />
      )}

      {revokeMeta && (
        <Erc7715PermissionRevokeSummary
          meta={revokeMeta}
          chainId={tx.chainId}
          chainName={chainName}
          explorer={explorer}
          nativeSymbol={nativeSymbol}
        />
      )}

      {clearSigningEligible && (
        <ClearSigningView
          kind="calldata"
          chainId={tx.chainId}
          from={tx.from}
          to={tx.to!}
          calldata={tx.data!}
          value={tx.value}
          onResolved={onClearSigningResolved}
        />
      )}

      <TransactionInfoCard
        txRequest={txRequest}
        actionLabel={actionLabel}
        explorer={explorer}
        nativeSymbol={nativeSymbol}
        nativePriceUsd={nativePriceUsd}
        parsedApproval={parsedApproval}
        isValueZero={isValueZero}
        toLabels={toLabels}
        resolvedToName={resolvedToName}
      />

      <RequestStatus
        confirmDisabledReason={confirmDisabledReason}
        error={requestError}
        gasValid={gasValid}
        splitState={splitState}
        state={requestState}
        isLaterSplitTransaction={!!(
          txRequest.parentBundleId &&
          txRequest.bundleIndex !== undefined &&
          txRequest.bundleIndex > 0
        )}
      />
    </VStack>
  );
}
