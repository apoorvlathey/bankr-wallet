import { Box, Button, Text } from "@chakra-ui/react";
import { useId, useState } from "react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
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
    <Box minW={0} maxW={isExpanded ? "100%" : maxW} textAlign={textAlign}>
      <Button
        type="button"
        variant="unstyled"
        display="inline-flex"
        alignItems="center"
        minH="24px"
        h="auto"
        maxW="100%"
        p={0}
        fontSize={fontSize}
        fontWeight={fontWeight}
        color={color}
        fontFamily={fontFamily}
        textAlign={textAlign}
        textDecoration="underline"
        textDecorationStyle="dotted"
        textUnderlineOffset="3px"
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        aria-label={`${compact}. ${isExpanded ? "Hide" : "Show"} full precision`}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <Text as="span" isTruncated>{compact}</Text>
      </Button>
      {isExpanded && (
        <Text
          id={detailsId}
          mt={1}
          fontSize="xs"
          color="fg.secondary"
          fontWeight="500"
          lineHeight="1.4"
          wordBreak="break-all"
        >
          {exact}
        </Text>
      )}
    </Box>
  );
}
