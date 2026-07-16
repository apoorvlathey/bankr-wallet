import {
  CheckCircleIcon,
  ExternalLinkIcon,
  TimeIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import {
  Box,
  HStack,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";

import type { ForceInclusionMeta } from "@/chrome/txHistoryStorage";
import ChainIcon from "@/components/ChainIcon";
import { getChainConfig } from "@/constants/chainConfig";
import { getForceInclusionState } from "./forceInclusionState";

type StepState = "waiting" | "pending" | "confirmed" | "failed";

function explorerTxUrl(explorer: string | undefined, txHash: string | undefined) {
  if (!explorer || !txHash) return null;
  const normalizedHash = txHash.match(/0x[a-fA-F0-9]{64}/u)?.[0];
  return normalizedHash
    ? `${explorer.replace(/\/$/u, "")}/tx/${normalizedHash}`
    : null;
}

function StepStatus({ state }: { state: StepState }) {
  const presentation =
    state === "confirmed"
      ? { label: "Confirmed", color: "status.success.emphasis", Icon: CheckCircleIcon }
      : state === "failed"
        ? { label: "Failed", color: "status.error.emphasis", Icon: WarningIcon }
        : state === "pending"
          ? { label: "Pending", color: "status.info.emphasis", Icon: TimeIcon }
          : { label: "Waiting", color: "fg.muted", Icon: TimeIcon };

  return (
    <HStack spacing={1.5} color={presentation.color} flexShrink={0}>
      {state === "pending" ? (
        <Spinner boxSize="11px" thickness="2px" speed="0.8s" />
      ) : (
        <presentation.Icon boxSize="12px" aria-hidden />
      )}
      <Text fontSize="2xs" fontWeight="700">
        {presentation.label}
      </Text>
    </HStack>
  );
}

function InclusionStep({
  label,
  chainId,
  chainName,
  state,
  explorerUrl,
}: {
  label: string;
  chainId: number;
  chainName: string;
  state: StepState;
  explorerUrl: string | null;
}) {
  return (
    <HStack minH="52px" px={3} py={2.5} justify="space-between" spacing={3}>
      <HStack spacing={2.5} minW={0}>
        <ChainIcon chainId={chainId} chainName={chainName} size="24px" withChip />
        <VStack spacing={0} align="stretch" minW={0}>
          <Text color="fg.primary" fontSize="sm" fontWeight="700" noOfLines={1}>
            {label}
          </Text>
          <Text color="fg.secondary" fontSize="2xs" fontWeight="600" noOfLines={1}>
            {chainName}
          </Text>
        </VStack>
      </HStack>
      <HStack spacing={0.5} flexShrink={0}>
        <StepStatus state={state} />
        {explorerUrl && (state === "confirmed" || state === "failed") && (
          <IconButton
            type="button"
            aria-label={`View ${label} on ${chainName} explorer`}
            icon={<ExternalLinkIcon boxSize="11px" aria-hidden />}
            size="xs"
            variant="ghost"
            h="28px"
            minW="28px"
            color="fg.secondary"
            onClick={() => chrome.tabs.create({ url: explorerUrl })}
            _hover={{ bg: "surface.raisedHover", color: "fg.primary" }}
          />
        )}
      </HStack>
    </HStack>
  );
}

export default function ForceInclusionSteps({
  meta,
  status,
  txHash,
}: {
  meta: ForceInclusionMeta;
  status: string;
  txHash: string | undefined;
}) {
  const l1Config = getChainConfig(meta.l1ChainId);
  const l2Config = getChainConfig(meta.l2ChainId);
  const { l1Confirmed, l1Reverted, l2Confirmed, l2Reverted } =
    getForceInclusionState(meta, status, txHash);
  const l1State: StepState = l1Reverted
    ? "failed"
    : l1Confirmed
      ? "confirmed"
      : meta.l1TxHash
        ? "pending"
        : "waiting";
  const l2State: StepState = l2Reverted
    ? "failed"
    : l2Confirmed
      ? "confirmed"
      : l1Confirmed
        ? "pending"
        : "waiting";
  const l1ExplorerUrl = explorerTxUrl(l1Config.explorer, meta.l1TxHash);
  const l2ExplorerUrl = explorerTxUrl(
    l2Config.explorer,
    txHash && txHash !== meta.l1TxHash ? txHash : undefined,
  );

  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <VStack
        spacing={0}
        align="stretch"
        divider={<Box borderTop="1px solid" borderColor="border.subtle" />}
      >
        <InclusionStep
          label="L1 deposit"
          chainId={meta.l1ChainId}
          chainName={l1Config.name || "Ethereum"}
          state={l1State}
          explorerUrl={l1ExplorerUrl}
        />
        <InclusionStep
          label="L2 inclusion"
          chainId={meta.l2ChainId}
          chainName={l2Config.name || "L2"}
          state={l2State}
          explorerUrl={l2ExplorerUrl}
        />
      </VStack>
    </Box>
  );
}
