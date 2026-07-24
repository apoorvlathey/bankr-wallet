"use client";

import { useMemo } from "react";
import {
  HStack,
  Text,
  Input,
  Button,
  Box,
  Flex,
  Image,
} from "@chakra-ui/react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatEther, parseEther } from "viem";
import { base } from "wagmi/chains";
import { SLIPPAGE_PRESETS, type SwapDirection } from "../../../lib/wchan-swap";
import { useSwapQuote } from "../../swap-wchan/hooks/useSwapQuote";
import { SwapButton } from "../../swap-wchan/components/SwapButton";
import { SlippageSettings } from "../../swap/components/SlippageSettings";
import { LoadingShapes } from "../../components/ui/LoadingShapes";
import { palette } from "../../home-v2/design";

const CHAIN_ID = base.id;

function formatAmount(value: bigint): string {
  const str = formatEther(value);
  const num = parseFloat(str);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return num.toFixed(Math.min(6, 18));
}

interface WchanBuyContentProps {
  appearance?: "bauhaus" | "midnight";
  direction: SwapDirection;
  sellAmount: string;
  sellAmountValid: boolean;
  slippageBps: number;
  onSlippageChange: (bps: number) => void;
  outputTokenSymbol: string;
  inputBalanceWei: bigint | undefined;
  onTxConfirmed: (hash?: `0x${string}`) => void;
}

export function WchanBuyContent({
  appearance = "bauhaus",
  direction,
  sellAmount,
  sellAmountValid,
  slippageBps,
  onSlippageChange,
  outputTokenSymbol,
  inputBalanceWei,
  onTxConfirmed,
}: WchanBuyContentProps) {
  const isMidnight = appearance === "midnight";
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== CHAIN_ID;

  const {
    quote,
    isLoading: isQuoteLoading,
    error: quoteError,
  } = useSwapQuote({
    chainId: CHAIN_ID,
    direction,
    amount: sellAmount,
    enabled: sellAmountValid,
    routePreference: "auto",
  });

  const insufficientBalance = useMemo(() => {
    if (!sellAmountValid || !isConnected || inputBalanceWei === undefined)
      return false;
    try {
      const parsed = parseEther(sellAmount);
      return parsed > inputBalanceWei;
    } catch {
      return false;
    }
  }, [sellAmount, sellAmountValid, inputBalanceWei, isConnected]);

  const outputAmount =
    quote && quote.amountOut > 0n ? formatAmount(quote.amountOut) : "";

  return (
    <>
      {/* You Receive */}
      <Box>
        <HStack justify="space-between" mb={2}>
          <Text
            fontSize="xs"
            color={isMidnight ? palette.muted : undefined}
            fontWeight="700"
            textTransform={isMidnight ? "none" : "uppercase"}
            letterSpacing={isMidnight ? "0" : "widest"}
          >
            You Receive
          </Text>
          <SlippageSettings
            slippageBps={slippageBps}
            onSlippageChange={onSlippageChange}
            presets={SLIPPAGE_PRESETS}
            appearance={appearance}
          />
        </HStack>
        <HStack
          border={isMidnight ? "1px solid" : "2px solid"}
          borderColor={
            isMidnight ? "rgba(255,255,255,0.14)" : "bauhaus.border"
          }
          borderRadius={isMidnight ? "12px" : 0}
          p={3}
          spacing={3}
          bg={isMidnight ? palette.ink : "gray.50"}
        >
          <Input
            placeholder={quote === null && !isQuoteLoading ? "\u2014" : "0.0"}
            value={isQuoteLoading ? "" : outputAmount}
            readOnly
            border="none"
            _focus={{ boxShadow: "none" }}
            color={isMidnight ? palette.white : undefined}
            _placeholder={isMidnight ? { color: palette.faint } : undefined}
            fontSize="xl"
            fontWeight={isMidnight ? "600" : "black"}
            p={0}
            flex={1}
            cursor="default"
            tabIndex={-1}
          />
          {isQuoteLoading && <LoadingShapes />}
          <Flex
            bg={isMidnight ? palette.ink3 : "bauhaus.blue"}
            color={isMidnight ? palette.white : "white"}
            border={isMidnight ? "1px solid" : undefined}
            borderColor={
              isMidnight ? "rgba(255,255,255,0.12)" : undefined
            }
            borderRadius={isMidnight ? "8px" : 0}
            px={3}
            py={1}
            align="center"
            flexShrink={0}
          >
            <Text fontWeight="bold" fontSize="sm" textTransform="uppercase">
              {outputTokenSymbol}
            </Text>
          </Flex>
        </HStack>

        {/* Route indicator */}
        {quote && (
          <Text
            fontSize="xs"
            color={isMidnight ? palette.faint : "gray.500"}
            fontWeight="bold"
            textTransform={isMidnight ? "none" : "uppercase"}
            textAlign="right"
            mt={1}
          >
            Route: {direction === "buy"
              ? (quote.route === "direct" ? "ETH→WCHAN" : "ETH→BNKRW→WCHAN")
              : (quote.route === "direct" ? "WCHAN→ETH" : "WCHAN→BNKRW→ETH")}
          </Text>
        )}
      </Box>

      {/* Error */}
      {quoteError && (
        <Text
          fontSize="sm"
          color={isMidnight ? palette.red : "bauhaus.red"}
          fontWeight="bold"
          textAlign="center"
        >
          {quoteError}
        </Text>
      )}

      {/* Action buttons */}
      {!isConnected ? (
        <Button
          variant={isMidnight ? undefined : "primary"}
          size="lg"
          w="full"
          onClick={openConnectModal}
          bg={isMidnight ? palette.yellow : undefined}
          color={isMidnight ? palette.ink : undefined}
          borderRadius={isMidnight ? "9px" : undefined}
          fontWeight={isMidnight ? "700" : undefined}
          textTransform={isMidnight ? "none" : undefined}
          letterSpacing={isMidnight ? "0" : undefined}
          _hover={isMidnight ? { bg: palette.amberSoft } : undefined}
          fontSize="md"
          py={6}
        >
          Connect Wallet
        </Button>
      ) : isWrongChain ? (
        <Button
          size="lg"
          w="full"
          bg="orange.500"
          color="white"
          fontWeight={isMidnight ? "700" : "900"}
          textTransform={isMidnight ? "none" : "uppercase"}
          letterSpacing={isMidnight ? "0" : "wide"}
          borderRadius={isMidnight ? "9px" : 0}
          border={isMidnight ? "none" : "3px solid"}
          borderColor={isMidnight ? undefined : "bauhaus.black"}
          fontSize="md"
          py={6}
          _hover={{ bg: "orange.600" }}
          onClick={() => switchChain({ chainId: CHAIN_ID })}
          leftIcon={
            <Image src="/images/base.svg" alt="Base" w="20px" h="20px" />
          }
        >
          Switch to Base
        </Button>
      ) : (
        <SwapButton
          appearance={appearance}
          direction={direction}
          quote={quote}
          chainId={CHAIN_ID}
          slippageBps={slippageBps}
          isQuoteLoading={isQuoteLoading}
          inputValid={sellAmountValid}
          insufficientBalance={insufficientBalance}
          onTxConfirmed={onTxConfirmed}
        />
      )}
    </>
  );
}
