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
  isSubmitting: boolean;
  canSwap: boolean;
  onBack: () => void;
  onOpenSellChainPicker: () => void;
  onOpenSellTokenPicker: () => void;
  onOpenBuyChainPicker: () => void;
  onOpenBuyTokenPicker: () => void;
  onFlip: () => void;
  onToggleMode: () => void;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  onSliderChange: (value: number) => void;
  onUseDestinationNative: () => void;
  onSlippageChange: (value: number) => void;
  onPrepare: () => void;
}

export function SwapFormScreen(props: SwapFormScreenProps) {
  return (
    <AppScreen>
      <AppHeader
        title="Swap or Bridge"
        onBack={props.onBack}
        trailing={
          props.fromAddress ? (
            <FromAccountDisplay address={props.fromAddress} />
          ) : undefined
        }
      />
      <ScreenBody pt={3} pb={4}>
        <VStack spacing={3} align="stretch">
          <Box position="relative">
            <SellTokenCard
              sellToken={props.sellToken}
              sellChainId={props.sellChainId}
              sellAmount={props.sellAmount}
              sellTokenAmount={props.sellTokenAmount}
              isUsdMode={props.isUsdMode}
              hasPrice={props.hasPrice}
              sellBalance={props.sellBalance}
              sliderValue={props.sliderValue}
              insufficientBalance={props.insufficientBalance}
              sellAmountNumber={props.sellAmountNumber}
              onOpenChainPicker={props.onOpenSellChainPicker}
              onOpenTokenPicker={props.onOpenSellTokenPicker}
              onToggleMode={props.onToggleMode}
              onAmountChange={props.onAmountChange}
              onMax={props.onMax}
              onSliderChange={props.onSliderChange}
            />

            <Box
              display="flex"
              justifyContent="center"
              my={-3}
              position="relative"
              zIndex={1}
            >
              <IconButton
                aria-label="Swap direction"
                icon={<SwapArrowIcon boxSize={5} />}
                size="sm"
                minW="46px"
                w="46px"
                bg="accent.highlight"
                color="accentFg.highlight"
                border="3px solid"
                borderColor="surface.base"
                borderRadius="lg"
                _hover={{ bg: "accent.highlight" }}
                sx={{
                  "& svg": {
                    transition:
                      "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)",
                  },
                  "&:not(:disabled):hover svg": {
                    transform: "rotate(180deg)",
                  },
                  "@media (prefers-reduced-motion: reduce)": {
                    "& svg": { transition: "none" },
                    "&:not(:disabled):hover svg": { transform: "none" },
                  },
                }}
                _active={{ transform: "translate(1px, 1px)" }}
                _disabled={{
                  opacity: 1,
                  bg: "surface.raised",
                  color: "fg.muted",
                  cursor: "not-allowed",
                  _hover: {
                    bg: "surface.raised",
                    transform: "none",
                  },
                }}
                onClick={props.onFlip}
                isDisabled={props.isSubmitting}
              />
            </Box>

            <BuyTokenCard
              buyTokenInfo={props.buyTokenInfo}
              buyTokenAddress={props.buyTokenAddress}
              buyTokenLogoURI={props.buyTokenLogoURI}
              buyChainId={props.buyChainId}
              unifiedBuyAmount={props.unifiedBuyAmount}
              quoteLoading={props.quoteLoading}
              hasQuote={!!(props.quote || props.bridgeQuote)}
              outputUsd={props.outputUsd}
              priceImpact={props.priceImpact}
              onOpenChainPicker={props.onOpenBuyChainPicker}
              onOpenTokenPicker={props.onOpenBuyTokenPicker}
            />
          </Box>

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
            variant="brand"
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
