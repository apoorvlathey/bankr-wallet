import { useState } from "react";
import { Box, HStack, VStack, Text, Code, Collapse, useDisclosure } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import { hexToBigInt, hexToString, Hex } from "viem";
import type { DecodeBytesParamResult, Arg } from "@/lib/decoder/types";
import { renderParams } from "@/components/renderParams";
import { isDarkThemeId, useTheme } from "@/theme";
import { ParamTabButton } from "./ParamTabButton";

interface BytesParamProps {
  value: DecodeBytesParamResult | string;
  rawValue: any;
  chainId: number;
}

type BytesTab = "decoded" | "decimal" | "text";

export function BytesParam({ value, rawValue, chainId }: BytesParamProps) {
  // See UintParam for the rationale behind chart.numeric.
  const numericColor = "chart.numeric";
  const { isOpen, onToggle } = useDisclosure();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const [tab, setTab] = useState<BytesTab>("decoded");

  // Determine if we have nested decoded calldata
  const bytesResult = typeof value === "object" && value !== null && "decoded" in value
    ? value as DecodeBytesParamResult
    : null;
  const hasDecoded = !!bytesResult?.decoded?.functionName;

  // Get raw hex from rawValue (the original bytes before decoding)
  const rawHex = typeof rawValue === "string" && rawValue.startsWith("0x")
    ? rawValue
    : typeof value === "string" && value.startsWith("0x")
    ? value
    : "0x";

  // Auto-select tab if no decoded data
  const effectiveTab = hasDecoded ? tab : tab === "decoded" ? "decimal" : tab;
  const truncated = rawHex.length > 24 ? `${rawHex.slice(0, 14)}...${rawHex.slice(-8)}` : rawHex;

  // Decimal conversion
  let decimalValue = "";
  try {
    if (rawHex && rawHex !== "0x" && rawHex.length > 2) {
      decimalValue = hexToBigInt(rawHex as Hex).toString();
    }
  } catch { /* ignore */ }

  // Text conversion
  let textValue = "";
  try {
    if (rawHex && rawHex !== "0x" && rawHex.length > 2) {
      const decoded = hexToString(rawHex as Hex);
      const printable = [...decoded].every(
        (c) => c.charCodeAt(0) >= 32 || c === "\n" || c === "\r" || c === "\t"
      );
      if (printable && decoded.length > 0) textValue = decoded;
    }
  } catch { /* ignore */ }

  return (
    <VStack align="start" spacing={1} w="full">
      {/* Collapsed summary + toggle */}
      <HStack spacing={1} align="center" cursor="pointer" onClick={onToggle}>
        {isOpen ? <ChevronDownIcon boxSize={3} /> : <ChevronRightIcon boxSize={3} />}
        <Code
          fontSize="xs"
          fontFamily="mono"
          bg="transparent"
          color="text.primary"
          fontWeight="600"
          p={0}
        >
          {hasDecoded ? bytesResult!.decoded!.functionName : truncated}
        </Code>
        <CopyButton value={rawHex} />
      </HStack>

      {/* Expanded content */}
      <Collapse in={isOpen} animateOpacity>
        <Box pl={3} borderLeft="2px solid" borderColor="border.default" w="full">
          {/* Tab buttons */}
          <HStack spacing={0} mb={2}>
            {hasDecoded && (
              <ParamTabButton
                label="Decoded"
                isActive={effectiveTab === "decoded"}
                onClick={() => setTab("decoded")}
              />
            )}
            <ParamTabButton
              label="Decimal"
              isActive={effectiveTab === "decimal"}
              onClick={() => setTab("decimal")}
            />
            <ParamTabButton
              label="Text"
              isActive={effectiveTab === "text"}
              onClick={() => setTab("text")}
              isLast
            />
          </HStack>

          {/* Decoded calldata (nested) */}
          {effectiveTab === "decoded" && hasDecoded && bytesResult?.decoded && (
            <VStack align="start" spacing={1.5}>
              <Code
                px={1.5}
                py={0.5}
                fontSize="10px"
                bg={isDarkTheme ? "accent.highlight" : "accent.secondary"}
                color={isDarkTheme ? "accentFg.highlight" : "accentFg.secondary"}
                fontFamily="mono"
                border={isDarkTheme ? "1px solid" : "1.5px solid"}
                borderColor={isDarkTheme ? "accent.highlight" : "border.default"}
                borderRadius={isDarkTheme ? "md" : 0}
                fontWeight="700"
              >
                {bytesResult.decoded.functionName}
              </Code>
              <VStack align="start" spacing={1} w="full">
                {bytesResult.decoded.args.map((arg: Arg, i: number) =>
                  renderParams(i, arg, chainId)
                )}
              </VStack>
            </VStack>
          )}

          {/* Decimal view */}
          {effectiveTab === "decimal" && (
            <HStack spacing={1}>
              <Text
                fontSize="xs"
                fontFamily="mono"
                color={numericColor}
                fontWeight="600"
                wordBreak="break-all"
              >
                {decimalValue || "0"}
              </Text>
              {decimalValue && <CopyButton value={decimalValue} />}
            </HStack>
          )}

          {/* Text view */}
          {effectiveTab === "text" && (
            <HStack spacing={1} align="start">
              <Text
                fontSize="xs"
                fontFamily="mono"
                color="text.primary"
                fontWeight="600"
                wordBreak="break-all"
                whiteSpace="pre-wrap"
              >
                {textValue || "(not valid text)"}
              </Text>
              {textValue && <CopyButton value={textValue} />}
            </HStack>
          )}
        </Box>
      </Collapse>
    </VStack>
  );
}
