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
import { SwapArrowIcon, TokenAddressRow, TokenChainTrigger } from "./SwapTokenControls";

interface SellTokenCardProps {
  sellToken: PortfolioToken | null;
  sellChainId: number;
  explorer: string;
  sellAmount: string;
  sellTokenAmount: string;
  isUsdMode: boolean;
  hasPrice: boolean;
  sellBalance: number;
  sliderValue: number;
  insufficientBalance: boolean;
  sellAmountNumber: number;
  copied: boolean;
  onOpenPicker: () => void;
  onToggleMode: () => void;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  onCopy: () => void;
  onSliderChange: (value: number) => void;
}

export function SellTokenCard({
  sellToken,
  sellChainId,
  explorer,
  sellAmount,
  sellTokenAmount,
  isUsdMode,
  hasPrice,
  sellBalance,
  sliderValue,
  insufficientBalance,
  sellAmountNumber,
  copied,
  onOpenPicker,
  onToggleMode,
  onAmountChange,
  onMax,
  onCopy,
  onSliderChange,
}: SellTokenCardProps) {
  const sliderSound = useSliderValueSound();

  return (
    <Box
      bg="surface.raised"
      border="2px solid"
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      p={3}
    >
      <HStack justify="space-between" mb={2} align="center">
        <Text fontSize="xs" fontWeight="600" color="fg.secondary">
          You sell
        </Text>
        {sellToken && hasPrice && (
          <HStack spacing={1}>
            {sellAmount && parseFloat(sellAmount) > 0 && (
              <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                {isUsdMode
                  ? Number(
                      parseFloat(sellTokenAmount).toPrecision(6),
                    ).toLocaleString("en-US", { maximumFractionDigits: 6 })
                  : formatUsd(parseFloat(sellAmount) * sellToken.priceUsd)}
              </Text>
            )}
            <Button
              size="xs"
              variant="ghost"
              color="accent.secondary"
              fontWeight="800"
              fontSize="xs"
              h="20px"
              px={1}
              onClick={onToggleMode}
              rightIcon={<SwapArrowIcon boxSize={3} />}
              _hover={{ bg: "surface.sunken" }}
              sx={{ "& .chakra-button__icon": { marginInlineStart: "2px" } }}
            >
              {isUsdMode ? sellToken.symbol.toUpperCase() : "USD"}
            </Button>
          </HStack>
        )}
      </HStack>

      <HStack spacing={2}>
        <TokenChainTrigger
          token={sellToken}
          chainId={sellChainId}
          onClick={onOpenPicker}
        />
        <InputGroup flex={1} isolation="isolate">
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
            fontSize="sm"
            border="2px solid"
            borderColor="border.default"
            bg="surface.raised"
            _hover={{ borderColor: "accent.secondary" }}
            _focus={{ borderColor: "accent.secondary", boxShadow: "none" }}
            pl={isUsdMode ? "28px" : undefined}
            pr="50px"
          />
          <InputRightElement
            w="45px"
            h="calc(100% - 6px)"
            top="3px"
            right="3px"
          >
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
          </InputRightElement>
        </InputGroup>
      </HStack>

      {sellToken && (
        <HStack align="center" spacing={2} mt={1}>
          {sellToken.contractAddress !== "native" && (
            <TokenAddressRow
              address={sellToken.contractAddress}
              explorer={explorer}
              copied={copied}
              onCopy={onCopy}
            />
          )}
          <HStack ml="auto" spacing={1} align="baseline" whiteSpace="nowrap">
            <Text
              fontSize="xs"
              color="text.tertiary"
              fontWeight="500"
              textTransform="uppercase"
            >
              Bal:{" "}
              {Number(
                parseFloat(sellToken.balance).toPrecision(6),
              ).toLocaleString("en-US", { maximumFractionDigits: 6 })}
            </Text>
            {hasPrice && (
              <Text fontSize="2xs" color="text.tertiary" fontWeight="500">
                ({formatUsd(sellBalance * sellToken.priceUsd)})
              </Text>
            )}
          </HStack>
        </HStack>
      )}

      {sellToken && sellBalance > 0 && (
        <Box px={2} pt={2} pb={6}>
          <Slider
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
                fontWeight="800"
                color={
                  sliderValue >= percentage
                    ? "accent.secondary"
                    : "text.tertiary"
                }
                whiteSpace="nowrap"
                transform="translateX(-50%)"
              >
                {percentage}%
              </SliderMark>
            ))}
            <SliderTrack bg="surface.sunken" h="6px">
              <SliderFilledTrack bg="accent.secondary" />
            </SliderTrack>
            <SliderThumb
              boxSize={5}
              bg="accent.secondary"
              border="2px solid"
              borderColor="border.default"
              _focus={{ boxShadow: "none" }}
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
