import { Badge, HStack, Text } from "@chakra-ui/react";
import { CheckCircleIcon, WarningIcon } from "@chakra-ui/icons";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import ChainIcon from "@/components/ChainIcon";
import type { ResolvedChain } from "@/lib/chains";
import ForceInclusionSteps from "./ForceInclusionSteps";
import { getForceInclusionState } from "./forceInclusionState";

export default function StatusHeader({
  tx,
  resolvedChain,
  chainBadgeStyle,
}: {
  tx: CompletedTransaction;
  resolvedChain: ResolvedChain | undefined;
  chainBadgeStyle: { bg: string; fg: string; border: string };
}) {
  return (
    <>
      {/* Status + Chain row */}
      <HStack spacing={2} flexWrap="wrap">
        <Badge
          fontSize="xs"
          bg={chainBadgeStyle.bg}
          color={chainBadgeStyle.fg}
          borderWidth="1px"
          borderColor={chainBadgeStyle.border}
          px={2}
          py={0.5}
          display="flex"
          alignItems="center"
          gap={1}
        >
          <ChainIcon
            chainId={tx.chainId}
            chainName={resolvedChain?.name ?? tx.chainName}
            size="10px"
            withChip
          />
          {resolvedChain?.name ?? tx.chainName}
        </Badge>
        {tx.status === "pending" && !tx.forceInclusionMeta && (
          <Badge
            bg="status.info.bg"
            color="status.info.fg"
            border="2px solid"
            borderColor="border.default"
            px={2}
            py={0.5}
            fontSize="xs"
            display="flex"
            alignItems="center"
            gap={1}
          >
            <Text fontSize="xs" lineHeight="1">
              ⌛
            </Text>
            Pending...
          </Badge>
        )}
        {tx.status === "success" && (
          <Badge
            bg="accent.highlight"
            color="accentFg.highlight"
            border="2px solid"
            borderColor="border.default"
            px={2}
            py={0.5}
            fontSize="xs"
            display="flex"
            alignItems="center"
            gap={1}
          >
            <CheckCircleIcon boxSize={3} />
            {tx.forceInclusionMeta ? "L1 + L2 Confirmed" : "Confirmed"}
          </Badge>
        )}
        {tx.status === "failed" && (() => {
          // For force inclusion, distinguish L1 vs L2 failure so the user
          // immediately sees which side broke. The discriminator is
          // hasDistinctL2Hash — see getForceInclusionState above.
          let label = "Failed";
          if (tx.forceInclusionMeta) {
            const { l1Reverted, l2Reverted } = getForceInclusionState(
              tx.forceInclusionMeta,
              tx.status,
              tx.txHash,
            );
            if (l1Reverted) label = "L1 Failed";
            else if (l2Reverted) label = "L2 Failed";
          }
          return (
            <Badge
              bg="status.error.bg"
              color="status.error.fg"
              border="2px solid"
              borderColor="border.default"
              px={2}
              py={0.5}
              fontSize="xs"
              display="flex"
              alignItems="center"
              gap={1}
            >
              <WarningIcon boxSize={3} />
              {label}
            </Badge>
          );
        })()}
      </HStack>

      {/* Force Inclusion 2-step status */}
      {tx.forceInclusionMeta && (
        <ForceInclusionSteps
          meta={tx.forceInclusionMeta}
          status={tx.status}
          txHash={tx.txHash}
        />
      )}
    </>
  );
}
