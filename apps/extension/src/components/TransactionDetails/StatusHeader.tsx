import {
  CheckCircleIcon,
  ExternalLinkIcon,
  TimeIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import { Button, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import ChainIcon from "@/components/ChainIcon";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import ShieldComplianceInfoPopover from "@/components/Shield/ShieldComplianceInfoPopover";
import { SHIELDED_ETH_NETWORK_NAME } from "@/components/Shield/model/shieldedAsset";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";
import type { ResolvedChain } from "@/lib/chains";
import {
  getPrivacyShieldActivityState,
  isPrivacyShieldLifecycleState,
  isPrivacyShieldCompliancePending,
} from "@/lib/privacyShieldLifecycle";
import { getPrivacyTransactionIdentity } from "@/lib/privacyTransactionIdentity";
import { useIconChipBg } from "@/theme";
import ForceInclusionSteps from "./ForceInclusionSteps";
import { getForceInclusionState } from "./forceInclusionState";

function getOriginHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function getOpenableOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function getStatusPresentation(tx: CompletedTransaction) {
  if (
    tx.privacyShieldMeta &&
    isPrivacyShieldLifecycleState(tx.privacyShieldMeta.state)
  ) {
    const privacy = getPrivacyShieldActivityState(
      tx.privacyShieldMeta.state,
      tx.chainName || SHIELDED_ETH_NETWORK_NAME,
    );
    const compliancePending = isPrivacyShieldCompliancePending(
      tx.privacyShieldMeta.state,
    );
    return {
      label: compliancePending ? "Compliance check" : privacy.statusLabel,
      color: `status.${privacy.tone}.emphasis`,
      icon: privacy.tone === "success"
        ? CheckCircleIcon
        : privacy.tone === "info"
          ? TimeIcon
          : WarningIcon,
      pending: privacy.pending,
    } as const;
  }
  if (tx.status === "success") {
    return {
      label: tx.forceInclusionMeta ? "L1 + L2 confirmed" : "Confirmed",
      color: "status.success.emphasis",
      icon: CheckCircleIcon,
      pending: false,
    } as const;
  }

  if (tx.status === "failed") {
    let label = "Failed";
    if (tx.forceInclusionMeta) {
      const { l1Reverted, l2Reverted } = getForceInclusionState(
        tx.forceInclusionMeta,
        tx.status,
        tx.txHash,
      );
      if (l1Reverted) label = "L1 failed";
      else if (l2Reverted) label = "L2 failed";
    }
    return {
      label,
      color: "status.error.emphasis",
      icon: WarningIcon,
      pending: false,
    } as const;
  }

  if (tx.status === "dropped") {
    return {
      label: "Dropped",
      color: "status.warning.emphasis",
      icon: WarningIcon,
    } as const;
  }

  return {
    label: tx.broadcastUncertain
      ? "Verifying broadcast"
      : tx.status === "processing"
        ? "Processing"
        : "Pending",
    color: "status.info.emphasis",
    icon: TimeIcon,
    pending: true,
  } as const;
}

export default function StatusHeader({
  tx,
  resolvedChain,
  explorerBase,
  onViewExplorer,
}: {
  tx: CompletedTransaction;
  resolvedChain: ResolvedChain | undefined;
  explorerBase: string;
  onViewExplorer: () => void;
}) {
  const iconChipBg = useIconChipBg();
  const originHostname = getOriginHostname(tx.origin);
  const openableOrigin = getOpenableOrigin(tx.origin);
  const privacyIdentity = getPrivacyTransactionIdentity(tx);
  const isInternalWalletChan =
    !privacyIdentity && !originHostname && tx.origin.startsWith("WalletChan");
  const status = getStatusPresentation(tx);
  const StatusIcon = status.icon;
  const isPending = status.pending;
  const compliancePending = tx.privacyShieldMeta
    ? isPrivacyShieldCompliancePending(tx.privacyShieldMeta.state)
    : false;
  const chainName = resolvedChain?.name ?? tx.chainName;
  const initials = (originHostname ?? tx.origin)
    .split(/[.\s-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
  const statusIndicatorContent = (
    <>
      {isPending ? (
        <Spinner boxSize="12px" thickness="2px" speed="0.8s" color="currentColor" />
      ) : (
        <StatusIcon boxSize="13px" aria-hidden />
      )}
      <Text fontSize="xs" fontWeight="700">
        {status.label}
      </Text>
    </>
  );
  const statusIndicator = compliancePending ? (
    <HStack
      as="button"
      type="button"
      spacing={1.5}
      color={status.color}
      bg="transparent"
      border={0}
      p={0}
      cursor="help"
      aria-label="About the Privacy Pools compliance check"
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "border.focus",
        outlineOffset: "3px",
      }}
    >
      {statusIndicatorContent}
    </HStack>
  ) : (
    <HStack as="span" spacing={1.5} color={status.color}>
      {statusIndicatorContent}
    </HStack>
  );

  return (
    <VStack align="stretch" spacing={3}>
      <RequestIdentity
        origin={tx.origin}
        originHostname={originHostname}
        favicon={tx.favicon}
        iconChipBg={iconChipBg}
        isInternalWalletChan={isInternalWalletChan}
        originInitials={initials}
        labelOverride={privacyIdentity?.label}
        identityIcon={
          privacyIdentity ? (
            <PrivacyShieldIcon boxSize="24px" color="accent.highlight" />
          ) : undefined
        }
        onOpenOrigin={
          openableOrigin
            ? () => chrome.tabs.create({ url: openableOrigin })
            : undefined
        }
      />

      <HStack
        justify="center"
        spacing={2}
        minH="24px"
        aria-live={isPending ? "polite" : undefined}
      >
        {compliancePending ? (
          <ShieldComplianceInfoPopover placement="bottom-start">
            {statusIndicator}
          </ShieldComplianceInfoPopover>
        ) : statusIndicator}
        <Text aria-hidden color="fg.muted" fontSize="xs">
          ·
        </Text>
        <HStack spacing={1.5} minW={0}>
          <ChainIcon
            chainId={tx.chainId}
            chainName={chainName}
            size="14px"
            withChip
          />
          <Text color="fg.secondary" fontSize="xs" fontWeight="600" noOfLines={1}>
            {chainName}
          </Text>
          {tx.txHash && explorerBase && !tx.forceInclusionMeta && (
            <Button
              aria-label={`View transaction on ${chainName} explorer`}
              size="xs"
              variant="ghost"
              minH="28px"
              px={2}
              ml={0.5}
              color="fg.secondary"
              rightIcon={<ExternalLinkIcon boxSize="10px" aria-hidden />}
              onClick={onViewExplorer}
              _hover={{ bg: "surface.raisedHover", color: "fg.primary" }}
            >
              Explorer
            </Button>
          )}
        </HStack>
      </HStack>

      {tx.forceInclusionMeta && (
        <ForceInclusionSteps
          meta={tx.forceInclusionMeta}
          status={tx.status}
          txHash={tx.txHash}
        />
      )}
    </VStack>
  );
}
