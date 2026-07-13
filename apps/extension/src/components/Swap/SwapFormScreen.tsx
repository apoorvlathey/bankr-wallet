import { Box, Button, IconButton, VStack } from "@chakra-ui/react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { SwapQuoteResponse, TokenInfo } from "@/chrome/swapApi";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  StickyActionBar,
} from "@/components/ui";
import type { BungeeQuoteResponse } from "@walletchan/shared/bungee";
import { BuyTokenCard } from "./BuyTokenCard";
import { SellTokenCard } from "./SellTokenCard";
import { SwapQuoteSection } from "./SwapQuoteSection";
import { SwapArrowIcon } from "./SwapTokenControls";
import type {
  DestinationNativeInfo,
  SwapAccountType,
} from "./swapViewTypes";

interface SwapFormScreenProps {
  fromAddress: string;
  accountType: SwapAccountType;
  sellToken: PortfolioToken | null;
  sellChainId: number;
  sellExplorer: string;
  sellAmount: string;
  sellTokenAmount: string;
  isUsdMode: boolean;
  hasPrice: boolean;
  sellBalance: number;
  sliderValue: number;
  sellAmountNumber: number;
  insufficientBalance: boolean;
  buyTokenInfo: TokenInfo | null;
  buyTokenAddress: string;
  buyTokenLogoURI?: string;
  buyChainId: number;
  buyExplorer: string;
  buyTokenPriceUsd: number;
  unifiedBuyAmount?: string;
  outputUsd: number;
  priceImpact: number | null;
  quote: SwapQuoteResponse | null;
  bridgeQuote: BungeeQuoteResponse | null;
  quoteLoading: boolean;
  quoteError: string | null;
  isBridge: boolean;
  destNativeInfo: DestinationNativeInfo | null;
  slippageBps: number;
  sourceNativeSymbol: string;
  sourceNativePriceUsd?: number;
  copiedAddress: string | null;
  isSubmitting: boolean;
  canSwap: boolean;
  onBack: () => void;
  onOpenSellPicker: () => void;
  onOpenBuyPicker: () => void;
  onFlip: () => void;
  onToggleMode: () => void;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  onCopy: (address: string) => void;
  onSliderChange: (value: number) => void;
  onUseDestinationNative: () => void;
  onSlippageChange: (value: number) => void;
  onPrepare: () => void;
}

export function SwapFormScreen(props: SwapFormScreenProps) {
  return (
    <AppScreen>
      <AppHeader
        title="Swap or bridge"
        onBack={props.onBack}
        trailing={
          props.fromAddress ? (
            <FromAccountDisplay address={props.fromAddress} />
          ) : undefined
        }
      />
      <ScreenBody pb={4}>
        <VStack spacing={4} align="stretch">
          <SellTokenCard
            sellToken={props.sellToken}
            sellChainId={props.sellChainId}
            explorer={props.sellExplorer}
            sellAmount={props.sellAmount}
            sellTokenAmount={props.sellTokenAmount}
            isUsdMode={props.isUsdMode}
            hasPrice={props.hasPrice}
            sellBalance={props.sellBalance}
            sliderValue={props.sliderValue}
            insufficientBalance={props.insufficientBalance}
            sellAmountNumber={props.sellAmountNumber}
            copied={
              !!props.sellToken &&
              props.copiedAddress === props.sellToken.contractAddress
            }
            onOpenPicker={props.onOpenSellPicker}
            onToggleMode={props.onToggleMode}
            onAmountChange={props.onAmountChange}
            onMax={props.onMax}
            onCopy={() => {
              if (props.sellToken) props.onCopy(props.sellToken.contractAddress);
            }}
            onSliderChange={props.onSliderChange}
          />

          <Box display="flex" justifyContent="center" my={-1}>
            <IconButton
              aria-label="Swap direction"
              icon={<SwapArrowIcon boxSize={5} />}
              size="sm"
              bg="accent.primary"
              color="accentFg.primary"
              border="2px solid"
              borderColor="border.default"
              borderRadius="md"
              _hover={{ bg: "accent.primary", transform: "translateY(-1px)" }}
              _active={{ transform: "translate(1px, 1px)" }}
              onClick={props.onFlip}
              isDisabled={!props.buyTokenInfo}
            />
          </Box>

          <BuyTokenCard
            buyTokenInfo={props.buyTokenInfo}
            buyTokenAddress={props.buyTokenAddress}
            buyTokenLogoURI={props.buyTokenLogoURI}
            buyChainId={props.buyChainId}
            explorer={props.buyExplorer}
            unifiedBuyAmount={props.unifiedBuyAmount}
            quoteLoading={props.quoteLoading}
            hasQuote={!!(props.quote || props.bridgeQuote)}
            outputUsd={props.outputUsd}
            priceImpact={props.priceImpact}
            copied={props.copiedAddress === props.buyTokenAddress}
            onOpenPicker={props.onOpenBuyPicker}
            onCopy={() => props.onCopy(props.buyTokenAddress)}
          />

          <SwapQuoteSection
            quote={props.quote}
            bridgeQuote={props.bridgeQuote}
            quoteError={props.quoteError}
            quoteLoading={props.quoteLoading}
            isBridge={props.isBridge}
            sellToken={props.sellToken}
            buyTokenInfo={props.buyTokenInfo}
            buyTokenAddress={props.buyTokenAddress}
            buyTokenPriceUsd={props.buyTokenPriceUsd}
            buyChainId={props.buyChainId}
            destNativeInfo={props.destNativeInfo}
            slippageBps={props.slippageBps}
            sourceNativeSymbol={props.sourceNativeSymbol}
            sourceNativePriceUsd={props.sourceNativePriceUsd}
            priceImpact={props.priceImpact}
            accountType={props.accountType}
            onUseDestinationNative={props.onUseDestinationNative}
            onSlippageChange={props.onSlippageChange}
          />
        </VStack>
      </ScreenBody>
      <StickyActionBar
        primaryAction={
          <Button
            w="100%"
            variant="primary"
            onClick={props.onPrepare}
            isLoading={props.isSubmitting}
            loadingText="Preparing…"
            isDisabled={!props.canSwap}
          >
            {props.sellAmountNumber <= 0
              ? "Enter an amount"
              : props.isBridge
                ? "Review bridge"
                : "Review swap"}
          </Button>
        }
      />
    </AppScreen>
  );
}
