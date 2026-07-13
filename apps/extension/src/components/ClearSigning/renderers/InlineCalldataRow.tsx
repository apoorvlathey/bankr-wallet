import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { Box, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { decodeRecursive } from "@/lib/decoder";
import type { DecodeRecursiveResult } from "@/lib/decoder/types";
import { renderParams } from "@/components/renderParams";

/**
 * Compact inline calldata viewer used inside the nested-call fallback. Mimics
 * the parent's label-left / value-right row when collapsed (label "Calldata",
 * right side = function-name pill + chevron). Click expands a quiet param
 * list directly below the row — no card chrome, no tabs, no copy button (the
 * outer "Show raw details" already covers those). Phase 1 / 2 decode mirrors
 * `CalldataDecoder`: instant local decode by selector, then upgrade with
 * ABI-lookup if it yields better param names.
 */
export function InlineCalldataRow({
  calldata,
  to,
  chainId,
}: {
  calldata: string;
  to: string;
  chainId: number;
}) {
  const [result, setResult] = useState<DecodeRecursiveResult>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!calldata || calldata === "0x") return;
    let cancelled = false;
    (async () => {
      try {
        const local = await decodeRecursive({ calldata });
        if (cancelled) return;
        if (local?.functionName) setResult(local);
        // Background ABI upgrade for better param names. We don't gate the
        // collapsed pill on this — the local decode is enough for the
        // function name; ABI just enriches the expanded params.
        try {
          const withAbi = await decodeRecursive({
            calldata,
            address: to,
            chainId,
          });
          if (!cancelled && withAbi?.functionName) {
            setResult((prev) => {
              if (!prev) return withAbi;
              const localBetter = prev.args.some(
                (a) => a.name && !/^arg\d+$/.test(a.name),
              );
              return localBetter ? prev : withAbi;
            });
          }
        } catch {
          // keep local result
        }
      } catch {
        // selector unknown — fall back to "Unknown" pill below
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calldata, to, chainId]);

  const fnName = result?.functionName;
  const selector = calldata.slice(0, 10).toLowerCase();
  const canExpand = !!result?.args?.length;

  return (
    <Box>
      <HStack align="center" spacing={3} justify="space-between" w="full">
        <Text fontSize="xs" color="fg.secondary" fontWeight="600" flexShrink={0}>
          Calldata
        </Text>
        <HStack spacing={1} flex="1" minW={0} justify="flex-end">
          {fnName ? (
            <Box
              as={canExpand ? "button" : "div"}
              onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
              cursor={canExpand ? "pointer" : "default"}
              px={2}
              py="2px"
              borderRadius="md"
              bg="accent.secondary"
              _hover={canExpand ? { opacity: 0.85 } : undefined}
            >
              <Text
                fontSize="2xs"
                fontFamily="mono"
                color="accentFg.secondary"
                fontWeight="800"
                lineHeight="1.4"
                noOfLines={1}
              >
                {fnName}
              </Text>
            </Box>
          ) : (
            <Text
              fontSize="xs"
              fontFamily="mono"
              color="chart.numeric"
              fontWeight="600"
            >
              {selector}
            </Text>
          )}
          {canExpand && (
            <IconButton
              aria-label={expanded ? "Hide params" : "Show params"}
              icon={
                expanded ? (
                  <ChevronDownIcon boxSize="14px" />
                ) : (
                  <ChevronRightIcon boxSize="14px" />
                )
              }
              size="xs"
              variant="ghost"
              minW="18px"
              h="18px"
              color="fg.muted"
              onClick={() => setExpanded((v) => !v)}
            />
          )}
        </HStack>
      </HStack>
      {expanded && result?.args && (
        <Box mt={2} pl={2} borderLeft="1px solid" borderLeftColor="border.subtle">
          <VStack align="stretch" spacing={1.5}>
            {result.args.map((arg, i) => renderParams(i, arg, chainId))}
          </VStack>
        </Box>
      )}
    </Box>
  );
}
