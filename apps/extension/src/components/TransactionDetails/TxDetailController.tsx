import { useState, useEffect, useCallback, useMemo } from "react";
import { VStack } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import {
  getResolvedChainById,
  getStoredNativeCurrencySymbol,
} from "@/lib/chains";
import { isDarkThemeId, useTheme, useChainBadgeStyle } from "@/theme";
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
import BridgeSummary from "./BridgeSummary";
import ClearSigningSummary from "./ClearSigningSummary";
import GasDetails from "./GasDetails";
import RawTransactionDetails from "./RawTransactionDetails";
import StatusHeader from "./StatusHeader";
import TransactionError from "./TransactionError";
import TransactionImpact from "./TransactionImpact";
import { useAssetChangeData } from "./useAssetChangeData";
import { useGasData } from "./useGasData";

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
  const resolveLogo = useCallback(
    (url: string | null | undefined): string | undefined =>
      (url && cachedLogoMap.get(url)) || url || undefined,
    [cachedLogoMap],
  );
  // Chain badge colors — all per-theme branching lives in `useChainBadgeStyle`.
  const chainBadgeStyle = useChainBadgeStyle(
    resolvedChain?.bg ?? config.bg,
    resolvedChain?.text ?? config.text,
    resolvedChain?.isCustom ?? false,
  );
  // Atomic batches (Bankr ERC-7821, EIP-7702 PK/SP) land on-chain as a self-
  // call whose data is `execute(mode, encodedCalls)`. Decode it back into the
  // per-call list so we can render the same clear-signing UI the confirmation
  // surface uses — instead of FROM=EOA / TO=EOA + an opaque blob. Returns null
  // for non-batch txs so this is a no-op for the rest of history.
  const batchCalls = useMemo(() => {
    if (!looksLikeErc7821SelfBatch(tx.tx)) return null;
    return decodeErc7821Batch(tx.tx.data);
  }, [tx.tx]);
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
  const [rawDetailsExpanded, setRawDetailsExpanded] = useState(!hasHero);
  const [gasExpanded, setGasExpanded] = useState(false);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [isRebroadcasting, setIsRebroadcasting] = useState(false);
  const {
    sourceAssetChanges,
    destinationAssetChanges,
    formatTokenAmountUsd,
    formatWeiUsd,
  } = useAssetChangeData({ isOpen, tx });
  const toast = useThemedToast();
  const { themeId } = useTheme();
  // On midnight, the error.fg coral reads as another "error" cue on top of the
  // already-red container — use a neutral light surface so the CTA feels like
  // an action, not a warning. Bauhaus error.fg is already WHITE, so it's fine.
  const rebroadcastBg = isDarkThemeId(themeId) ? "fg.primary" : "status.error.fg";
  const rebroadcastFg = isDarkThemeId(themeId) ? "fg.inverse" : "status.error.bg";

  const canRebroadcast =
    tx.status === "failed" &&
    !!tx.error &&
    tx.error.toLowerCase().includes("dropped from the mempool") &&
    !!tx.tx.to;

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
                data: tx.tx.data,
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

  const resetGasExpansion = useCallback(() => setGasExpanded(false), []);
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
  } = useGasData({ isOpen, tx, onResetExpansion: resetGasExpansion });

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

  return (
    <TxDetailView
      presentation={presentation}
      isOpen={isOpen}
      onClose={onClose}
      title="Transaction details"
    >
      <VStack spacing={3} align="stretch">
        <StatusHeader
          tx={tx}
          resolvedChain={resolvedChain}
          chainBadgeStyle={chainBadgeStyle}
        />

        <BridgeSummary
          tx={tx}
          resolvedChain={resolvedChain}
          networksInfo={networksInfo}
          resolveLogo={resolveLogo}
          sourceAssetChanges={sourceAssetChanges}
          destinationAssetChanges={destinationAssetChanges}
          nativeSym={nativeSym}
          explorerBase={explorerBase}
          formatUsd={formatTokenAmountUsd}
        />
        <TransactionImpact
          tx={tx}
          networksInfo={networksInfo}
          sourceAssetChanges={sourceAssetChanges}
          destinationAssetChanges={destinationAssetChanges}
          nativeSym={nativeSym}
          explorerBase={explorerBase}
          displayTimestamp={displayTimestamp}
          formatUsd={formatTokenAmountUsd}
          onViewExplorer={handleViewOnExplorer}
        />

        <ClearSigningSummary
          tx={tx}
          chainName={resolvedChain?.name ?? tx.chainName}
          explorerBase={explorerBase}
          nativeSym={nativeSym}
          batchCalls={batchCalls}
          delegateLabels={delegateLabels}
          clearSignedMeta={clearSignedMeta}
        />

        <RawTransactionDetails
          tx={tx}
          resolveLogo={resolveLogo}
          nativeSym={nativeSym}
          expanded={rawDetailsExpanded}
          onToggle={() => setRawDetailsExpanded(!rawDetailsExpanded)}
          formatWeiUsd={formatWeiUsd}
        />

        <GasDetails
          gasData={gasData}
          txFee={txFee}
          gasUsagePercent={gasUsagePercent}
          nativeSym={nativeSym}
          isL2={isL2}
          setGas={setGas}
          setMaxFee={setMaxFee}
          setPriority={setPriority}
          setGasPrice={setGasPrice}
          hasSetGasParams={hasSetGasParams}
          estimatedMaxCost={estimatedMaxCost}
          expanded={gasExpanded}
          onToggle={() => setGasExpanded(!gasExpanded)}
          formatWeiUsd={formatWeiUsd}
        />

        <TransactionError
          tx={tx}
          canRebroadcast={canRebroadcast}
          isRebroadcasting={isRebroadcasting}
          rebroadcastBg={rebroadcastBg}
          rebroadcastFg={rebroadcastFg}
          expanded={errorExpanded}
          onToggle={() => setErrorExpanded(!errorExpanded)}
          onRebroadcast={handleRebroadcast}
        />
      </VStack>
    </TxDetailView>
  );
}
