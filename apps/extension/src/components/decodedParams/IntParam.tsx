import { useState, useRef, useEffect } from "react";
import { HStack, VStack, Text, Button, Tooltip, Box, Portal } from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import {
  ethFormatOptions,
  ETHSelectedOption,
  convertTo,
} from "@/lib/convertUtils";

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const converted = convertTo(value, selectedOption);
  const isLong = converted.length > LONG_VALUE_THRESHOLD;

  // Compute dropdown position when opening
  useEffect(() => {
    if (dropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 2, left: rect.left });
    }
  }, [dropdownOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (!containerRef.current || !containerRef.current.contains(target)) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Close dropdown on scroll (position would be stale)
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleScroll = () => setDropdownOpen(false);
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [dropdownOpen]);

  const unitDropdown = (
    <Box position="relative" ref={containerRef} flexShrink={0}>
      <Button
        ref={buttonRef}
        size="xs"
        h="18px"
        px={1.5}
        fontSize="9px"
        fontWeight="700"
        textTransform="uppercase"
        bg="transparent"
        color="text.secondary"
        border="1px solid"
        borderColor={dropdownOpen ? "border.default" : "border.subtle"}
        borderRadius={0}
        boxShadow="none"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        _hover={{ borderColor: "border.default", boxShadow: "none" }}
        _active={{ transform: "translate(1px, 1px)", boxShadow: "none" }}
        rightIcon={<ChevronDownIcon boxSize={3} />}
      >
        {selectedOption}
      </Button>

      {dropdownOpen && (
        <Portal>
          <VStack
            ref={menuRef}
            position="fixed"
            top={`${menuPos.top}px`}
            left={`${menuPos.left}px`}
            bg="surface.raised"
            border="1.5px solid"
            borderColor="border.default"
            boxShadow="card"
            zIndex={1800}
            spacing={0}
            align="stretch"
            minW="90px"
          >
            {ethFormatOptions.map((opt) => (
              <Box
                key={opt}
                px={2}
                py={1}
                fontSize="9px"
                fontWeight="700"
                textTransform="uppercase"
                cursor="pointer"
                bg={opt === selectedOption ? "fg.primary" : "transparent"}
                color={opt === selectedOption ? "fg.inverse" : "text.primary"}
                _hover={{ bg: opt === selectedOption ? "fg.primary" : "bg.muted" }}
                onClick={() => {
                  setSelectedOption(opt);
                  setDropdownOpen(false);
                }}
              >
                {opt}
              </Box>
            ))}
          </VStack>
        </Portal>
      )}
    </Box>
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
