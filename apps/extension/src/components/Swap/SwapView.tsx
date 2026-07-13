import { memo, useMemo, useState } from "react";
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
import { to0xToken } from "./swapViewUtils";
import { useBuyTokenData } from "./useBuyTokenData";
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
  const initialSwapChainId = SWAP_SUPPORTED_CHAIN_IDS.has(initialChainId)
    ? initialChainId
    : 1;
  const [sellChainId, setSellChainId] = useState(initialSwapChainId);
  const [buyChainId, setBuyChainId] = useState(initialSwapChainId);
  const [chainTokenModalSide, setChainTokenModalSide] = useState<
    "sell" | "buy" | null
  >(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const { networksInfo } = useNetworks();
  const isBridge = sellChainId !== buyChainId;
  const sellChainConfig = getChainConfig(sellChainId);
  const chainName =
    getResolvedChainById(sellChainId, networksInfo)?.name ||
    sellChainConfig.name ||
    initialChainName;
  const resolvedBuyChainName =
    getResolvedChainById(buyChainId, networksInfo)?.name ??
    getChainConfig(buyChainId).name;

  const { holdingsAllChains, sellToken, setSellToken } = useSellTokenData({
    fromAddress,
    chainId: sellChainId,
    isSwapSupported: SWAP_SUPPORTED_CHAIN_IDS.has(sellChainId),
    initialSellToken,
  });
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
    if (!buyToken.buyTokenInfo || !buyToken.buyTokenAddress) return;
    const address = buyToken.buyTokenAddress.trim();
    const isNative =
      address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
    const heldBuyToken = holdingsAllChains.find(
      (token) =>
        token.chainId === buyChainId &&
        (token.contractAddress.toLowerCase() === address.toLowerCase() ||
          (isNative && token.contractAddress === "native")),
    );
    const nextSellToken: PortfolioToken = heldBuyToken ?? {
      symbol: buyToken.buyTokenInfo.symbol,
      name: buyToken.buyTokenInfo.name,
      contractAddress: isNative ? "native" : address,
      chainId: buyChainId,
      decimals: buyToken.buyTokenInfo.decimals,
      balance: "0",
      balanceFormatted: "0",
      priceUsd: buyToken.buyTokenPriceUsd,
      valueUsd: 0,
      logoUrl: buyToken.buyTokenLogoURI,
    };
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
    if (chainTokenModalSide === "sell") {
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
    } else if (chainTokenModalSide === "buy") {
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
      accountType !== "impersonator",
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
        isConfirmDisabled={!prepared.swapGasValid}
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

  if (chainTokenModalSide) {
    const selectedIsBuy = chainTokenModalSide === "buy";
    return (
      <BridgeChainTokenModal
        isOpen
        onClose={() => setChainTokenModalSide(null)}
        mode={chainTokenModalSide}
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
      sellExplorer={sellChainConfig.explorer}
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
      buyExplorer={getChainConfig(buyChainId).explorer}
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
      copiedAddress={copiedAddress}
      isSubmitting={prepared.isSubmitting}
      canSwap={canSwap && !prepared.isSubmitting}
      onBack={onBack}
      onOpenSellPicker={() => setChainTokenModalSide("sell")}
      onOpenBuyPicker={() => setChainTokenModalSide("buy")}
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
      onCopy={async (address) => {
        await navigator.clipboard.writeText(address);
        setCopiedAddress(address);
        setTimeout(() => setCopiedAddress(null), 2000);
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
