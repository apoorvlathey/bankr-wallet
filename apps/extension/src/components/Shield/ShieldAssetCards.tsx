import {
  Box,
  HStack,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Slider,
  SliderFilledTrack,
  SliderMark,
  SliderThumb,
  SliderTrack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowDownIcon } from "@chakra-ui/icons";
import { useState, type ReactNode } from "react";
import { formatEther, parseEther } from "viem";
import {
  BALANCE_SLIDER_SNAP_POINTS,
  snapBalanceSliderValue,
  useSliderValueSound,
} from "@/sounds/useSliderValueSound";
import LoadingDots from "@/components/LoadingDots";
import {
  SHIELDED_ETH_LOGO_URL,
  SHIELDED_ETH_NETWORK_NAME,
} from "./model/shieldedAsset";
import { formatShieldWei } from "./model/shieldQuote";
import ShieldAmountConversion from "./ShieldAmountConversion";

const ETH_LOGO_URL = "/chainIcons/ethereum.svg";

function FixedAssetIdentity({ shielded }: { shielded: boolean }) {
  return (
    <HStack
      flexShrink={0}
      spacing={1.5}
      px={2}
      py={1.5}
      bg="surface.raised"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
    >
      <Image
        src={shielded ? SHIELDED_ETH_LOGO_URL : ETH_LOGO_URL}
        alt=""
        boxSize="22px"
      />
      <VStack align="start" spacing={0} minW={0}>
        <Text fontSize="xs" fontWeight="700" lineHeight="1.1" noOfLines={1}>
          {shielded ? "Shielded ETH" : "ETH"}
        </Text>
        <Text fontSize="2xs" color="fg.muted" lineHeight="1.2" noOfLines={1}>
          {shielded ? "Privacy Pools" : SHIELDED_ETH_NETWORK_NAME}
        </Text>
      </VStack>
    </HStack>
  );
}

interface ShieldSourceCardProps {
  label: string;
  shielded: boolean;
  amount: string;
  balanceWei: bigint;
  maxWei: bigint;
  balanceLabel?: string;
  balanceLabelColor?: string;
  balanceSummary?: ReactNode;
  error?: string | null;
  errorId?: string;
  errorPlacement?: "inline" | "external";
  amountWei?: bigint;
  isUsdMode?: boolean;
  conversionLabel?: string | null;
  onToggleAmountMode?: () => void;
  formatAmountWei?: (valueWei: bigint) => string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  onAmountChange: (value: string) => void;
}

export function ShieldSourceCard({
  label,
  shielded,
  amount,
  balanceWei,
  maxWei,
  balanceLabel,
  balanceLabelColor,
  balanceSummary,
  error,
  errorId,
  errorPlacement = "inline",
  amountWei: controlledAmountWei,
  isUsdMode = false,
  conversionLabel,
  onToggleAmountMode,
  formatAmountWei,
  isDisabled,
  isReadOnly,
  onAmountChange,
}: ShieldSourceCardProps) {
  const sliderSound = useSliderValueSound();
  const [dragValue, setDragValue] = useState<number | null>(null);
  let parsedAmountWei = 0n;
  if (controlledAmountWei !== undefined) {
    parsedAmountWei = controlledAmountWei;
  } else {
    try {
      parsedAmountWei = amount ? parseEther(amount) : 0n;
    } catch {
      parsedAmountWei = 0n;
    }
  }
  const sliderValue = maxWei > 0n
    ? Math.min(100, Number((parsedAmountWei * 100n) / maxWei))
    : 0;
  const interactionValue = dragValue ?? sliderValue;
  const snappedValue = snapBalanceSliderValue(interactionValue);
  const amountForPercentage = (percentage: number) => {
    const snapped = snapBalanceSliderValue(percentage);
    if (snapped === 0) return "";
    const valueWei = (maxWei * BigInt(snapped)) / 100n;
    return formatAmountWei?.(valueWei) ?? formatEther(valueWei);
  };
  const displayedAmount = dragValue === null
    ? amount
    : amountForPercentage(dragValue);
  const hasConversion = Boolean(onToggleAmountMode || conversionLabel);
  const setPercentage = (percentage: number) => {
    onAmountChange(amountForPercentage(percentage));
  };

  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderColor={error ? "status.error.border" : "border.default"}
      borderRadius="lg"
      px={3}
      pt={3}
      pb={4}
    >
      <HStack justify="space-between" mb={1.5} spacing={3}>
        <Text fontSize="sm" fontWeight="600" color="fg.secondary">
          {label}
        </Text>
        <FixedAssetIdentity shielded={shielded} />
      </HStack>

      <InputGroup>
        {isUsdMode && (
          <InputLeftElement pointerEvents="none" h="full" w="30px" pl={2}>
            <Text fontFamily="mono" fontSize="sm" fontWeight="700" color="fg.muted">
              $
            </Text>
          </InputLeftElement>
        )}
        <Input
          aria-label={`${label} ${isUsdMode ? "USD" : "ETH"} amount`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="0.0"
          value={displayedAmount}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          inputMode="decimal"
          autoComplete="off"
          fontFamily="mono"
          fontSize="xl"
          fontWeight="600"
          minH="48px"
          bg="surface.sunken"
          borderColor="border.default"
          pl={isUsdMode ? "30px" : undefined}
          pr={hasConversion ? (isUsdMode ? "168px" : "112px") : undefined}
          onChange={(event) => {
            if (/^\d*\.?\d*$/.test(event.target.value)) {
              onAmountChange(event.target.value);
            }
          }}
        />
        <ShieldAmountConversion
          isUsdMode={isUsdMode}
          conversionLabel={conversionLabel}
          onToggleAmountMode={onToggleAmountMode}
        />
      </InputGroup>

      {balanceSummary ?? (
        <HStack justify="space-between" minH="18px" mt={1.25} spacing={3}>
          <Text
            id={errorPlacement === "inline" && error ? errorId : undefined}
            role={errorPlacement === "inline" && error ? "alert" : undefined}
            color={errorPlacement === "inline" && error
              ? "status.error.fg"
              : balanceLabelColor ?? "fg.muted"}
            fontSize="xs"
            noOfLines={2}
          >
            {errorPlacement === "inline" && error ? error : balanceLabel ?? ""}
          </Text>
          <Text
              flexShrink={0}
              color="fg.secondary"
              fontSize="xs"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              Balance {formatShieldWei(balanceWei)} ETH
            </Text>
        </HStack>
      )}

      {balanceSummary && errorPlacement === "inline" && error ? (
        <Text
          id={errorId}
          role="alert"
          mt={1.25}
          color="status.error.fg"
          fontSize="xs"
        >
          {error}
        </Text>
      ) : null}

      {maxWei > 0n && (
        <Box px={1} pt={2.5} pb={5}>
          <Slider
            aria-label={`Percentage of ${shielded ? "shielded" : SHIELDED_ETH_NETWORK_NAME} ETH balance`}
            min={0}
            max={100}
            step={1}
            value={interactionValue}
            isDisabled={isDisabled}
            focusThumbOnChange={false}
            onChangeStart={() => {
              sliderSound.onChangeStart(sliderValue);
            }}
            onChangeEnd={(value) => {
              const snapped = snapBalanceSliderValue(value);
              sliderSound.onChangeEnd(snapped);
              setDragValue(null);
              setPercentage(snapped);
            }}
            onChange={(value) => {
              const snapped = snapBalanceSliderValue(value);
              setDragValue(snapped);
              sliderSound.onValueChange(snapped);
            }}
          >
            {BALANCE_SLIDER_SNAP_POINTS.map((percentage) => (
              <SliderMark
                key={percentage}
                value={percentage}
                mt={3}
                fontSize="xs"
                fontWeight={snappedValue === percentage ? "700" : "500"}
                color={snappedValue === percentage ? "accent.highlight" : "fg.muted"}
                whiteSpace="nowrap"
                transform={percentage === 0
                  ? "translateX(0)"
                  : percentage === 100
                    ? "translateX(-100%)"
                    : "translateX(-50%)"}
              >
                {percentage}%
              </SliderMark>
            ))}
            <SliderTrack bg="surface.raisedHover" h="4px">
              <SliderFilledTrack bg="accent.highlight" />
            </SliderTrack>
            <SliderThumb boxSize="20px" bg="accent.highlight" borderWidth="3px" borderColor="surface.raised" />
          </Slider>
        </Box>
      )}
    </Box>
  );
}

interface ShieldDestinationCardProps {
  shielded: boolean;
  amount: string | null;
  label?: string;
  detail?: string;
  isLoading?: boolean;
}

export function ShieldDestinationCard({
  shielded,
  amount,
  label = "You get",
  detail,
  isLoading = false,
}: ShieldDestinationCardProps) {
  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      pt={3}
      pb={2.5}
    >
      <HStack justify="space-between" mb={1.5} spacing={3}>
        <Text fontSize="sm" fontWeight="600" color="fg.secondary">
          {label}
        </Text>
        <FixedAssetIdentity shielded={shielded} />
      </HStack>
      <Box
        position="relative"
        minH="48px"
        px={3}
        display="flex"
        alignItems="center"
        bg="surface.sunken"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="md"
      >
        {isLoading ? (
          <Box
            position="absolute"
            left="50%"
            top="50%"
            transform="translate(-50%, -50%)"
            pointerEvents="none"
            zIndex={1}
            role="status"
          >
            <LoadingDots />
          </Box>
        ) : (
          <Text
            fontFamily="mono"
            fontSize="xl"
            fontWeight="600"
            color={amount ? "fg.primary" : "fg.muted"}
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {amount ?? "0.0"}
          </Text>
        )}
      </Box>
      <Text mt={1.25} minH="16px" textAlign="right" color="fg.muted" fontSize="xs">
        {detail ?? (shielded ? "Confirmed after the public deposit" : "Delivered by the verified relay")}
      </Text>
    </Box>
  );
}

export function ShieldDirectionMarker() {
  return (
    <Box display="flex" justifyContent="center" my={-2.5} position="relative" zIndex={1}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        boxSize="36px"
        bg="accent.highlight"
        color="accentFg.highlight"
        border="3px solid"
        borderColor="surface.base"
        borderRadius="lg"
      >
        <ArrowDownIcon boxSize={4} />
      </Box>
    </Box>
  );
}
