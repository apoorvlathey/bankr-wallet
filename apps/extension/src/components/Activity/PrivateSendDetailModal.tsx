import {
  CheckCircleIcon,
  ExternalLinkIcon,
  TimeIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import { Button, HStack, Image, Text, VStack } from "@chakra-ui/react";
import type { UnshieldOperation } from "@/components/Shield/model/unshield";
import { unshieldBadgeVariant, unshieldStatusCopy } from "@/components/Shield/model/shieldActivity";
import { formatShieldWei } from "@/components/Shield/model/shieldQuote";
import { SHIELDED_ETH_LOGO_URL } from "@/components/Shield/model/shieldedAsset";
import TxDetailView from "@/components/TxDetailView";
import {
  ListItem,
  ListItemContent,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
  ScreenSection,
} from "@/components/ui";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { truncateAddress } from "@/lib/addressUtils";
import { formatAbsoluteTimestamp } from "@/lib/timeFormatUtils";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <ListItem density="compact">
      <ListItemContent><ListItemTitle color="fg.secondary">{label}</ListItemTitle></ListItemContent>
      <ListItemMeta color="fg.primary" fontWeight="600">{value}</ListItemMeta>
    </ListItem>
  );
}

export default function PrivateSendDetailModal({
  operation,
  onClose,
}: {
  operation: UnshieldOperation;
  onClose: () => void;
}) {
  const tone = unshieldBadgeVariant(operation.state);
  const complete = tone === "success";
  const failed = tone === "error";
  const StatusIcon = complete ? CheckCircleIcon : failed ? WarningIcon : TimeIcon;
  const explorerUrl = operation.txHash
    ? `https://sepolia.etherscan.io/tx/${operation.txHash}`
    : null;

  return (
    <TxDetailView presentation="modal" isOpen onClose={onClose} title="Private send details">
      <VStack align="stretch" spacing={5}>
        <VStack spacing={3}>
          <Image src={SHIELDED_ETH_LOGO_URL} alt="" boxSize="44px" />
          <Text fontSize="lg" fontWeight="700">Sent privately</Text>
          <HStack spacing={1.5} color={`status.${tone}.emphasis`}>
            <StatusIcon boxSize="13px" />
            <Text fontSize="xs" fontWeight="700">{unshieldStatusCopy(operation.state)}</Text>
            <Text color="fg.muted">·</Text>
            <Text color="fg.secondary" fontSize="xs">Sepolia</Text>
            {explorerUrl && (
              <Button
                size="xs"
                minH="28px"
                variant="ghost"
                rightIcon={<ExternalLinkIcon boxSize="10px" />}
                onClick={() => chrome.tabs.create({ url: explorerUrl })}
              >
                Explorer
              </Button>
            )}
          </HStack>
        </VStack>

        <ScreenSection title="Balance change">
          <ListSurface>
            <DetailRow label="Private balance" value={`−${formatShieldWei(operation.amountWei)} ETH`} />
            <DetailRow label="Recipient receives" value={`${formatShieldWei(operation.netRecipientAmountWei)} ETH`} />
            <DetailRow label="Relayer fee" value={`${formatShieldWei(operation.relayFeeWei)} ETH`} />
          </ListSurface>
        </ScreenSection>

        <ScreenSection title="Route">
          <ListSurface>
            <ListItem density="compact">
              <ListItemContent><ListItemTitle color="fg.secondary">To</ListItemTitle></ListItemContent>
              <ListItemMeta>
                <LabeledAddressPopover
                  address={operation.recipient}
                  contextLabel="private-send recipient"
                  explorer="https://sepolia.etherscan.io"
                  label={truncateAddress(operation.recipient)}
                />
              </ListItemMeta>
            </ListItem>
            <DetailRow label="Via" value={operation.relayerName} />
            <DetailRow label="Protocol" value="Privacy Pools" />
          </ListSurface>
        </ScreenSection>

        <Text textAlign="center" fontSize="xs" color="fg.muted">
          {formatAbsoluteTimestamp(operation.createdAt)}
        </Text>
      </VStack>
    </TxDetailView>
  );
}
