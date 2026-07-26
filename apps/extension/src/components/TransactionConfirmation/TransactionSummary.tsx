import {
  Box,
  HStack,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import type { AssetChangesDisplayProps } from "@/components/AssetChanges/types";
import { EstimatedChangesHeading } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import { ArrowDownIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  SHIELDED_ETH_LOGO_URL,
  SHIELDED_ETH_NETWORK_NAME,
} from "@/components/Shield/model/shieldedAsset";
import ShieldComplianceInfoPopover from "@/components/Shield/ShieldComplianceInfoPopover";
import { formatShieldWei } from "@/components/Shield/model/shieldQuote";
import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";
import { privacyShieldNetAmountWei } from "@/lib/privacyShieldAmounts";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";

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
  const isReceiverPaidUnshield = !!txRequest.privacyUnshieldMeta;
  return (
    <RequestIdentity
      origin={txRequest.origin}
      originHostname={originHostname}
      favicon={txRequest.favicon}
      iconChipBg={iconChipBg}
      isInternalWalletChan={isInternalWalletChan}
      originInitials={originInitials}
      labelOverride={isReceiverPaidUnshield ? "Unshield: Receiver-paid" : undefined}
      identityIcon={
        isReceiverPaidUnshield
          ? <PrivacyShieldIcon boxSize="20px" color="accent.highlight" />
          : undefined
      }
    />
  );
}

export function PrivacyShieldTransactionOutcome({
  txRequest,
}: {
  txRequest: PendingTxRequest;
}) {
  let amountWei = 0n;
  try {
    amountWei = BigInt(txRequest.tx.value || "0");
  } catch {
    amountWei = 0n;
  }
  const feeBPS = PRIVACY_POOLS_DEPLOYMENT.assetConfig.vettingFeeBPS;
  const shieldedWei = privacyShieldNetAmountWei(amountWei, feeBPS);

  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
      px={4}
      py={4}
    >
      <HStack justify="space-between" spacing={3}>
        <VStack align="start" spacing={0} minW={0}>
          <Text fontSize="xs" color="fg.secondary">
            Total from {SHIELDED_ETH_NETWORK_NAME} wallet
          </Text>
          <Text fontFamily="mono" fontSize="xl" fontWeight="700">
            {formatShieldWei(amountWei)} ETH
          </Text>
        </VStack>
        <Image src="/chainIcons/ethereum.svg" alt="" boxSize="34px" />
      </HStack>
      <ArrowDownIcon my={2.5} color="fg.muted" />
      <HStack justify="space-between" spacing={3}>
        <VStack align="start" spacing={0} minW={0}>
          <Text fontSize="xs" color="fg.secondary">Amount to shield</Text>
          <Text fontFamily="mono" fontSize="xl" fontWeight="700">
            {formatShieldWei(shieldedWei)} ETH
          </Text>
        </VStack>
        <Image src={SHIELDED_ETH_LOGO_URL} alt="" boxSize="38px" />
      </HStack>
    </Box>
  );
}

export function PrivacyShieldRequestContext() {
  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="lg"
      px={3}
      py={3}
    >
      <HStack justify="space-between" spacing={3}>
        <Text fontSize="sm" color="fg.secondary">Network</Text>
        <Text fontSize="sm" fontWeight="600">{SHIELDED_ETH_NETWORK_NAME}</Text>
      </HStack>
      <HStack mt={2.5} justify="space-between" spacing={3}>
        <Text fontSize="sm" color="fg.secondary">Route</Text>
        <Text fontSize="sm" fontWeight="600">Privacy Pools</Text>
      </HStack>
      <HStack mt={2.5} justify="space-between" spacing={3}>
        <Text fontSize="sm" color="fg.secondary">Est. time</Text>
        <ShieldComplianceInfoPopover placement="top-end">
          <HStack
            as="button"
            type="button"
            spacing={1.5}
            minH="24px"
            px={1}
            bg="transparent"
            border={0}
            borderRadius="sm"
            cursor="help"
            color="fg.primary"
            aria-label="About the estimated one-hour compliance check"
            _hover={{ color: "accent.highlight" }}
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "border.focus",
              outlineOffset: "2px",
            }}
          >
            <Text as="span" fontSize="sm" fontWeight="600">1 hr</Text>
            <InfoOutlineIcon boxSize="13px" aria-hidden />
          </HStack>
        </ShieldComplianceInfoPopover>
      </HStack>
      <Text mt={3} pt={3} borderTopWidth="1px" borderColor="border.subtle" fontSize="xs" color="fg.secondary">
        This deposit account, amount, and timing will be public. A later relayed withdrawal does not directly link back to it.
      </Text>
    </Box>
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
  approvalCleanup?: AssetChangesDisplayProps["approvalCleanup"];
}

export function TransactionFinancialImpact({
  txRequest,
  isValueMalformed,
  isValueZero,
  onRevertedChange,
  onSimulationUnavailableChange,
  approvalCleanup,
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
          approvalCleanup={approvalCleanup}
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
