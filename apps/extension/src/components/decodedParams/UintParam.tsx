import { useState } from "react";
import { HStack, VStack, Text, Button, Tooltip } from "@chakra-ui/react";
import { CopyButton } from "@/components/CopyButton";
import {
  ETHSelectedOption,
  convertTo,
  formatWithCommas,
  formatCompact,
} from "@/lib/convertUtils";
import { UnitFormatPicker } from "./UnitFormatPicker";

interface UintParamProps {
  value: string;
}

// Values longer than this get a dedicated wrapping line so the
// FORMAT / unit / copy controls remain fully visible next to the param.
const LONG_VALUE_THRESHOLD = 20;

export function UintParam({ value }: UintParamProps) {
  // Numeric value emphasis — sourced from chart.numeric (Bauhaus dark
  // goldenrod, Midnight warm amber).
  const numericColor = "chart.numeric";
  const [selectedOption, setSelectedOption] = useState<ETHSelectedOption>("Wei");
  const [formatted, setFormatted] = useState(false);

  const converted = convertTo(value, selectedOption);
  const isWei = selectedOption === "Wei";

  // Check if formatting would change the display
  const wouldFormatChange = isWei
    ? formatWithCommas(value) !== value || formatCompact(value) !== value
    : formatWithCommas(converted) !== converted;

  // Format display: raw number or comma-separated + compact
  let display = converted;
  if (formatted && isWei) {
    const compact = formatCompact(value);
    display = compact !== value ? `${formatWithCommas(value)} (${compact})` : formatWithCommas(value);
  } else if (formatted && (selectedOption === "ETH" || selectedOption === "Gwei" || selectedOption === "10^6")) {
    display = formatWithCommas(converted);
  }

  // Long values get a dedicated wrapping row so the controls stay visible.
  const isLong = display.length > LONG_VALUE_THRESHOLD;

  const formatButton = wouldFormatChange && (
    <Button
      size="xs"
      minH="24px"
      h="24px"
      px={1.5}
      fontSize="9px"
      fontWeight="700"
      textTransform="none"
      bg={formatted ? "fg.primary" : "transparent"}
      color={formatted ? "fg.inverse" : "text.tertiary"}
      border="1px solid"
      borderColor={formatted ? "border.default" : "border.subtle"}
      borderRadius={0}
      boxShadow="none"
      flexShrink={0}
      onClick={() => setFormatted(!formatted)}
      _hover={{ borderColor: "border.default", boxShadow: "none" }}
      _active={{ transform: "translate(1px, 1px)", boxShadow: "none" }}
    >
      format
    </Button>
  );

  const unitDropdown = (
    <UnitFormatPicker selected={selectedOption} onSelect={setSelectedOption} />
  );

  // Long values: controls on their own row (always visible), value wraps below.
  if (isLong) {
    return (
      <VStack align="start" spacing={1} w="full" minW={0}>
        <HStack spacing={1} align="center" flexWrap="wrap">
          {unitDropdown}
          {formatButton}
          <CopyButton value={value} />
        </HStack>
        <Text
          fontSize="xs"
          fontFamily="mono"
          color={numericColor}
          fontWeight="700"
          wordBreak="break-all"
          w="full"
        >
          {display}
        </Text>
      </VStack>
    );
  }

  // Short values: keep the compact inline layout.
  return (
    <HStack spacing={1} flexWrap="wrap" align="center">
      {formatButton}

      <Tooltip label={value} fontSize="xs" openDelay={400}>
        <Text
          fontSize="xs"
          fontFamily="mono"
          color={numericColor}
          fontWeight="700"
          maxW="200px"
          isTruncated
        >
          {display}
        </Text>
      </Tooltip>

      {unitDropdown}

      <CopyButton value={value} />
    </HStack>
  );
}
