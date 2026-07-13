import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useState, type ReactNode } from "react";

import { MAX_NESTED_DEPTH } from "../constants";
import type {
  CalldataRenderedValue,
  ClearSigningViewComponent,
} from "../types";
import { AddressInline } from "./AddressInline";
import { InlineCalldataRow } from "./InlineCalldataRow";
import { TokenAmountInline } from "./TokenAmountInline";

/**
 * Full-width container for one or more embedded calldata calls. Renders each
 * inner call as a recursive ClearSigningView; when the inner contract has no
 * matching descriptor (or we've hit the depth cap), falls back to a raw card
 * showing callee + value + selector + truncated data so the user still has
 * something legible.
 */
export function NestedCalldataField({
  label,
  values,
  chainId,
  depth,
  ClearSigningComponent,
}: {
  label: string;
  values: CalldataRenderedValue[];
  chainId: number;
  depth: number;
  ClearSigningComponent: ClearSigningViewComponent;
}) {
  const total = values.length;
  const headerLabel = label || "Transaction";
  return (
    <VStack align="stretch" spacing={3} w="full">
      {values.map((value, idx) => (
        <Box key={idx}>
          {total > 1 && (
            <HStack mb={2} spacing={2} align="center">
              <HStack
                spacing={1}
                px={2}
                py="2px"
                borderRadius="full"
                bg="accent.secondary"
                flexShrink={0}
              >
                <Text
                  fontSize="10px"
                  color="accentFg.secondary"
                  fontWeight="800"
                  lineHeight="1.2"
                >
                  {idx + 1}
                </Text>
                <Text
                  fontSize="10px"
                  color="accentFg.secondary"
                  fontWeight="700"
                  opacity={0.75}
                  lineHeight="1.2"
                >
                  / {total}
                </Text>
              </HStack>
              <Text
                fontSize="10px"
                color="fg.secondary"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="0.08em"
                flexShrink={0}
              >
                {headerLabel}
              </Text>
              <Box flex={1} h="1px" bg="border.default" />
            </HStack>
          )}
          <NestedCalldataCard
            value={value}
            chainId={chainId}
            depth={depth}
            ClearSigningComponent={ClearSigningComponent}
          />
        </Box>
      ))}
    </VStack>
  );
}

function NestedCalldataCard({
  value,
  chainId,
  depth,
  ClearSigningComponent,
}: {
  value: CalldataRenderedValue;
  chainId: number;
  depth: number;
  ClearSigningComponent: ClearSigningViewComponent;
}) {
  // `null` = inner ClearSigningView is still resolving. `true` = matched (the
  // inner card paints itself); `false` = no descriptor matched (we show the
  // raw fallback below). Depth-capped branches skip the recursive mount and
  // jump straight to the fallback so we don't burn lookups on a tree that's
  // already too deep to be useful.
  const [matched, setMatched] = useState<boolean | null>(null);
  const canRecurse = depth < MAX_NESTED_DEPTH;

  if (!canRecurse) {
    return (
      <RawNestedCalldataFallback
        value={value}
        chainId={value.chainId ?? chainId}
      />
    );
  }

  return (
    <>
      <ClearSigningComponent
        kind="calldata"
        chainId={value.chainId ?? chainId}
        from={value.from}
        to={value.callee}
        calldata={value.data}
        value={value.amount}
        depth={depth + 1}
        onResolved={setMatched}
        hideLoadingSkeleton
      />
      {matched === false && (
        <RawNestedCalldataFallback
          value={value}
          chainId={value.chainId ?? chainId}
        />
      )}
    </>
  );
}

/**
 * Shown when an inner embedded call has no descriptor (or we've hit the
 * recursion cap). Renders as flat field rows (To / Value / Selector / Data)
 * with a thin left-border accent so it reads as a continuation of the parent
 * card rather than its own mini-card. No header, no "no descriptor" badge —
 * the rows speak for themselves; jargon noise just makes the parent louder.
 */
function RawNestedCalldataFallback({
  value,
  chainId,
}: {
  value: CalldataRenderedValue;
  chainId: number;
}) {
  const showValue =
    value.amount !== undefined && value.amount !== null && value.amount !== "0";
  const hasCalldata = value.data && value.data.length >= 10;
  return (
    <Box
      pl={3}
      borderLeft="2px solid"
      borderLeftColor="border.default"
      // No right/bottom padding — left rail is the only visual treatment, so
      // the rows align flush with the rest of the parent's column.
    >
      <VStack align="stretch" spacing={2}>
        <NestedFallbackRow label="To">
          <AddressInline address={value.callee} chainId={chainId} />
        </NestedFallbackRow>
        {showValue && value.amount && (
          <NestedFallbackRow label="Value">
            <TokenAmountInline
              amountRaw={value.amount}
              native
              chainId={chainId}
            />
          </NestedFallbackRow>
        )}
        {/* Inline calldata row — keeps the label-left / value-right rhythm
            of "To" / "Value" above. Left: literal "Calldata". Right: the
            decoded function name as a pill + expand chevron. Expanding
            unfurls a quiet param list below the row. Function-name lookup
            uses `decodeRecursive`, so Safe MultiSend / 4byte / on-chain ABI
            all just work. */}
        {hasCalldata && (
          <InlineCalldataRow
            calldata={value.data}
            to={value.callee}
            chainId={chainId}
          />
        )}
      </VStack>
    </Box>
  );
}

function NestedFallbackRow({
  label,
  children,
  alignTop,
}: {
  label: string;
  children: ReactNode;
  alignTop?: boolean;
}) {
  return (
    <HStack
      align={alignTop ? "start" : "center"}
      spacing={3}
      justify="space-between"
      w="full"
    >
      <Text
        fontSize="xs"
        color="fg.secondary"
        fontWeight="600"
        flexShrink={0}
        pt={alignTop ? "1px" : 0}
      >
        {label}
      </Text>
      <Box flex="1" minW={0} textAlign="right">
        {children}
      </Box>
    </HStack>
  );
}
