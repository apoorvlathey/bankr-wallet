import {
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  formatNativeValueCompact,
  formatNativeValueExact,
  parseNativeAmount,
} from "@/lib/nativeValueFormat";

export default function NativeValueAmount({
  value,
  symbol,
  decimals,
  fontSize = "xs",
  fontWeight = "700",
  color = "text.primary",
  fontFamily,
  maxW = "210px",
  textAlign = "right",
}: {
  value: string | bigint | undefined;
  symbol: string;
  decimals?: number;
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  fontFamily?: string;
  maxW?: string;
  textAlign?: "left" | "center" | "right";
}) {
  const parsed = parseNativeAmount(value);

  if (!parsed.ok) {
    return (
      <Text
        fontSize={fontSize}
        fontWeight={fontWeight}
        color="chart.negative"
        textAlign={textAlign}
      >
        Invalid value
      </Text>
    );
  }

  const compact = formatNativeValueCompact(parsed.amount, symbol, decimals);
  const exact = formatNativeValueExact(parsed.amount, symbol, decimals);

  if (parsed.amount === 0n) {
    return (
      <Text
        fontSize={fontSize}
        fontWeight={fontWeight}
        color={color}
        fontFamily={fontFamily}
        textAlign={textAlign}
      >
        {compact}
      </Text>
    );
  }

  return (
    <Popover trigger="hover" placement="top-end" openDelay={150} closeDelay={100}>
      <PopoverTrigger>
        <Text
          fontSize={fontSize}
          fontWeight={fontWeight}
          color={color}
          fontFamily={fontFamily}
          cursor="help"
          maxW={maxW}
          isTruncated
          textAlign={textAlign}
          tabIndex={0}
        >
          {compact}
        </Text>
      </PopoverTrigger>
      <Portal>
        <PopoverContent maxW="260px" w="max-content" zIndex="popover">
          <PopoverArrow />
          <PopoverBody p={3}>
            <VStack align="stretch" spacing={1}>
              <Text
                fontSize="2xs"
                color="text.secondary"
                fontWeight="800"
                textTransform="uppercase"
              >
                Full precision
              </Text>
              <Text
                fontSize="xs"
                color="text.primary"
                fontWeight="700"
                wordBreak="break-all"
              >
                {exact}
              </Text>
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
