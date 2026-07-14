import { useState, useEffect, useRef, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Skeleton,
  Spacer,
  Code,
  IconButton,
  Button,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";
import { decodeRecursive } from "@/lib/decoder";
import { renderParams } from "@/components/renderParams";
import type { DecodeRecursiveResult } from "@/lib/decoder/types";
import { isDarkThemeId, useTheme } from "@/theme";

interface CalldataDecoderProps {
  calldata: string;
  to: string;
  chainId: number;
  onFunctionName?: (name: string) => void;
  /**
   * When true, render the decoder in a collapsed state — only a thin header
   * with the function name + expand chevron is visible until the user opts
   * in. Used on ERC20 approval confirmations where the structured approval
   * card above already conveys the essential info.
   */
  defaultCollapsed?: boolean;
  /**
   * Drop the card drop-shadow. The default `boxShadow="card"` is calibrated
   * to lift the decoder off a flat page background; when the decoder is
   * embedded inside another raised card (e.g. as the nested-calldata
   * fallback inside `ClearSigningView`), the shadow stacks visibly and the
   * decoder reads as floating mid-card. Set this in those nested contexts.
   */
  flat?: boolean;
}

/**
 * Serialize decoded result to a JSON-friendly format for copying.
 */
function serializeResult(result: DecodeRecursiveResult): string {
  if (!result) return "";
  try {
    const serialized = {
      functionName: result.functionName,
      signature: result.signature,
      args: result.args.map((arg) => ({
        name: arg.name,
        type: arg.type,
        value: serializeValue(arg.value),
      })),
    };
    return JSON.stringify(serialized, null, 2);
  } catch {
    return JSON.stringify(result, null, 2);
  }
}

function serializeValue(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();

  // DecodeBytesParamResult
  if (typeof value === "object" && "decoded" in value) {
    const decoded = value.decoded;
    if (decoded?.functionName) {
      return {
        functionName: decoded.functionName,
        args: decoded.args.map((a: any) => ({
          name: a.name,
          type: a.type,
          value: serializeValue(a.value),
        })),
      };
    }
    return null;
  }

  // Array (tuple or array params)
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && "name" in item && "value" in item) {
        return {
          name: item.name,
          type: item.type,
          value: serializeValue(item.value),
        };
      }
      return serializeValue(item);
    });
  }

  return String(value);
}

/**
 * Check if a decode result has meaningful param names (from ABI).
 * Selector-based decoding produces names like "" or generic "arg0".
 */
function hasParamNames(result: DecodeRecursiveResult): boolean {
  if (!result) return false;
  return result.args.some(
    (arg) => arg.name.length > 0 && !/^arg\d+$/.test(arg.name)
  );
}

/**
 * Determine if the ABI-based decode is an upgrade worth showing over the local decode.
 */
function isAbiDecodeBetter(
  local: DecodeRecursiveResult,
  abi: DecodeRecursiveResult
): boolean {
  if (!abi) return false;
  if (!local) return true;

  // Different function name means ABI found a better match
  if (abi.functionName !== local.functionName) return true;

  // Same function but ABI has real param names
  if (!hasParamNames(local) && hasParamNames(abi)) return true;

  return false;
}

function CalldataDecoder({ calldata, to, chainId, onFunctionName, defaultCollapsed = false, flat = false }: CalldataDecoderProps) {
  const { themeId, tokens } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  // Midnight keeps technical navigation quiet: the active view is marked by
  // a warm rule instead of another filled tab competing with Confirm.
  const tabActiveBg = isDarkTheme ? "transparent" : "fg.primary";
  const tabActiveFg = isDarkTheme ? "fg.primary" : "fg.inverse";
  const [result, setResult] = useState<DecodeRecursiveResult>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"decoded" | "raw">("raw");
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const localResultRef = useRef<DecodeRecursiveResult>(null);

  useEffect(() => {
    if (!calldata || calldata === "0x") {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const decode = async () => {
      setLoading(true);

      // Phase 1: Instant local decode (no ABI fetch)
      try {
        const localDecoded = await decodeRecursive({ calldata });

        if (cancelled) return;

        if (localDecoded && localDecoded.functionName) {
          localResultRef.current = localDecoded;
          setResult(localDecoded);
          setTab("decoded");
          setLoading(false);

          // Phase 2: Background ABI fetch for better param names
          try {
            const abiDecoded = await decodeRecursive({
              calldata,
              address: to,
              chainId,
            });

            if (cancelled) return;

            if (isAbiDecodeBetter(localResultRef.current, abiDecoded)) {
              setResult(abiDecoded);
            }
          } catch {
            // ABI fetch failed — keep local result
          }
        } else {
          // Local decode failed — try with ABI fetch
          try {
            const abiDecoded = await decodeRecursive({
              calldata,
              address: to,
              chainId,
            });

            if (cancelled) return;

            if (abiDecoded && abiDecoded.functionName) {
              setResult(abiDecoded);
              setTab("decoded");
            } else {
              setResult(null);
            }
          } catch {
            if (!cancelled) setResult(null);
          } finally {
            if (!cancelled) {
              setLoading(false);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setResult(null);
          setLoading(false);
        }
      }
    };

    decode();

    return () => {
      cancelled = true;
    };
  }, [calldata, to, chainId]);

  // Notify parent of decoded function name
  useEffect(() => {
    if (result?.functionName && onFunctionName) {
      onFunctionName(result.functionName);
    }
  }, [result?.functionName, onFunctionName]);

  const scrollStyles = {
    "&::-webkit-scrollbar": { width: "6px" },
    "&::-webkit-scrollbar-track": { background: "var(--chakra-colors-bg-muted)" },
    "&::-webkit-scrollbar-thumb": { background: "var(--chakra-colors-border-default)" },
  };

  // Copy value: full JSON for decoded tab, raw calldata for raw tab
  const copyValue = tab === "decoded" && result
    ? serializeResult(result)
    : calldata;

  const showSpinner = loading;

  // Collapsed state — single row that shows "Calldata · <functionName>" and
  // expands on click. Used on approval confirmations (see `defaultCollapsed`).
  if (!expanded) {
    return (
      <Box
        w="full"
        maxW="100%"
        bg={flat ? "transparent" : "surface.raised"}
        border={flat ? 0 : "1px solid"}
        borderColor="border.default"
        borderRadius={flat ? 0 : "lg"}
        boxShadow="none"
        overflow="hidden"
      >
        <HStack
          as="button"
          type="button"
          w="full"
          minH="44px"
          py={2}
          px={3}
          spacing={2}
          onClick={() => setExpanded(true)}
          _hover={{ bg: "bg.muted" }}
          aria-expanded={false}
          aria-label="Show calldata"
        >
          <Text
            fontSize="xs"
            fontWeight="600"
            color="text.secondary"
          >
            Calldata
          </Text>
          {result?.functionName && (
            <Code
              px={1.5}
              py={0}
              fontSize="2xs"
              bg="accent.secondary"
              color="accentFg.secondary"
              fontFamily="mono"
              border={tokens.borders.thin}
              borderColor="border.default"
              borderRadius="md"
              fontWeight="700"
            >
              {result.functionName}
            </Code>
          )}
          <Spacer />
          <Text fontSize="2xs" fontWeight="600" color="text.tertiary">
            Show
          </Text>
          <ChevronRightIcon boxSize={3} color="text.tertiary" />
        </HStack>
      </Box>
    );
  }

  return (
    <Box
      w="full"
      maxW="100%"
      bg={flat ? "transparent" : "surface.raised"}
      border={flat ? 0 : "1px solid"}
      borderColor="border.default"
      borderRadius={flat ? 0 : "lg"}
      boxShadow="none"
      overflow="hidden"
    >
      {/* Tab header */}
      <HStack role="group" aria-label="Calldata view" p={0} borderBottom="1px solid" borderColor="border.subtle" spacing={0}>
        <Button
          type="button"
          aria-pressed={tab === "decoded"}
          variant="unstyled"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flex={1}
          minH="44px"
          px={3}
          bg={tab === "decoded" ? tabActiveBg : "transparent"}
          borderBottomWidth={tab === "decoded" && isDarkTheme ? "2px" : 0}
          borderBottomStyle="solid"
          borderBottomColor="accent.highlight"
          onClick={() => setTab("decoded")}
          borderRadius={0}
          _hover={{ bg: tab === "decoded" ? tabActiveBg : "surface.raisedHover" }}
        >
          <HStack spacing={1.5} justify="center">
            <Text
              fontSize="xs"
              fontWeight="600"
              color={tab === "decoded" ? tabActiveFg : "text.secondary"}
            >
              Decoded
            </Text>
            {showSpinner && <ShapesLoader size="6px" />}
          </HStack>
        </Button>
        <Box w="1px" bg="border.subtle" alignSelf="stretch" />
        <Button
          type="button"
          aria-pressed={tab === "raw"}
          variant="unstyled"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flex={1}
          minH="44px"
          px={3}
          bg={tab === "raw" ? tabActiveBg : "transparent"}
          borderBottomWidth={tab === "raw" && isDarkTheme ? "2px" : 0}
          borderBottomStyle="solid"
          borderBottomColor="accent.highlight"
          onClick={() => setTab("raw")}
          borderRadius={0}
          _hover={{ bg: tab === "raw" ? tabActiveBg : "surface.raisedHover" }}
        >
          <Text
            fontSize="xs"
            fontWeight="600"
            textAlign="center"
            color={tab === "raw" ? tabActiveFg : "text.secondary"}
          >
            Raw
          </Text>
        </Button>
        <Spacer />
        <Box pr={1}>
          <CopyButton value={copyValue} />
        </Box>
        {defaultCollapsed && (
          <IconButton
            aria-label="Hide calldata"
            icon={<ChevronDownIcon />}
            size="xs"
            variant="ghost"
            mr={1}
            color="text.tertiary"
            onClick={() => setExpanded(false)}
            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
          />
        )}
      </HStack>

      {/* Content — both tabs always rendered, inactive hidden to preserve state */}
      <Box p={3} display={tab === "decoded" ? "block" : "none"} maxW="100%" overflow="hidden">
        {loading ? (
          <VStack spacing={2} align="start">
            <Skeleton h="16px" w="120px" />
            <Skeleton h="14px" w="200px" />
            <Skeleton h="14px" w="180px" />
          </VStack>
        ) : result ? (
          <VStack align="start" spacing={2} maxW="100%">
            {/* Function name */}
            <Code
              px={2}
              py={1}
              fontSize="xs"
              bg={isDarkTheme ? "surface.sunken" : "accent.secondary"}
              color={isDarkTheme ? "accent.highlight" : "accentFg.secondary"}
              fontFamily="mono"
              border={tokens.borders.thin}
              borderColor={isDarkTheme ? "accent.highlight" : "border.default"}
              borderRadius="md"
              fontWeight="700"
            >
              {result.functionName}
            </Code>

            {/* Parameters */}
            <Box
              w="full"
              maxW="100%"
              maxH="220px"
              overflowX="auto"
              overflowY="auto"
              pr={1}
              css={scrollStyles}
            >
              <VStack align="start" spacing={1.5} w="full" minW={0}>
                {result.args.map((arg, i) => renderParams(i, arg, chainId))}
              </VStack>
            </Box>
          </VStack>
        ) : (
          <Text fontSize="xs" color="text.tertiary" fontWeight="600">
            Could not decode calldata
          </Text>
        )}
      </Box>
      <Box p={3} display={tab === "raw" ? "block" : "none"}>
        <Box
          p={3}
          bg="bg.muted"
          border={tokens.borders.thin}
          borderColor="border.default"
          borderRadius="md"
          maxW="100%"
          maxH="100px"
          overflowX="auto"
          overflowY="auto"
          css={scrollStyles}
        >
          <Text
            fontSize="xs"
            fontFamily="mono"
            color="text.primary"
            wordBreak="break-all"
            whiteSpace="pre-wrap"
          >
            {calldata}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

export default memo(CalldataDecoder);
