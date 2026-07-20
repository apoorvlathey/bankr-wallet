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
import { formatUnits } from "viem";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { BALANCE_SLIDER_SNAP_POINTS, snapBalanceSliderValue, useSliderValueSound } from "@/sounds/useSliderValueSound";
import { formatStakingAmount } from "./model/stakingFormatting";
import type { StakingMode } from "./types";

export function StakingAmountPanel(props: {
  mode: StakingMode;
  amount: string;
  tokenAmount: bigint | null;
  isUsdMode: boolean;
  priceUsd: number;
  balance: bigint;
  previewAmount: bigint | null;
  sliderValue: number;
  insufficient: boolean;
  disabled: boolean;
  onAmountChange: (value: string) => void;
  onToggleMode: () => void;
  onPercentageChange: (value: number) => void;
}) {
  const sliderSound = useSliderValueSound();
  const symbol = props.mode === "stake" ? "WCHAN" : "sWCHAN";
  const receiveSymbol = props.mode === "stake" ? "sWCHAN" : "WCHAN";
  const hasPrice = props.priceUsd > 0;
  const convertedAmount = props.tokenAmount && hasPrice
    ? props.isUsdMode
      ? `${Number(Number(formatUnits(props.tokenAmount, 18)).toPrecision(6)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${symbol}`
      : formatUsd(Number(formatUnits(props.tokenAmount, 18)) * props.priceUsd)
    : null;
  const modeSwitchLabel = convertedAmount ?? (props.isUsdMode ? symbol : "$—");
  const suffixWidth = hasPrice ? (props.isUsdMode ? "166px" : "140px") : "62px";
  const inputPadding = hasPrice ? (props.isUsdMode ? "170px" : "144px") : "66px";

  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      pt={3}
      pb={4}
    >
      <HStack justify="space-between" mb={2}>
        <Text as="label" htmlFor="staking-amount" fontSize="sm" color="fg.secondary" fontWeight="600">
          WCHAN Amount
        </Text>
        <Text fontSize="xs" color="fg.secondary" fontFamily="mono">
          Balance {formatStakingAmount(props.balance)}
        </Text>
      </HStack>
      <InputGroup isolation="isolate">
        {props.isUsdMode && (
          <InputLeftElement pointerEvents="none" h="full" w="28px" pl={2}>
            <Text fontFamily="mono" fontSize="sm" color="fg.muted" fontWeight="700">$</Text>
          </InputLeftElement>
        )}
        <Input
          id="staking-amount"
          value={props.amount}
          onChange={(event) => {
            if (/^\d*\.?\d*$/u.test(event.target.value)) props.onAmountChange(event.target.value);
          }}
          placeholder="0.0"
          inputMode="decimal"
          autoComplete="off"
          fontFamily="mono"
          fontSize="lg"
          minH="54px"
          pl={props.isUsdMode ? "28px" : undefined}
          pr={inputPadding}
          isInvalid={props.insufficient}
          isDisabled={props.disabled}
        />
        <InputRightElement w={suffixWidth} h="calc(100% - 6px)" top="3px" right="3px">
          <HStack spacing={1} justify="flex-end" w="full">
            <Button
              aria-label={props.isUsdMode ? `Enter amount in ${symbol}` : "Enter amount in USD"}
              size="xs"
              variant="ghost"
              minW={0}
              maxW={props.isUsdMode ? "112px" : "88px"}
              h="full"
              px={1}
              fontSize="xs"
              color="fg.secondary"
              fontWeight="600"
              title={modeSwitchLabel}
              onClick={props.onToggleMode}
              isDisabled={!hasPrice || props.disabled}
              _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
            >
              <Text minW={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {modeSwitchLabel}
              </Text>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              color="accent.secondary"
              h="full"
              px={1.5}
              onClick={() => props.onPercentageChange(100)}
              isDisabled={props.balance === 0n || props.disabled}
            >
              MAX
            </Button>
          </HStack>
        </InputRightElement>
      </InputGroup>

      {props.balance > 0n && (
        <Box px={1} pt={3} pb={6}>
          <Slider
            aria-label={`Percentage of ${symbol} balance to ${props.mode}`}
            min={0}
            max={100}
            step={1}
            value={props.sliderValue}
            focusThumbOnChange={false}
            onChangeStart={() => sliderSound.onChangeStart(props.sliderValue)}
            onChangeEnd={(value) => sliderSound.onChangeEnd(snapBalanceSliderValue(value))}
            onChange={(value) => {
              const snapped = snapBalanceSliderValue(value);
              if (sliderSound.onValueChange(snapped)) props.onPercentageChange(snapped);
            }}
          >
            {BALANCE_SLIDER_SNAP_POINTS.map((percentage) => (
              <SliderMark
                key={percentage}
                value={percentage}
                mt={3}
                fontSize="xs"
                fontWeight={props.sliderValue === percentage ? "700" : "500"}
                color={props.sliderValue === percentage ? "accent.highlight" : "fg.muted"}
                transform={percentage === 0 ? "translateX(0)" : percentage === 100 ? "translateX(-100%)" : "translateX(-50%)"}
              >
                {percentage}%
              </SliderMark>
            ))}
            <SliderTrack bg="surface.raisedHover" h="4px">
              <SliderFilledTrack bg="accent.highlight" />
            </SliderTrack>
            <SliderThumb boxSize="24px" bg="transparent" border="none" _before={{
              content: '""',
              display: "block",
              boxSize: "18px",
              borderRadius: "5px",
              bg: "accent.highlight",
              border: "2px solid",
              borderColor: "surface.raised",
            }} />
          </Slider>
        </Box>
      )}

      {props.insufficient && (
        <Text mt={1.5} fontSize="xs" color="status.error.emphasis" fontWeight="700">
          Insufficient {symbol} balance
        </Text>
      )}
      {props.previewAmount !== null && (
        <HStack mt={3} pt={3} borderTop="1px solid" borderColor="border.subtle" justify="space-between">
          <Text fontSize="xs" color="fg.secondary">You receive</Text>
          <Text fontSize="sm" fontFamily="mono" fontWeight="700">
            {formatStakingAmount(props.previewAmount)} {receiveSymbol}
          </Text>
        </HStack>
      )}
    </Box>
  );
}
