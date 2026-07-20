import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { NATIVE_TOKEN_ADDRESS } from "@/chrome/swapApi";
import { SWAP_SUPPORTED_CHAIN_IDS } from "@/constants/chainRegistry";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getNativeAssetMeta, getResolvedChainById } from "@/lib/chains";
import BridgeChainTokenModal from "./BridgeChainTokenModal";
import SwapConfirmation from "./SwapConfirmation";
import { SwapFormScreen } from "./SwapFormScreen";
import { getExecutableBridgeRoute } from "./bridgeRouteUtils";
import type { SwapViewProps } from "./swapViewTypes";
import { buildFlippedSellToken, pickDefaultSwapSellToken, to0xToken } from "./swapViewUtils";
import { useBuyTokenData } from "./useBuyTokenData";
import { useImpersonatedSwapPolicy } from "./useImpersonatedSwapPolicy";
import { usePreparedSwap } from "./usePreparedSwap";
import { useSellTokenData } from "./useSellTokenData";
import { useSwapAmount } from "./useSwapAmount";
import { useSwapQuotes } from "./useSwapQuotes";
import { useSwapSlippage } from "./useSwapSlippage";
function SwapView({
  fromAddress,
  accountId,
  accountType,
  chainId: initialChainId,
  chainName: initialChainName,
  onBack,
  onSwapInitiated,
  // The swap surface deliberately keeps its chain pair independent from the
  // global/per-tab dapp chain. Keep this prop for the stable public shape.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChainChange: _onChainChange,
  initialBuyToken,
  initialSellToken,
}: SwapViewProps) {
  const initialSwapChainId =
    initialSellToken && SWAP_SUPPORTED_CHAIN_IDS.has(initialSellToken.chainId)
      ? initialSellToken.chainId
      : SWAP_SUPPORTED_CHAIN_IDS.has(initialChainId)
        ? initialChainId
        : 1;
  const [sellChainId, setSellChainId] = useState(initialSwapChainId);
  const [buyChainId, setBuyChainId] = useState(initialSwapChainId);
  const [picker, setPicker] = useState<{
    side: "sell" | "buy";
    panel: "chains" | "tokens";
  } | null>(null);
  const { networksInfo } = useNetworks();
  const isBridge = sellChainId !== buyChainId;
  const sellChainConfig = getChainConfig(sellChainId);
  const chainName =
    getResolvedChainById(sellChainId, networksInfo)?.name ||
    sellChainConfig.name ||
    initialChainName;
  const canSendImpersonatedTransaction = useImpersonatedSwapPolicy(accountType, sellChainId);
  const resolvedBuyChainName =
    getResolvedChainById(buyChainId, networksInfo)?.name ??
    getChainConfig(buyChainId).name;
  const { holdingsAllChains, sellToken, setSellToken } = useSellTokenData({
    fromAddress,
    chainId: sellChainId,
    isSwapSupported: SWAP_SUPPORTED_CHAIN_IDS.has(sellChainId),
    initialSellToken,
  });
  const autoSelectedSellRef = useRef(Boolean(initialSellToken));
  useEffect(() => {
    if (
      autoSelectedSellRef.current ||
      initialSellToken ||
      sellToken ||
      holdingsAllChains.length === 0
    ) {
      return;
    }
    const cachedTopToken = pickDefaultSwapSellToken(holdingsAllChains);
    if (!cachedTopToken) return;
    autoSelectedSellRef.current = true;
    setSellChainId(cachedTopToken.chainId);
    setBuyChainId(cachedTopToken.chainId);
    setSellToken(cachedTopToken);
  }, [holdingsAllChains, initialSellToken, sellToken, setSellToken]);
  const amount = useSwapAmount(sellToken);
  const buyToken = useBuyTokenData({
    buyChainId,
    holdingsAllChains,
    initialBuyToken,
  });
  const { slippageBps, setSlippageBps } = useSwapSlippage();
  const quotes = useSwapQuotes({
    sellToken,
    buyTokenAddress: buyToken.buyTokenAddress,
    sellTokenAmount: amount.sellTokenAmount,
    fromAddress,
    slippageBps,
    sellChainId,
    buyChainId,
    isBridge,
  });
  const bridgeRoute = getExecutableBridgeRoute(quotes.bridgeQuote);
  const handleFlip = () => {
    const nextSellToken = buildFlippedSellToken({
      buyTokenAddress: buyToken.buyTokenAddress,
      buyTokenInfo: buyToken.buyTokenInfo,
      buyTokenPriceUsd: buyToken.buyTokenPriceUsd,
      buyTokenLogoURI: buyToken.buyTokenLogoURI,
      buyChainId,
      holdings: holdingsAllChains,
    });
    const previousSellToken = sellToken;
    const previousSellChainId = sellChainId;
    setSellChainId(buyChainId);
    setBuyChainId(previousSellChainId);
    setSellToken(nextSellToken);
    if (previousSellToken) {
      buyToken.setKnownBuyToken(
        to0xToken(previousSellToken),
        {
          name: previousSellToken.name,
          symbol: previousSellToken.symbol,
          decimals: previousSellToken.decimals,
        },
        previousSellToken.logoUrl,
      );
    } else {
      buyToken.clearBuyToken();
    }
    amount.resetAmount();
    quotes.clearQuotes();
  };
  const handleTokenSelect = (pickedChainId: number, picked: PortfolioToken) => {
    if (picker?.side === "sell") {
      const previousSellChainId = sellChainId;
      setSellChainId(pickedChainId);
      const buyWasImplicit =
        buyChainId === previousSellChainId && !buyToken.buyTokenAddress;
      if (buyWasImplicit && pickedChainId !== previousSellChainId) {
        setBuyChainId(pickedChainId);
      }
      setSellToken(picked);
      amount.resetAmount();
      amount.setIsUsdMode(false);
      quotes.setQuote(null);
    } else if (picker?.side === "buy") {
      if (pickedChainId !== buyChainId) setBuyChainId(pickedChainId);
      buyToken.setSelectedBuyToken(picked);
      quotes.setQuote(null);
    }
  };
  const sellAmountNumber = parseFloat(amount.sellTokenAmount) || 0;
  const insufficientBalance = sellAmountNumber > amount.sellBalance;
  const unifiedBuyAmount = isBridge
    ? bridgeRoute?.output?.amount
    : quotes.quote?.buyAmount;
  const inputUsd =
    sellToken && sellAmountNumber > 0 && sellToken.priceUsd > 0
      ? sellAmountNumber * sellToken.priceUsd
      : 0;
  const outputUsd = useMemo(() => {
    if (!buyToken.buyTokenInfo || buyToken.buyTokenPriceUsd <= 0) return 0;
    const outputAmount = isBridge
      ? bridgeRoute?.output?.amount
      : quotes.quote?.buyAmount;
    if (!outputAmount) return 0;
    return (
      parseFloat(
        formatUnits(BigInt(outputAmount), buyToken.buyTokenInfo.decimals),
      ) * buyToken.buyTokenPriceUsd
    );
  }, [
    isBridge,
    bridgeRoute,
    quotes.quote,
    buyToken.buyTokenInfo,
    buyToken.buyTokenPriceUsd,
  ]);
  const priceImpact =
    !quotes.quoteLoading && inputUsd > 0 && outputUsd > 0
      ? ((inputUsd - outputUsd) / inputUsd) * 100
      : null;
  const canSwap = Boolean(
    sellToken &&
      /^0x[a-fA-F0-9]{40}$/.test(buyToken.buyTokenAddress.trim()) &&
      buyToken.buyTokenInfo &&
      sellAmountNumber > 0 &&
      !insufficientBalance &&
      (isBridge ? bridgeRoute : quotes.quote) &&
      !quotes.quoteLoading &&
      accountType !== "ledger",
  );
  const prepared = usePreparedSwap({
    sellToken,
    buyTokenInfo: buyToken.buyTokenInfo,
    buyTokenAddress: buyToken.buyTokenAddress,
    buyTokenLogoURI: buyToken.buyTokenLogoURI,
    sellTokenAmount: amount.sellTokenAmount,
    quote: quotes.quote,
    isBridge,
    fromAddress,
    accountId,
    accountType,
    sellChainId,
    buyChainId,
    chainName,
    resolvedBuyChainName,
    slippageBps,
    onSwapInitiated,
  });
  if (
    prepared.showConfirmation &&
    prepared.preparedTransactions &&
    sellToken &&
    buyToken.buyTokenInfo &&
    prepared.preparedQuote
  ) {
    return (
      <SwapConfirmation
        transactions={prepared.preparedTransactions}
        sellToken={sellToken}
        sellAmount={amount.sellTokenAmount}
        sellUsd={inputUsd}
        buyTokenInfo={buyToken.buyTokenInfo}
        buyAmount={prepared.preparedQuote.buyAmount}
        buyTokenDecimals={buyToken.buyTokenInfo.decimals}
        buyTokenLogoURI={
          buyToken.buyTokenLogoURI ||
          (buyToken.buyTokenAddress.toLowerCase() ===
          NATIVE_TOKEN_ADDRESS.toLowerCase()
            ? getNativeAssetMeta(buyChainId, networksInfo)?.logoUrl
            : undefined)
        }
        isBuyNative={
          buyToken.buyTokenAddress.toLowerCase() ===
          NATIVE_TOKEN_ADDRESS.toLowerCase()
        }
        buyUsd={outputUsd}
        chainId={sellChainId}
        chainName={chainName}
        fromAddress={fromAddress}
        accountType={accountType}
        isBatched={!!prepared.preparedBatchTx}
        batchedTx={prepared.preparedBatchTx ?? undefined}
        eip7702Delegate={
          prepared.prepared7702?.needsAuth
            ? prepared.prepared7702.delegate
            : undefined
        }
        eip7702OnchainDelegate={
          prepared.prepared7702?.needsAuth
            ? prepared.prepared7702.onchainDelegate
            : undefined
        }
        onConfirm={prepared.confirm}
        onCancel={prepared.cancel}
        isSubmitting={prepared.isSubmitting}
        onGasEstimates={prepared.setSwapGasEstimates}
        onValidityChange={prepared.setSwapGasValid}
        isConfirmDisabled={!prepared.swapGasValid || (accountType === "impersonator" && !canSendImpersonatedTransaction)}
        bridgeMeta={
          isBridge
            ? {
                destinationChainId: buyChainId,
                destinationChainName: resolvedBuyChainName,
                routeName: bridgeRoute?.routeDetails?.name,
                estimatedTime: bridgeRoute?.estimatedTime,
                sourceNativePriceUsd: holdingsAllChains.find(
                  (token) =>
                    token.chainId === sellChainId &&
                    token.contractAddress === "native",
                )?.priceUsd,
              }
            : undefined
        }
      />
    );
  }
  if (picker) {
    const selectedIsBuy = picker.side === "buy";
    return (
      <BridgeChainTokenModal
        isOpen
        onClose={() => setPicker(null)}
        mode={picker.side}
        initialPanel={picker.panel}
        accountType={accountType}
        initialChainId={selectedIsBuy ? buyChainId : sellChainId}
        selectedTokenAddress={
          selectedIsBuy
            ? buyToken.buyTokenAddress || undefined
            : sellToken
              ? to0xToken(sellToken)
              : undefined
        }
        selectedTokenChainId={selectedIsBuy ? buyChainId : sellChainId}
        excludeAddress={
          selectedIsBuy
            ? sellToken
              ? to0xToken(sellToken)
              : undefined
            : buyToken.buyTokenAddress || undefined
        }
        excludeChainId={selectedIsBuy ? sellChainId : buyChainId}
        onSelect={handleTokenSelect}
        fromAddress={fromAddress}
        holdingsAllChains={holdingsAllChains}
      />
    );
  }
  const sourceNative = holdingsAllChains.find(
    (token) =>
      token.chainId === sellChainId && token.contractAddress === "native",
  );
  return (
    <SwapFormScreen
      fromAddress={fromAddress}
      accountType={accountType}
      sellToken={sellToken}
      sellChainId={sellChainId}
      sellAmount={amount.sellAmount}
      sellTokenAmount={amount.sellTokenAmount}
      isUsdMode={amount.isUsdMode}
      hasPrice={amount.hasPrice}
      sellBalance={amount.sellBalance}
      sliderValue={amount.sliderValue}
      sellAmountNumber={sellAmountNumber}
      insufficientBalance={insufficientBalance}
      buyTokenInfo={buyToken.buyTokenInfo}
      buyTokenAddress={buyToken.buyTokenAddress}
      buyTokenLogoURI={buyToken.buyTokenLogoURI}
      buyChainId={buyChainId}
      buyTokenPriceUsd={buyToken.buyTokenPriceUsd}
      unifiedBuyAmount={unifiedBuyAmount}
      outputUsd={outputUsd}
      priceImpact={priceImpact}
      quote={quotes.quote}
      bridgeQuote={quotes.bridgeQuote}
      quoteLoading={quotes.quoteLoading}
      quoteError={quotes.quoteError}
      isBridge={isBridge}
      destNativeInfo={quotes.destNativeInfo}
      slippageBps={slippageBps}
      sourceNativeSymbol={
        getNativeAssetMeta(sellChainId, networksInfo)?.symbol ?? "ETH"
      }
      sourceNativePriceUsd={sourceNative?.priceUsd}
      isSubmitting={prepared.isSubmitting}
      canSwap={canSwap && !prepared.isSubmitting}
      onBack={onBack}
      onOpenSellChainPicker={() =>
        setPicker({ side: "sell", panel: "chains" })
      }
      onOpenSellTokenPicker={() =>
        setPicker({ side: "sell", panel: "tokens" })
      }
      onOpenBuyChainPicker={() =>
        setPicker({ side: "buy", panel: "chains" })
      }
      onOpenBuyTokenPicker={() =>
        setPicker({ side: "buy", panel: "tokens" })
      }
      onFlip={handleFlip}
      onToggleMode={amount.toggleMode}
      onAmountChange={(value) => {
        amount.setIsMaxMode(false);
        amount.setSellAmount(value);
        amount.syncSliderFromAmount(value);
      }}
      onMax={() => {
        amount.setSliderValue(100);
        amount.setAmountFromSlider(100);
      }}
      onSliderChange={(value) => {
        amount.setSliderValue(value);
        amount.setAmountFromSlider(value);
      }}
      onUseDestinationNative={() => {
        if (!quotes.destNativeInfo) return;
        buyToken.setKnownBuyToken(
          NATIVE_TOKEN_ADDRESS,
          {
            name: quotes.destNativeInfo.name,
            symbol: quotes.destNativeInfo.symbol,
            decimals: quotes.destNativeInfo.decimals,
          },
          quotes.destNativeInfo.logoUrl,
        );
        buyToken.setBuyTokenPriceUsd(0);
        quotes.clearQuotes();
        quotes.setQuoteError(null);
      }}
      onSlippageChange={setSlippageBps}
      onPrepare={prepared.stagePlan}
    />
  );
}
export default memo(SwapView);
