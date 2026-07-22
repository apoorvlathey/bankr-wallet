import {
  CheckCircleIcon,
  ExternalLinkIcon,
  TimeIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import { Button, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import { PrivacyShieldIcon } from "@/components/shared/PrivacyShieldIcon";
import TxDetailView from "@/components/TxDetailView";
import {
  ListItem,
  ListItemContent,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
  ScreenSection,
} from "@/components/ui";
import { formatAbsoluteTimestamp } from "@/lib/timeFormatUtils";
import { useIconChipBg } from "@/theme";
import { useShieldOperations } from "./hooks/useShieldOperations";
import { unshieldBadgeVariant, unshieldStatusCopy } from "./model/shieldActivity";
import { formatShieldUsdValue, formatShieldWei } from "./model/shieldQuote";
import {
  SHIELDED_ETH_EXPLORER_URL,
  SHIELDED_ETH_NETWORK_NAME,
} from "./model/shieldedAsset";
import type { UnshieldOperation } from "./model/unshield";
import UnshieldTransferSummary from "./UnshieldTransferSummary";

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <ListItem density="compact">
      <ListItemContent>
        <ListItemTitle color="fg.secondary">{label}</ListItemTitle>
      </ListItemContent>
      <ListItemMeta color="fg.primary" fontWeight="600">
        {value}
      </ListItemMeta>
    </ListItem>
  );
}

function AmountValue({
  amount,
  usd,
}: {
  amount: string;
  usd: string | null;
}) {
  return (
    <VStack align="end" spacing={0}>
      <Text
        color="fg.primary"
        fontSize="sm"
        fontWeight="700"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {amount}
      </Text>
      {usd ? (
        <Text
          color="fg.secondary"
          fontSize="2xs"
          fontWeight="600"
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {usd}
        </Text>
      ) : null}
    </VStack>
  );
}

export default function UnshieldDetailScreen({
  operation,
  onBack,
}: {
  operation: UnshieldOperation;
  onBack: () => void;
}) {
  const iconChipBg = useIconChipBg();
  const { series, withdrawals } = useShieldOperations();
  const current = withdrawals.find((candidate) => candidate.id === operation.id) ?? operation;
  const tone = unshieldBadgeVariant(current.state, current.method, current.errorCode);
  const complete = tone === "success";
  const failed = tone === "error";
  const StatusIcon = complete ? CheckCircleIcon : failed ? WarningIcon : TimeIcon;
  const explorerUrl = current.txHash
    ? `${SHIELDED_ETH_EXPLORER_URL}/tx/${current.txHash}`
    : null;
  const isDirect = current.method === "direct";
  const relayFeeUsd = formatShieldUsdValue(current.relayFeeWei, series.priceUsd);
  const networkFeeUsd = current.gasFeeEstimateWei
    ? formatShieldUsdValue(current.gasFeeEstimateWei, series.priceUsd)
    : null;

  return (
    <TxDetailView
      presentation="screen"
      isOpen
      onClose={onBack}
      title="Transaction details"
    >
      <VStack spacing={5} align="stretch">
        <VStack align="stretch" spacing={3}>
          <RequestIdentity
            origin="WalletChan Unshield"
            originHostname={null}
            iconChipBg={iconChipBg}
            labelOverride="Unshield ETH"
            identityIcon={<PrivacyShieldIcon boxSize="24px" color="accent.highlight" />}
          />

          <HStack
            justify="center"
            spacing={2}
            minH="28px"
            aria-live={complete || failed ? undefined : "polite"}
          >
            <HStack as="span" spacing={1.5} color={`status.${tone}.emphasis`}>
              {complete || failed ? (
                <StatusIcon boxSize="13px" aria-hidden />
              ) : (
                <Spinner boxSize="12px" thickness="2px" speed="0.8s" color="currentColor" />
              )}
              <Text fontSize="xs" fontWeight="700">
                {unshieldStatusCopy(current.state, current.method, current.errorCode)}
              </Text>
            </HStack>
            <Text aria-hidden color="fg.muted" fontSize="xs">
              ·
            </Text>
            <Text color="fg.secondary" fontSize="xs" fontWeight="600">
              {SHIELDED_ETH_NETWORK_NAME}
            </Text>
            {explorerUrl ? (
              <Button
                aria-label={`View transaction on ${SHIELDED_ETH_NETWORK_NAME} explorer`}
                size="xs"
                variant="ghost"
                minH="28px"
                px={2}
                color="fg.secondary"
                rightIcon={<ExternalLinkIcon boxSize="10px" aria-hidden />}
                onClick={() => chrome.tabs.create({ url: explorerUrl })}
              >
                Explorer
              </Button>
            ) : null}
          </HStack>
        </VStack>

        <ScreenSection title="Balance changes">
          <UnshieldTransferSummary
            operation={current}
            nativePriceUsd={series.priceUsd}
          />
        </ScreenSection>

        <ScreenSection title="Transaction summary">
          <ListSurface>
            <DetailRow
              label="Withdrawal method"
              value={isDirect ? "Receiver pays gas" : "Private relay"}
            />
            {isDirect ? (
              <DetailRow
                label="Network fee"
                value={current.gasFeeEstimateWei ? (
                  <AmountValue
                    amount={`Up to ${formatShieldWei(current.gasFeeEstimateWei)} ETH`}
                    usd={networkFeeUsd}
                  />
                ) : "Paid by receiver"}
              />
            ) : (
              <DetailRow
                label="Relay fee"
                value={(
                  <AmountValue
                    amount={`${formatShieldWei(current.relayFeeWei)} ETH`}
                    usd={relayFeeUsd}
                  />
                )}
              />
            )}
            <DetailRow label="Protocol" value="Privacy Pools" />
            {!isDirect ? <DetailRow label="Relayer" value={current.relayerName} /> : null}
          </ListSurface>
        </ScreenSection>

        <Text textAlign="center" fontSize="xs" color="fg.muted">
          {formatAbsoluteTimestamp(current.createdAt)}
        </Text>
      </VStack>
    </TxDetailView>
  );
}
