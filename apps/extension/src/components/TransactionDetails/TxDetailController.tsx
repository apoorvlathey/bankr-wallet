import { useState, useEffect, useCallback, useMemo } from "react";
import { VStack } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import {
  getResolvedChainById,
  getStoredNativeCurrencySymbol,
} from "@/lib/chains";
import { useThemedToast } from "@/hooks/useThemedToast";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import {
  decodeErc7821Batch,
  looksLikeErc7821SelfBatch,
} from "@/lib/erc7821Decode";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import TxDetailView, {
  type TxDetailPresentation,
} from "@/components/TxDetailView";
import { ScreenSection } from "@/components/ui";
import AdvancedDetails from "./AdvancedDetails";
import BridgeSummary from "./BridgeSummary";
import ClearSigningSummary from "./ClearSigningSummary";
import DecodedFunctionSummary from "./DecodedFunctionSummary";
import StatusHeader from "./StatusHeader";
import SwapSummary from "./SwapSummary";
import TransactionMeta from "./TransactionMeta";
import TransactionError from "./TransactionError";
import TransactionImpact from "./TransactionImpact";
import { useAssetChangeData } from "./useAssetChangeData";
import { useGasData } from "./useGasData";
import ArbitrumForceInclusionAction from "./ArbitrumForceInclusionAction";
import { useResolvedCalldata } from "./useResolvedCalldata";

interface TxDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tx: CompletedTransaction;
}

export interface TxDetailControllerProps extends TxDetailModalProps {
  presentation?: TxDetailPresentation;
}

export function TxDetailController({
  isOpen,
  onClose,
  tx,
  presentation = "modal",
}: TxDetailControllerProps) {
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(tx.chainId, networksInfo);
  const config = getChainConfig(tx.chainId);
  const cachedLogoMap = useCachedAvatarMap(
    useMemo(
      () => [
        tx.swapMeta?.sellTokenLogo,
        tx.swapMeta?.buyTokenLogo,
        tx.transferMeta?.tokenLogo,
      ],
      [
        tx.swapMeta?.sellTokenLogo,
        tx.swapMeta?.buyTokenLogo,
        tx.transferMeta?.tokenLogo,
      ],
    ),
  );
  const calldata = useResolvedCalldata(isOpen, tx);
  const detailTx = useMemo(
    () => ({ ...tx, tx: { ...tx.tx, data: calldata.data } }),
    [calldata.data, tx],
  );
  const resolveLogo = useCallback(
    (url: string | null | undefined): string | undefined =>
      (url && cachedLogoMap.get(url)) || url || undefined,
    [cachedLogoMap],
  );
  // Atomic batches (Bankr ERC-7821, EIP-7702 PK/SP) land on-chain as a self-
  // call whose data is `execute(mode, encodedCalls)`. Decode it back into the
  // per-call list so we can render the same clear-signing UI the confirmation
  // surface uses — instead of FROM=EOA / TO=EOA + an opaque blob. Returns null
  // for non-batch txs so this is a no-op for the rest of history.
  const batchCalls = useMemo(() => {
    if (!looksLikeErc7821SelfBatch(detailTx.tx)) return null;
    return decodeErc7821Batch(detailTx.tx.data);
  }, [detailTx.tx]);
  const hasBatchCalls = !!batchCalls && batchCalls.length > 0;
  const delegationMeta = tx.delegation7702Meta;
  const hasDelegation = !!delegationMeta;
  const erc7715RevokeMeta = tx.erc7715PermissionRevokeMeta;
  const hasErc7715Revoke = !!erc7715RevokeMeta;
  // Match the live confirmation screen: ERC-7715 revoke txs get the dedicated
  // permission summary, not a second generic ERC-7730/clear-signing card for
  // the same DelegationManager calldata.
  const clearSignedMeta = hasErc7715Revoke ? undefined : tx.clearSignedMeta;
  // eth.sh label for the delegation target — shared cache, so this is free
  // on reopen and free if any other surface (tx-confirmation screen, etc.)
  // already fetched it.
  const [delegateLabels, setDelegateLabels] = useState<string[]>([]);
  useEffect(() => {
    if (!isOpen || !delegationMeta || delegationMeta.kind === "revoke") {
      setDelegateLabels([]);
      return;
    }
    let cancelled = false;
    getEthShLabels(delegationMeta.targetDelegate, tx.chainId).then((labels) => {
      if (cancelled) return;
      setDelegateLabels(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, delegationMeta, tx.chainId]);
  // When the modal already has a hero summary that answers "what did this
  // tx do?", the raw From/To/Value/Calldata rows are power-user details so
  // we default them collapsed. Hero sources, in priority order:
  //   - clear-signed snapshot (Approved/Transferred/Native-send/ERC-7730)
  //   - ERC-7715 permission revoke snapshot (DelegationManager disable tx)
  //   - batch calls (decoded ERC-7821 self-call from atomic-7702 / Bankr)
  //   - delegation7702 (Set / Revoke smart-account tx — target lives in the
  //     authorization list, not in calldata, so the raw FROM/TO/data view
  //     would otherwise look like a no-op self-call)
  //   - swap meta (sell→buy tokens; rendered by SwapSummaryCard above)
  //   - bridge meta (destination chain block also above)
  // Bridge / swap txs are virtually always wallet-initiated, so this is
  // also the place to honor "collapse for wallet-initiated swap txs".
  const hasHero =
    !!clearSignedMeta ||
    hasErc7715Revoke ||
    hasBatchCalls ||
    hasDelegation ||
    !!tx.swapMeta ||
    !!tx.bridge;
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [decodedFunctionName, setDecodedFunctionName] = useState<string | undefined>(
    tx.functionName,
  );
  useEffect(() => {
    setDecodedFunctionName(tx.functionName);
  }, [tx.functionName, tx.id]);
  const handleDecodedFunctionName = useCallback((name: string) => {
    setDecodedFunctionName((current) => (current === name ? current : name));
  }, []);
  const [isRebroadcasting, setIsRebroadcasting] = useState(false);
  const {
    sourceAssetChanges,
    destinationAssetChanges,
    formatTokenAmountUsd,
    formatWeiUsd,
  } = useAssetChangeData({ isOpen, tx });
  const toast = useThemedToast();

  const canRebroadcast =
    tx.status === "failed" &&
    !!tx.error &&
    tx.error.toLowerCase().includes("dropped from the mempool") &&
    !!tx.tx.to && (!tx.calldataSelector || !!calldata.data);

  const handleRebroadcast = async () => {
    if (!tx.tx.to) return;
    setIsRebroadcasting(true);
    try {
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "initiateTransfer",
              tx: {
                from: tx.tx.from,
                to: tx.tx.to,
                data: calldata.data,
                value: tx.tx.value,
                chainId: tx.tx.chainId,
              },
              chainName: tx.chainName,
            },
            resolve,
          );
        },
      );
      if (result.success) {
        onClose();
      } else {
        toast({
          title: "Rebroadcast failed",
          description: result.error || "Could not create a new transaction request",
          status: "error",
        });
      }
    } catch (e) {
      toast({
        title: "Rebroadcast failed",
        description: e instanceof Error ? e.message : "Unknown error",
        status: "error",
      });
    } finally {
      setIsRebroadcasting(false);
    }
  };

  // Native currency symbol — fast for hardcoded chains, async for custom
  const [nativeSym, setNativeSym] = useState(
    resolvedChain?.nativeCurrency.symbol ?? "ETH",
  );
  useEffect(() => {
    if (resolvedChain?.nativeCurrency.symbol) {
      setNativeSym(resolvedChain.nativeCurrency.symbol);
      return;
    }
    getStoredNativeCurrencySymbol(tx.chainId).then(setNativeSym).catch(() => {});
  }, [resolvedChain, tx.chainId]);

  const {
    gasData,
    isL2,
    txFee,
    gasUsagePercent,
    setGas,
    setMaxFee,
    setPriority,
    setGasPrice,
    hasSetGasParams,
    estimatedMaxCost,
  } = useGasData({ isOpen, tx });

  // Resolve explorer: hardcoded chain config first, then custom chain in networksInfo
  const explorerBase = resolvedChain?.explorer || config.explorer || "";

  const handleViewOnExplorer = () => {
    if (tx.txHash && explorerBase) {
      const hash = tx.txHash.match(/0x[a-fA-F0-9]{64}/)?.[0];
      if (hash) {
        chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
      }
    }
  };

  const displayTimestamp = tx.completedAt ?? tx.createdAt;
  const hasBalanceChanges = Boolean(
    (sourceAssetChanges && !(tx.bridge && tx.swapMeta)) ||
      (destinationAssetChanges && tx.bridge && !tx.swapMeta),
  );
  const hasStructuredSummary = Boolean(
    clearSignedMeta || hasErc7715Revoke || hasBatchCalls || hasDelegation,
  );
  const hasSwapSummary = Boolean(tx.swapMeta && !tx.bridge && !hasBatchCalls);
  const hasGenericSummary = !hasStructuredSummary && !hasSwapSummary;
  const genericAction = !detailTx.tx.to
    ? "Deploy contract"
    : (detailTx.tx.data && detailTx.tx.data !== "0x") || tx.calldataSelector
      ? "Contract interaction"
      : "Transaction";
  const chainName = resolvedChain?.name ?? tx.chainName;

  return (
    <TxDetailView
      presentation={presentation}
      isOpen={isOpen}
      onClose={onClose}
      title="Transaction details"
    >
      <VStack spacing={5} align="stretch">
        <StatusHeader
          tx={tx}
          resolvedChain={resolvedChain}
          explorerBase={explorerBase}
          onViewExplorer={handleViewOnExplorer}
        />

        <ArbitrumForceInclusionAction isOpen={isOpen} tx={tx} />

        <TransactionError
          tx={tx}
          canRebroadcast={canRebroadcast}
          isRebroadcasting={isRebroadcasting}
          expanded={errorExpanded}
          onToggle={() => setErrorExpanded(!errorExpanded)}
          onRebroadcast={handleRebroadcast}
        />

        {tx.bridge && (
          <ScreenSection title="Bridge route">
            <BridgeSummary
              tx={tx}
              resolvedChain={resolvedChain}
              networksInfo={networksInfo}
              sourceAssetChanges={sourceAssetChanges}
              destinationAssetChanges={destinationAssetChanges}
              nativeSym={nativeSym}
              explorerBase={explorerBase}
              formatUsd={formatTokenAmountUsd}
            />
          </ScreenSection>
        )}

        {hasBalanceChanges && (
          <ScreenSection title="Balance changes">
            <TransactionImpact
              tx={tx}
              networksInfo={networksInfo}
              sourceAssetChanges={sourceAssetChanges}
              destinationAssetChanges={destinationAssetChanges}
              nativeSym={nativeSym}
              formatUsd={formatTokenAmountUsd}
            />
          </ScreenSection>
        )}

        {(hasStructuredSummary || hasSwapSummary || hasGenericSummary) && (
          <ScreenSection title="Transaction summary">
            {hasSwapSummary && tx.swapMeta ? (
              <SwapSummary meta={tx.swapMeta} />
            ) : hasStructuredSummary ? (
              <ClearSigningSummary
                tx={tx}
                chainName={chainName}
                explorerBase={explorerBase}
                nativeSym={nativeSym}
                batchCalls={batchCalls}
                delegateLabels={delegateLabels}
                clearSignedMeta={clearSignedMeta}
              />
            ) : (
              <DecodedFunctionSummary
                functionName={decodedFunctionName || genericAction}
                contractAddress={tx.tx.to ?? undefined}
                chainId={tx.chainId}
                value={tx.tx.value}
                nativeSymbol={nativeSym}
                valueUsd={formatWeiUsd(tx.tx.value)}
              />
            )}
          </ScreenSection>
        )}

        <TransactionMeta
          tx={tx}
          nativeSym={nativeSym}
          txFee={txFee}
          estimatedMaxCost={estimatedMaxCost}
          displayTimestamp={displayTimestamp}
          formatWeiUsd={formatWeiUsd}
        />

        <AdvancedDetails
          tx={detailTx}
          resolveLogo={resolveLogo}
          nativeSym={nativeSym}
          gasData={gasData}
          txFee={txFee}
          gasUsagePercent={gasUsagePercent}
          isL2={isL2}
          setGas={setGas}
          setMaxFee={setMaxFee}
          setPriority={setPriority}
          setGasPrice={setGasPrice}
          hasSetGasParams={hasSetGasParams}
          estimatedMaxCost={estimatedMaxCost}
          defaultOpen={!hasHero && !decodedFunctionName}
          formatWeiUsd={formatWeiUsd}
          onFunctionName={handleDecodedFunctionName}
          calldataLoading={calldata.loading}
          calldataError={calldata.error}
          onRetryCalldata={calldata.retry}
        />
      </VStack>
    </TxDetailView>
  );
}
