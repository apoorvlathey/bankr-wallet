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
import { useTheme } from "@/theme";
import { formatTokenAmount } from "./formatting";
import type { TransferPreparation } from "./hooks/useTransferPreparation";

interface AmountSectionProps {
  token: PortfolioToken | null;
  preparation: TransferPreparation;
}

export function AmountSection({ token, preparation }: AmountSectionProps) {
  const { tokens } = useTheme();
  const {
    amount,
    updateAmount,
    isUsdMode,
    sliderValue,
    handleSliderChange,
    handleSliderChangeStart,
    handleSliderChangeEnd,
    setMaxAmount,
    toggleAmountMode,
    hasPrice,
    balanceNum,
    isAmountValid,
  } = preparation;

  return (
    <Box>
      <HStack justify="space-between" align="center" mb={1}>
        <Text fontSize="sm" fontWeight="600" color="fg.secondary">
          Amount
        </Text>
        {token && hasPrice && (
          <Button
            size="xs"
            variant="ghost"
            color="accent.secondary"
            fontWeight="800"
            fontSize="xs"
            h="20px"
            px={1}
            onClick={toggleAmountMode}
            _hover={{ bg: "bg.muted" }}
          >
            {isUsdMode ? token.symbol.toUpperCase() : "USD"}
          </Button>
        )}
      </HStack>
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
          placeholder="0.0"
          value={amount}
          onChange={(event) => updateAmount(event.target.value)}
          fontFamily="mono"
          fontSize="sm"
          pl={isUsdMode ? "28px" : undefined}
          pr="60px"
        />
        <InputRightElement w="55px" h="full">
          <Button
            size="xs"
            variant="ghost"
            color="accent.secondary"
            fontWeight="800"
            onClick={setMaxAmount}
            _hover={{ bg: "bg.muted" }}
          >
            MAX
          </Button>
        </InputRightElement>
      </InputGroup>
      {token && amount && parseFloat(amount) > 0 && hasPrice && (
        <Text fontSize="xs" color="text.tertiary" fontWeight="700" mt={1}>
          {isUsdMode
            ? `${formatTokenAmount(parseFloat(amount) / token.priceUsd)} ${token.symbol.toUpperCase()}`
            : formatUsd(parseFloat(amount) * token.priceUsd)}
        </Text>
      )}
      {balanceNum > 0 && (
        <Box px={3} pt={2} pb={6} minW={0}>
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
                fontWeight="800"
                color={
                  sliderValue >= percentage ? "accent.secondary" : "fg.muted"
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
            <SliderTrack bg="bg.muted" h="6px">
              <SliderFilledTrack bg="accent.secondary" />
            </SliderTrack>
            <SliderThumb
              boxSize={5}
              bg="accent.secondary"
              border={tokens.borders.medium}
              borderColor="border.default"
              _focus={{ boxShadow: "none" }}
            />
          </Slider>
        </Box>
      )}
      {amount && !isAmountValid() && parseFloat(amount) > 0 && (
        <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
          Insufficient balance
        </Text>
      )}
    </Box>
  );
}
