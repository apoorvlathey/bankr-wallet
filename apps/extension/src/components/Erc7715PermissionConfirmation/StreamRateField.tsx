import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  Select,
  Text,
} from "@chakra-ui/react";

import type { StreamRateUnit } from "./streamRateUnit";

export function StreamRateField({
  value,
  unit,
  usdEstimate,
  roundingMessage,
  disabled,
  onValueChange,
  onUnitChange,
}: {
  value: string;
  unit: StreamRateUnit;
  usdEstimate: string;
  roundingMessage: string | null;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: StreamRateUnit) => void;
}) {
  return (
    <FormControl>
      <HStack justify="space-between" spacing={3} mb={2}>
        <FormLabel fontSize="xs" fontWeight="600" color="fg.primary" m={0}>
          Stream rate
        </FormLabel>
        <Select
          aria-label="Stream rate unit"
          value={unit}
          isDisabled={disabled}
          size="xs"
          w="144px"
          flexShrink={0}
          fontSize="xs"
          fontWeight="600"
          onChange={(event) => onUnitChange(event.target.value as StreamRateUnit)}
        >
          <option value="second">Per second</option>
          <option value="day">Per day</option>
        </Select>
      </HStack>
      <InputGroup>
        <Input
          value={value}
          inputMode="decimal"
          isDisabled={disabled}
          pr={usdEstimate ? "110px" : undefined}
          fontSize="md"
          fontWeight="600"
          sx={{ fontVariantNumeric: "tabular-nums" }}
          _disabled={{ cursor: "not-allowed" }}
          onChange={(event) => onValueChange(event.target.value)}
        />
        {usdEstimate && (
          <Box
            maxW="104px"
            pointerEvents="none"
            position="absolute"
            right={3}
            top="50%"
            transform="translateY(-50%)"
            zIndex={1}
          >
            <Text
              color="chart.numeric"
              fontSize="xs"
              fontWeight="600"
              noOfLines={1}
              textAlign="right"
            >
              {usdEstimate}
            </Text>
          </Box>
        )}
      </InputGroup>
      {roundingMessage && (
        <Text
          mt={1.5}
          color="status.warning.fg"
          fontSize="xs"
          lineHeight="1.45"
        >
          {roundingMessage}
        </Text>
      )}
    </FormControl>
  );
}
