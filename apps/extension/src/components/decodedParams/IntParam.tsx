import { useState } from "react";
import { HStack, VStack, Text, Tooltip } from "@chakra-ui/react";
import { CopyButton } from "@/components/CopyButton";
import {
  ETHSelectedOption,
  convertTo,
} from "@/lib/convertUtils";
import { UnitFormatPicker } from "./UnitFormatPicker";

interface IntParamProps {
  value: string;
}

// Values longer than this get a dedicated wrapping line so the
// unit / copy controls remain fully visible next to the param.
const LONG_VALUE_THRESHOLD = 20;

export function IntParam({ value }: IntParamProps) {
  // See UintParam for the rationale behind chart.numeric.
  const numericColor = "chart.numeric";
  const [selectedOption, setSelectedOption] = useState<ETHSelectedOption>("Wei");

  const converted = convertTo(value, selectedOption);
  const isLong = converted.length > LONG_VALUE_THRESHOLD;

  const unitDropdown = (
    <UnitFormatPicker selected={selectedOption} onSelect={setSelectedOption} />
  );

  // Long values: controls on their own row (always visible), value wraps below.
  if (isLong) {
    return (
      <VStack align="start" spacing={1} w="full" minW={0}>
        <HStack spacing={1} align="center" flexWrap="wrap">
          {unitDropdown}
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
          {converted}
        </Text>
      </VStack>
    );
  }

  // Short values: keep the compact inline layout.
  return (
    <HStack spacing={1} flexWrap="wrap" align="center">
      <Tooltip label={value} fontSize="xs" openDelay={400}>
        <Text
          fontSize="xs"
          fontFamily="mono"
          color={numericColor}
          fontWeight="700"
          maxW="200px"
          isTruncated
        >
          {converted}
        </Text>
      </Tooltip>

      {unitDropdown}

      <CopyButton value={value} />
    </HStack>
  );
}
