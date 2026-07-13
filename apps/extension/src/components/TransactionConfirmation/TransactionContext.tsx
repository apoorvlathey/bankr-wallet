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
import { QueueNavigation } from "./QueueNavigation";
import { RequestStatus } from "./RequestStatus";
import { TransactionInfoCard } from "./TransactionInfoCard";
import type {
  ConfirmationState,
  ForceInclusionInfo,
  TransactionAccountType,
} from "./types";
import type { SplitPriorTxState } from "./useSplitPriorTxState";

interface TransactionContextProps {
  txRequest: PendingTxRequest;
  currentIndex: number;
  totalCount: number;
  accountType?: TransactionAccountType;
  resolvedChainName: string;
  explorer?: string;
  nativeSymbol: string;
  iconChipBg: string;
  stripBg: string;
  stripFg: string;
  originHostname: string | null;
  originInitials: string;
  isInternalWalletChan: boolean;
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
  forceInclusion: boolean;
  forceInclusionInfo: ForceInclusionInfo | null;
  showAdvanced: boolean;
  requestState: ConfirmationState;
  requestError: string;
  confirmDisabledReason: string | null;
  gasValid: boolean;
  splitState: SplitPriorTxState;
  onNavigate: (direction: "prev" | "next") => void;
  onRejectAll: () => void;
  onClearSigningResolved: (matched: boolean) => void;
  onToggleAdvanced: () => void;
  onForceInclusionChange: (enabled: boolean) => void;
}

export function TransactionContext({
  txRequest,
  currentIndex,
  totalCount,
  accountType,
  resolvedChainName,
  explorer,
  nativeSymbol,
  iconChipBg,
  stripBg,
  stripFg,
  originHostname,
  originInitials,
  isInternalWalletChan,
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
  forceInclusion,
  forceInclusionInfo,
  showAdvanced,
  requestState,
  requestError,
  confirmDisabledReason,
  gasValid,
  splitState,
  onNavigate,
  onRejectAll,
  onClearSigningResolved,
  onToggleAdvanced,
  onForceInclusionChange,
}: TransactionContextProps) {
  const { tokens } = useTheme();
  const { tx, chainName } = txRequest;
  const delegation = txRequest.delegation7702Meta;
  const is7702Revoke = delegation?.kind === "revoke";
  const is7702SetDelegate = delegation?.kind === "setDelegate";
  const revokeMeta = txRequest.erc7715PermissionRevokeMeta;

  return (
    <VStack spacing={3} align="stretch">
      <QueueNavigation
        currentIndex={currentIndex}
        totalCount={totalCount}
        stripBg={stripBg}
        stripFg={stripFg}
        onNavigate={onNavigate}
        onRejectAll={onRejectAll}
      />

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
        resolvedChainName={resolvedChainName}
        explorer={explorer}
        nativeSymbol={nativeSymbol}
        parsedApproval={parsedApproval}
        isValueZero={isValueZero}
        isInternalWalletChan={isInternalWalletChan}
        iconChipBg={iconChipBg}
        originHostname={originHostname}
        originInitials={originInitials}
        toLabels={toLabels}
        resolvedToName={resolvedToName}
        forceInclusion={forceInclusion}
        forceInclusionInfo={forceInclusionInfo}
        showAdvanced={showAdvanced}
        onToggleAdvanced={onToggleAdvanced}
        onForceInclusionChange={onForceInclusionChange}
      />

      <RequestStatus
        accountType={accountType}
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
