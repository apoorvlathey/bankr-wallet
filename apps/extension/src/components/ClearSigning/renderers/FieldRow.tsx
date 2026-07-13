import { Box, HStack, Text, VStack } from "@chakra-ui/react";

import type {
  RenderedField,
  RenderedValue,
} from "@/lib/clearSigning/applyFormat";

import type { ClearSigningViewComponent } from "../types";
import { NestedCalldataField } from "./NestedCalldata";
import { RenderedValueView } from "./RenderedValueView";

interface FieldRowProps {
  field: RenderedField;
  chainId: number;
  /** Current ClearSigningView nesting depth, threaded down for calldata fields. */
  depth: number;
  /** Stable recursive entry passed down to avoid a module import cycle. */
  ClearSigningComponent: ClearSigningViewComponent;
}

export function FieldRow({
  field,
  chainId,
  depth,
  ClearSigningComponent,
}: FieldRowProps) {
  // Embedded calldata values can't share the label-left / value-right row —
  // each one is a substantial nested card. When this field's values are
  // calldata, render them as a full-width stack with a numbered header per
  // inner call (Safe BatchExecutor-style "1 / 3 — Transaction").
  const calldataValues = field.values.filter(
    (v): v is Extract<RenderedValue, { kind: "calldata" }> =>
      v.kind === "calldata",
  );
  if (
    calldataValues.length > 0 &&
    calldataValues.length === field.values.length
  ) {
    return (
      <NestedCalldataField
        label={field.label}
        values={calldataValues}
        chainId={chainId}
        depth={depth}
        ClearSigningComponent={ClearSigningComponent}
      />
    );
  }

  // Grouped fields (e.g. Permit2 `details.[]` iteration) — each item gets a
  // numbered pill chip + a full-width rule so batched permits read as distinct
  // sections without a nested card-in-card. Single-group case skips the header.
  if (field.groups && field.groups.length > 0) {
    const total = field.groups.length;
    const itemLabel = field.label || "Item";
    return (
      <VStack align="stretch" spacing={3.5}>
        {field.groups.map((group, gi) => (
          <Box key={gi}>
            {total > 1 && (
              <HStack mb={2.5} spacing={2} align="center">
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
                    {gi + 1}
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
                  {itemLabel}
                </Text>
                <Box flex={1} h="1px" bg="border.default" />
              </HStack>
            )}
            <VStack align="stretch" spacing={2}>
              {group.map((sub, si) => (
                <FieldRow
                  key={`${sub.label}-${si}`}
                  field={sub}
                  chainId={chainId}
                  depth={depth}
                  ClearSigningComponent={ClearSigningComponent}
                />
              ))}
            </VStack>
          </Box>
        ))}
      </VStack>
    );
  }

  // Always render label-left / value-right. Addresses display as a short
  // 0x….0x form plus copy + explorer icons — narrow enough to live on the
  // right; long ENS labels wrap inside the value column without breaking
  // the layout because `minW={0}` lets the flex column shrink.
  return (
    <HStack align="start" spacing={3} justify="space-between" w="full">
      <Text
        fontSize="xs"
        color="fg.secondary"
        fontWeight="600"
        flexShrink={0}
        pt="1px"
      >
        {field.label || "—"}
      </Text>
      <Box flex="1" minW={0} textAlign="right">
        {field.values.length === 0 ? (
          <Text fontSize="xs" color="fg.muted">
            —
          </Text>
        ) : (
          <VStack align="end" spacing={0.5}>
            {field.values.map((value, index) => (
              <RenderedValueView
                key={index}
                value={value}
                chainId={chainId}
              />
            ))}
          </VStack>
        )}
      </Box>
    </HStack>
  );
}
