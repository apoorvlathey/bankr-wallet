import { Button, InputRightElement, Text } from "@chakra-ui/react";

export default function ShieldAmountConversion({
  isUsdMode,
  conversionLabel,
  onToggleAmountMode,
}: {
  isUsdMode: boolean;
  conversionLabel?: string | null;
  onToggleAmountMode?: () => void;
}) {
  if (!onToggleAmountMode && !conversionLabel) return null;
  return (
    <InputRightElement
      w={onToggleAmountMode && isUsdMode ? "164px" : "108px"}
      h="calc(100% - 6px)"
      top="3px"
      right="3px"
      pointerEvents={onToggleAmountMode ? undefined : "none"}
    >
      {onToggleAmountMode ? (
        <Button
          aria-label={isUsdMode ? "Enter amount in ETH" : "Enter amount in USD"}
          title={conversionLabel ?? (isUsdMode ? "ETH" : "USD")}
          size="xs"
          variant="ghost"
          w="full"
          h="full"
          minW={0}
          px={1.5}
          justifyContent="flex-end"
          fontFamily="mono"
          fontSize="xs"
          fontWeight="600"
          color="fg.secondary"
          onClick={onToggleAmountMode}
          _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
        >
          <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {conversionLabel ?? (isUsdMode ? "ETH" : "USD")}
          </Text>
        </Button>
      ) : (
        <Text
          w="full"
          px={1.5}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          textAlign="right"
          fontFamily="mono"
          fontSize="xs"
          fontWeight="600"
          color="fg.secondary"
        >
          {conversionLabel}
        </Text>
      )}
    </InputRightElement>
  );
}
