import { useState, useRef } from "react";
import {
  HStack,
  Text,
  Input,
  Flex,
  Icon,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { SLIPPAGE_PRESETS } from "@/chrome/swapApi";

function GearIcon(props: React.ComponentProps<typeof Icon>) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <path
        fill="currentColor"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
      />
    </Icon>
  );
}

interface SlippageSettingsProps {
  slippageBps: number;
  onSlippageChange: (bps: number) => void;
}

export default function SlippageSettings({
  slippageBps,
  onSlippageChange,
}: SlippageSettingsProps) {
  const { isOpen, onToggle, onClose } = useDisclosure();
  const [customValue, setCustomValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isPreset = SLIPPAGE_PRESETS.includes(slippageBps);
  const displayPercent = (slippageBps / 100).toFixed(
    slippageBps % 100 === 0 ? 0 : 1,
  );

  const handlePresetClick = (bps: number) => {
    onSlippageChange(bps);
    setCustomValue("");
    onClose();
  };

  const handleCustomChange = (val: string) => {
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setCustomValue(val);
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0 && num <= 50) {
        onSlippageChange(Math.round(num * 100));
      }
    }
  };

  return (
    <Popover
      isOpen={isOpen}
      onClose={onClose}
      placement="bottom-end"
      initialFocusRef={inputRef}
    >
      <PopoverTrigger>
        <HStack
          as="button"
          spacing={0.5}
          onClick={onToggle}
          cursor="pointer"
          _hover={{ opacity: 0.7 }}
        >
          <Text fontSize="2xs" fontWeight="bold" color="text.tertiary">
            {displayPercent}% slippage
          </Text>
          <GearIcon boxSize={3} color="text.tertiary" />
        </HStack>
      </PopoverTrigger>
      {/* Popover baseStyle (createTheme.ts) paints
          bg/border/borderColor/borderRadius/boxShadow from theme tokens. */}
      <PopoverContent w="200px">
        <PopoverBody p={3}>
          <VStack spacing={2} align="stretch">
            <HStack spacing={1}>
              {SLIPPAGE_PRESETS.map((bps) => {
                const pct = bps / 100;
                const isActive = slippageBps === bps;
                return (
                  <Flex
                    key={bps}
                    as="button"
                    flex={1}
                    justify="center"
                    py={1}
                    // Active preset uses the cool secondary accent
                    // (Bauhaus blue → Midnight cyan); idle uses the recessed
                    // surface for a subtle inset look in either palette.
                    bg={isActive ? "accent.secondary" : "surface.sunken"}
                    color={isActive ? "accentFg.secondary" : "text.primary"}
                    fontWeight="bold"
                    fontSize="xs"
                    border="2px solid"
                    borderColor={
                      isActive ? "accent.secondary" : "border.default"
                    }
                    _hover={{
                      bg: isActive ? "accent.secondary" : "surface.raisedHover",
                    }}
                    onClick={() => handlePresetClick(bps)}
                  >
                    {pct}%
                  </Flex>
                );
              })}
            </HStack>

            <HStack
              border="2px solid"
              borderColor={
                !isPreset && slippageBps > 0
                  ? "accent.secondary"
                  : "border.default"
              }
              px={2}
              py={1}
              spacing={1}
            >
              <Input
                ref={inputRef}
                placeholder="Custom"
                value={customValue || (slippageBps / 100).toString()}
                onChange={(e) => handleCustomChange(e.target.value)}
                border="none"
                _focus={{ boxShadow: "none" }}
                fontSize="xs"
                fontWeight="bold"
                p={0}
                h="auto"
                flex={1}
              />
              <Text fontSize="xs" fontWeight="bold" color="text.tertiary">
                %
              </Text>
            </HStack>

            {slippageBps > 1000 && (
              <Text fontSize="2xs" color="chart.negative" fontWeight="bold">
                High slippage — front-run risk
              </Text>
            )}
          </VStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
