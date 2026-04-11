import { Text } from "@chakra-ui/react";

interface BoolParamProps {
  value: string;
}

export function BoolParam({ value }: BoolParamProps) {
  const boolVal = value === "true" || value === "1";

  return (
    <Text
      fontSize="xs"
      fontFamily="mono"
      color={boolVal ? "chart.positive" : "chart.negative"}
      fontWeight="700"
    >
      {String(boolVal)}
    </Text>
  );
}
