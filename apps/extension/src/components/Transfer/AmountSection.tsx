import {
  Box,
  Button,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Slider,
  SliderFilledTrack,
  SliderMark,
  SliderThumb,
  SliderTrack,
  Text,
} from "@chakra-ui/react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { BALANCE_SLIDER_SNAP_POINTS } from "@/sounds/useSliderValueSound";
import { formatTokenAmount } from "./formatting";
import type { TransferPreparation } from "./hooks/useTransferPreparation";

interface AmountSectionProps {
  token: PortfolioToken | null;
  preparation: TransferPreparation;
}

export function AmountSection({ token, preparation }: AmountSectionProps) {
  const {
    amount,
    updateAmount,
    isUsdMode,
    sliderValue,
    handleSliderChange,
    handleSliderChangeStart,
    handleSliderChangeEnd,
    setMaxAmount,
    isMaxAmountReady,
    toggleAmountMode,
    hasPrice,
    balanceNum,
    isAmountValid,
  } = preparation;
  const parsedAmount = parseFloat(amount);
  const convertedAmount =
    token && amount && parsedAmount > 0 && hasPrice
      ? isUsdMode
        ? `${formatTokenAmount(parsedAmount / token.priceUsd)} ${token.symbol.toUpperCase()}`
        : formatUsd(parsedAmount * token.priceUsd)
      : null;
  const canToggleMode = Boolean(token && hasPrice);
  const modeSwitchLabel =
    convertedAmount ??
    (isUsdMode ? token?.symbol.toUpperCase() ?? "TOKEN" : "USD");
  const conversionSuffixWidth = canToggleMode
    ? isUsdMode
      ? "164px"
      : "128px"
    : "55px";
  const amountInputRightPadding = canToggleMode
    ? isUsdMode
      ? "168px"
      : "132px"
    : "60px";

  return (
    <Box>
      <Text
        as="label"
        htmlFor="send-amount"
        display="block"
        mb={1.5}
        fontSize="sm"
        fontWeight="600"
        color="fg.secondary"
      >
        Amount
      </Text>
      <InputGroup>
        {isUsdMode && (
          <InputLeftElement pointerEvents="none" h="full" w="28px" pl={2}>
            <Text
              fontFamily="mono"
              fontSize="sm"
              color="text.tertiary"
              fontWeight="700"
            >
              $
            </Text>
          </InputLeftElement>
        )}
        <Input
          id="send-amount"
          placeholder="0.0"
          value={amount}
          onChange={(event) => updateAmount(event.target.value)}
          fontFamily="mono"
          fontSize="lg"
          fontWeight="500"
          inputMode="decimal"
          autoComplete="off"
          pl={isUsdMode ? "28px" : undefined}
          pr={amountInputRightPadding}
        />
        <InputRightElement
          w={conversionSuffixWidth}
          h="calc(100% - 6px)"
          top="3px"
          right="3px"
        >
          <HStack spacing={1} w="full" h="full" justify="flex-end" minW={0}>
            {canToggleMode && (
              <Button
                aria-label={
                  isUsdMode
                    ? `Enter amount in ${token?.symbol.toUpperCase() ?? "token"}`
                    : "Enter amount in USD"
                }
                size="xs"
                variant="ghost"
                minW={0}
                maxW={isUsdMode ? "112px" : "76px"}
                h="full"
                px={1}
                title={modeSwitchLabel}
                fontFamily="mono"
                fontSize="xs"
                fontWeight="600"
                color="fg.secondary"
                onClick={toggleAmountMode}
                _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
              >
                <Text minW={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                  {modeSwitchLabel}
                </Text>
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              color="accent.secondary"
              fontWeight="800"
              flexShrink={0}
              h="full"
              px={1.5}
              onClick={setMaxAmount}
              isDisabled={!isMaxAmountReady}
              title={
                isMaxAmountReady
                  ? "Use the maximum spendable balance"
                  : "Calculating gas reserve"
              }
              _hover={{ bg: "surface.sunken" }}
            >
              MAX
            </Button>
          </HStack>
        </InputRightElement>
      </InputGroup>
      {balanceNum > 0 && (
        <Box px={1} pt={3} pb={6} minW={0}>
          <Slider
            aria-label="Percentage of balance to send"
            min={0}
            max={100}
            step={1}
            value={sliderValue}
            focusThumbOnChange={false}
            onChangeStart={handleSliderChangeStart}
            onChangeEnd={handleSliderChangeEnd}
            onChange={handleSliderChange}
          >
            {BALANCE_SLIDER_SNAP_POINTS.map((percentage) => (
              <SliderMark
                key={percentage}
                value={percentage}
                mt={3}
                fontSize="xs"
                fontWeight={sliderValue === percentage ? "700" : "500"}
                color={
                  sliderValue === percentage ? "accent.highlight" : "fg.muted"
                }
                whiteSpace="nowrap"
                transform={
                  percentage === 0
                    ? "translateX(0)"
                    : percentage === 100
                      ? "translateX(-100%)"
                      : "translateX(-50%)"
                }
              >
                {percentage}%
              </SliderMark>
            ))}
            <SliderTrack bg="surface.raisedHover" h="4px">
              <SliderFilledTrack bg="accent.highlight" />
            </SliderTrack>
            <SliderThumb
              boxSize="24px"
              minW="24px"
              minH="24px"
              bg="transparent"
              border="none"
              _before={{
                content: '""',
                display: "block",
                boxSize: "18px",
                borderRadius: "5px",
                bg: "accent.highlight",
                border: "2px solid",
                borderColor: "surface.base",
              }}
            />
          </Slider>
        </Box>
      )}
      {amount && !isAmountValid() && parsedAmount > 0 && (
        <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
          Insufficient balance
        </Text>
      )}
    </Box>
  );
}
