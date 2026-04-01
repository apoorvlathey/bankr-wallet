import { useState, useEffect, useRef, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Skeleton,
  Spacer,
  Code,
} from "@chakra-ui/react";
import { CopyButton } from "@/components/CopyButton";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";
import { decodeRecursive } from "@/lib/decoder";
import { renderParams } from "@/components/renderParams";
import type { DecodeRecursiveResult } from "@/lib/decoder/types";

interface CalldataDecoderProps {
  calldata: string;
  to: string;
  chainId: number;
  onFunctionName?: (name: string) => void;
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

function CalldataDecoder({ calldata, to, chainId, onFunctionName }: CalldataDecoderProps) {
  const [result, setResult] = useState<DecodeRecursiveResult>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"decoded" | "raw">("raw");
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
    "&::-webkit-scrollbar-track": { background: "#E0E0E0" },
    "&::-webkit-scrollbar-thumb": { background: "#121212" },
  };

  // Copy value: full JSON for decoded tab, raw calldata for raw tab
  const copyValue = tab === "decoded" && result
    ? serializeResult(result)
    : calldata;

  const showSpinner = loading;

  return (
    <Box
      w="full"
      maxW="100%"
      bg="bauhaus.white"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
      overflow="hidden"
    >
      {/* Tab header */}
      <HStack p={0} borderBottom="2px solid" borderColor="bauhaus.black" spacing={0}>
        <Box
          flex={1}
          py={2}
          px={3}
          cursor="pointer"
          bg={tab === "decoded" ? "bauhaus.black" : "transparent"}
          onClick={() => setTab("decoded")}
        >
          <HStack spacing={1.5} justify="center">
            <Text
              fontSize="xs"
              fontWeight="800"
              textTransform="uppercase"
              letterSpacing="wide"
              color={tab === "decoded" ? "bauhaus.white" : "text.secondary"}
            >
              Decoded
            </Text>
            {showSpinner && <ShapesLoader size="6px" />}
          </HStack>
        </Box>
        <Box w="2px" bg="bauhaus.black" alignSelf="stretch" />
        <Box
          flex={1}
          py={2}
          px={3}
          cursor="pointer"
          bg={tab === "raw" ? "bauhaus.black" : "transparent"}
          onClick={() => setTab("raw")}
        >
          <Text
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wide"
            textAlign="center"
            color={tab === "raw" ? "bauhaus.white" : "text.secondary"}
          >
            Raw
          </Text>
        </Box>
        <Spacer />
        <Box pr={1}>
          <CopyButton value={copyValue} />
        </Box>
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
              bg="bauhaus.blue"
              color="white"
              fontFamily="mono"
              border="2px solid"
              borderColor="bauhaus.black"
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
          border="2px solid"
          borderColor="bauhaus.black"
          maxW="100%"
          maxH="100px"
          overflowX="auto"
          overflowY="auto"
          css={scrollStyles}
        >
          <Text
            fontSize="xs"
            fontFamily="mono"
            color="text.tertiary"
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
