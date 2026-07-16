import { Badge, HStack, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import type { ERC5792Call } from "@/chrome/erc5792Types";
import { BatchCallsList } from "@/components/BatchCallsList";
import ClearSignedSummaryCard from "@/components/ClearSignedSummaryCard";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import Erc7715PermissionRevokeSummary from "@/components/Erc7715PermissionRevokeSummary";
import DelegationReceipt from "./DelegationReceipt";

export default function ClearSigningSummary({
  tx,
  chainName,
  explorerBase,
  nativeSym,
  batchCalls,
  delegateLabels,
  clearSignedMeta,
}: {
  tx: CompletedTransaction;
  chainName: string;
  explorerBase: string;
  nativeSym: string;
  batchCalls: ERC5792Call[] | null;
  delegateLabels: string[];
  clearSignedMeta: CompletedTransaction["clearSignedMeta"] | undefined;
}) {
  const erc7715RevokeMeta = tx.erc7715PermissionRevokeMeta;
  const delegationMeta = tx.delegation7702Meta;
  const hasBatchCalls = !!batchCalls && batchCalls.length > 0;
  const hasDelegation = !!delegationMeta;
  const hasErc7730Details = Boolean(
    clearSignedMeta?.kind === "erc7730" && tx.tx.to && tx.tx.data,
  );
  const [erc7730DetailsMatched, setErc7730DetailsMatched] = useState(false);

  useEffect(() => {
    setErc7730DetailsMatched(false);
  }, [tx.id]);

  return (
    <>
      {/* ERC-7715 revoke clear-signing hero. The queued transaction is a
          DelegationManager disable call; without the display snapshot
          the activity modal only shows raw tuple calldata. */}
      {erc7715RevokeMeta && (
        <Erc7715PermissionRevokeSummary
          meta={erc7715RevokeMeta}
          chainId={tx.chainId}
          chainName={chainName}
          explorer={explorerBase}
          nativeSymbol={nativeSym}
          presentation="receipt"
        />
      )}

      {/* Per-call hero for atomic batches. Decoded from the ERC-7821
          self-call calldata on open (no storage cost). Reuses the same
          CallCard + clear-signing pipeline the tx-confirmation surface
          uses, so transfers / approves / Permit2 / etc. read as human
          actions instead of a blob. The raw FROM=EOA / TO=EOA / opaque
          calldata stays available inside the collapsed "Transaction
          Details" section below for power-users. */}
      {hasBatchCalls && (
        <VStack spacing={2} align="stretch">
          <HStack spacing={2}>
            <Text
              fontSize="xs"
              color="text.secondary"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wide"
            >
              Calls
            </Text>
            <Badge
              bg="accent.highlight"
              color="accentFg.highlight"
              fontSize="2xs"
              fontWeight="800"
              px={1.5}
              py={0}
              border="1px solid"
              borderColor="accent.highlight"
            >
              {batchCalls!.length}
            </Badge>
          </HStack>
          <BatchCallsList
            calls={batchCalls!}
            chainId={tx.chainId}
            origin={tx.origin}
            favicon={tx.favicon}
            originPerCall={tx.batchCallOrigins}
            originCallIndex={
              tx.bridge ? batchCalls!.length - 1 : undefined
            }
          />
        </VStack>
      )}

      {hasDelegation && delegationMeta && (
        <DelegationReceipt
          target={delegationMeta.targetDelegate}
          kind={delegationMeta.kind}
          explorer={explorerBase}
          resolvedLabel={delegateLabels[0]}
        />
      )}

      {/* The submission snapshot always paints immediately. ERC-7730 records
          can then enrich the same summary with descriptor fields when the
          cached descriptor resolves, without replacing the reviewed intent. */}
      {clearSignedMeta && (
        <ClearSignedSummaryCard
          meta={clearSignedMeta}
          chainId={tx.chainId}
          showDetails={erc7730DetailsMatched}
          details={
            hasErc7730Details && tx.tx.to && tx.tx.data ? (
              <ClearSigningView
                kind="calldata"
                chainId={tx.chainId}
                from={tx.tx.from}
                to={tx.tx.to}
                calldata={tx.tx.data}
                value={tx.tx.value}
                embedded
                hideHeader
                hideLoadingSkeleton
                onResolved={setErc7730DetailsMatched}
              />
            ) : undefined
          }
        />
      )}
    </>
  );
}
