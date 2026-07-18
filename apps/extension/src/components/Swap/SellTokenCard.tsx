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
import {
  BALANCE_SLIDER_SNAP_POINTS,
  snapBalanceSliderValue,
  useSliderValueSound,
} from "@/sounds/useSliderValueSound";
import {
  SwapChainTrigger,
  SwapTokenTrigger,
} from "./SwapTokenControls";

interface SellTokenCardProps {
  sellToken: PortfolioToken | null;
  sellChainId: number;
  sellAmount: string;
  sellTokenAmount: string;
  isUsdMode: boolean;
  hasPrice: boolean;
  sellBalance: number;
  sliderValue: number;
  insufficientBalance: boolean;
  sellAmountNumber: number;
  onOpenChainPicker: () => void;
  onOpenTokenPicker: () => void;
  onToggleMode: () => void;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  onSliderChange: (value: number) => void;
}

export function SellTokenCard({
  sellToken,
  sellChainId,
  sellAmount,
  sellTokenAmount,
  isUsdMode,
  hasPrice,
  sellBalance,
  sliderValue,
  insufficientBalance,
  sellAmountNumber,
  onOpenChainPicker,
  onOpenTokenPicker,
  onToggleMode,
  onAmountChange,
  onMax,
  onSliderChange,
}: SellTokenCardProps) {
  const sliderSound = useSliderValueSound();
  const parsedSellAmount = parseFloat(sellAmount);
  const convertedAmount =
    sellToken && hasPrice && Number.isFinite(parsedSellAmount) && parsedSellAmount > 0
      ? isUsdMode
        ? `${Number(parseFloat(sellTokenAmount).toPrecision(6)).toLocaleString(
            "en-US",
            { maximumFractionDigits: 6 },
          )} ${sellToken.symbol.toUpperCase()}`
        : formatUsd(parsedSellAmount * sellToken.priceUsd)
      : null;
  const canToggleMode = Boolean(sellToken && hasPrice);
  const modeSwitchLabel =
    convertedAmount ??
    (isUsdMode ? sellToken?.symbol.toUpperCase() ?? "TOKEN" : "USD");
  const amountSuffixWidth = canToggleMode
    ? isUsdMode
      ? "166px"
      : "128px"
    : "50px";
  const amountInputPadding = canToggleMode
    ? isUsdMode
      ? "170px"
      : "132px"
    : "54px";

  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      pt={3}
      pb={5}
    >
      <HStack justify="space-between" mb={2} align="center" spacing={1}>
        <HStack minW={0} flex="1 1 auto" spacing={1}>
          <Text fontSize="sm" fontWeight="600" color="fg.secondary" flexShrink={0}>
            You pay on
          </Text>
          <SwapChainTrigger chainId={sellChainId} onClick={onOpenChainPicker} />
        </HStack>
        <SwapTokenTrigger token={sellToken} onClick={onOpenTokenPicker} />
      </HStack>

      <InputGroup isolation="isolate">
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
          placeholder="0.0"
          value={sellAmount}
          onChange={(event) => {
            if (/^\d*\.?\d*$/.test(event.target.value)) {
              onAmountChange(event.target.value);
            }
          }}
          fontFamily="mono"
          fontSize="lg"
          fontWeight="500"
          inputMode="decimal"
          autoComplete="off"
          border="1px solid"
          borderColor="border.default"
          borderRadius="lg"
          bg="surface.sunken"
          minH="54px"
          _hover={{ borderColor: "border.focus" }}
          _focus={{ borderColor: "border.focus", boxShadow: "focus" }}
          pl={isUsdMode ? "28px" : undefined}
          pr={amountInputPadding}
        />
        <InputRightElement
          w={amountSuffixWidth}
          h="calc(100% - 6px)"
          top="3px"
          right="3px"
        >
          <HStack w="full" h="full" spacing={1} justify="flex-end">
            {canToggleMode && (
              <Button
                aria-label={
                  isUsdMode
                    ? `Enter amount in ${sellToken?.symbol.toUpperCase() ?? "token"}`
                    : "Enter amount in USD"
                }
                size="xs"
                variant="ghost"
                minW={0}
                maxW={isUsdMode ? "112px" : "76px"}
                h="full"
                px={1}
                fontSize="xs"
                color="fg.secondary"
                fontWeight="600"
                title={modeSwitchLabel}
                onClick={onToggleMode}
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
              h="full"
              onClick={onMax}
              _hover={{ bg: "surface.sunken" }}
            >
              MAX
            </Button>
          </HStack>
        </InputRightElement>
      </InputGroup>

      {sellToken && (
        <Text
          mt={1.5}
          minW={0}
          textAlign="right"
          fontSize="xs"
          color="fg.secondary"
          fontWeight="500"
          noOfLines={1}
        >
          Balance{" "}
          {Number(parseFloat(sellToken.balance).toPrecision(6)).toLocaleString(
            "en-US",
            { maximumFractionDigits: 6 },
          )}
          {hasPrice && (
            <Text as="span" color="fg.muted">
              {" · "}{formatUsd(sellBalance * sellToken.priceUsd)}
            </Text>
          )}
        </Text>
      )}

      {sellToken && sellBalance > 0 && (
        <Box px={1} pt={3} pb={6} minW={0}>
          <Slider
            aria-label="Percentage of balance to swap"
            min={0}
            max={100}
            step={1}
            value={sliderValue}
            focusThumbOnChange={false}
            onChangeStart={() => sliderSound.onChangeStart(sliderValue)}
            onChangeEnd={(value) => {
              const snapped = snapBalanceSliderValue(value);
              sliderSound.onChangeEnd(snapped);
            }}
            onChange={(value) => {
              const snapped = snapBalanceSliderValue(value);
              if (sliderSound.onValueChange(snapped)) onSliderChange(snapped);
            }}
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
                borderColor: "surface.raised",
              }}
            />
          </Slider>
        </Box>
      )}

      {insufficientBalance && sellAmountNumber > 0 && (
        <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
          Insufficient balance
        </Text>
      )}
    </Box>
  );
}
