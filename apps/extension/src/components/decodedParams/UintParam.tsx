import { useState, useRef, useEffect } from "react";
import { HStack, VStack, Text, Button, Tooltip, Box, Portal } from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import {
  ethFormatOptions,
  ETHSelectedOption,
  convertTo,
  formatWithCommas,
  formatCompact,
} from "@/lib/convertUtils";

interface UintParamProps {
  value: string;
}

// Values longer than this get a dedicated wrapping line so the
// FORMAT / unit / copy controls remain fully visible next to the param.
const LONG_VALUE_THRESHOLD = 20;

export function UintParam({ value }: UintParamProps) {
  const [selectedOption, setSelectedOption] = useState<ETHSelectedOption>("Wei");
  const [formatted, setFormatted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

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

  const formatButton = wouldFormatChange && (
    <Button
      size="xs"
      h="18px"
      px={1.5}
      fontSize="9px"
      fontWeight="700"
      textTransform="uppercase"
      bg={formatted ? "bauhaus.black" : "transparent"}
      color={formatted ? "bauhaus.white" : "text.tertiary"}
      border="1px solid"
      borderColor={formatted ? "bauhaus.black" : "gray.300"}
      borderRadius={0}
      boxShadow="none"
      flexShrink={0}
      onClick={() => setFormatted(!formatted)}
      _hover={{ borderColor: "bauhaus.black", boxShadow: "none" }}
      _active={{ transform: "translate(1px, 1px)", boxShadow: "none" }}
    >
      format
    </Button>
  );

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
        borderColor={dropdownOpen ? "bauhaus.black" : "gray.300"}
        borderRadius={0}
        boxShadow="none"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        _hover={{ borderColor: "bauhaus.black", boxShadow: "none" }}
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
            bg="bauhaus.white"
            border="1.5px solid"
            borderColor="bauhaus.black"
            boxShadow="none"
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
                bg={opt === selectedOption ? "bauhaus.black" : "transparent"}
                color={opt === selectedOption ? "bauhaus.white" : "text.primary"}
                _hover={{ bg: opt === selectedOption ? "bauhaus.black" : "bg.muted" }}
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
          {formatButton}
          <CopyButton value={value} />
        </HStack>
        <Text
          fontSize="xs"
          fontFamily="mono"
          color="#B8860B"
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
          color="#B8860B"
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
