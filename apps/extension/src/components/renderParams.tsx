import { HStack, Text, Box } from "@chakra-ui/react";
import { isAddress } from "viem";
import type { Arg, DecodeBytesParamResult, DecodeTupleParamResult, DecodeArrayParamResult } from "@/lib/decoder/types";
import {
  AddressParam,
  UintParam,
  IntParam,
  BoolParam,
  StringParam,
  BytesParam,
  TupleParam,
  ArrayParam,
} from "@/components/decodedParams";

/**
 * Routes an Arg's value to the correct type-specific component.
 */
export function renderParamTypes(arg: Arg, chainId: number): JSX.Element {
  const { baseType, value, rawValue } = arg;

  // uint types
  if (baseType.startsWith("uint")) {
    return <UintParam value={String(value)} />;
  }

  // int types (signed)
  if (baseType.startsWith("int")) {
    return <IntParam value={String(value)} />;
  }

  // address
  if (baseType === "address") {
    return <AddressParam value={String(value)} chainId={chainId} />;
  }

  // bool
  if (baseType === "bool") {
    return <BoolParam value={String(value)} />;
  }

  // bytes (fixed or dynamic) — check if it's actually an address
  if (baseType.includes("bytes")) {
    const strVal = typeof value === "string" ? value : "";
    if (isAddress(strVal)) {
      return <AddressParam value={strVal} chainId={chainId} />;
    }
    return <BytesParam value={value as DecodeBytesParamResult | string} rawValue={rawValue} chainId={chainId} />;
  }

  // tuple
  if (baseType === "tuple") {
    return <TupleParam value={value as DecodeTupleParamResult} chainId={chainId} />;
  }

  // array
  if (baseType === "array") {
    return <ArrayParam value={value as DecodeArrayParamResult} type={arg.type} chainId={chainId} />;
  }

  // string / default
  return <StringParam value={String(value)} chainId={chainId} />;
}

/**
 * Renders a single parameter row with type label, name, and value.
 */
export function renderParams(index: number, arg: Arg, chainId: number): JSX.Element {
  const isArrayType = arg.baseType === "array";
  const arrayLength = isArrayType && Array.isArray(arg.value) ? (arg.value as any[]).length : null;

  return (
    <Box key={index} w="full" minW={0}>
      <HStack spacing={1} align="center" w="full" minW={0} flexWrap="wrap">
        {/* Param name */}
        <Text
          fontSize="10px"
          color="text.secondary"
          fontFamily="mono"
          fontWeight="700"
          minW={0}
          wordBreak="break-word"
        >
          {arg.name || `arg${index}`}
        </Text>

        {/* Param type */}
        <Text
          fontSize="10px"
          color="text.tertiary"
          fontFamily="mono"
          minW={0}
          wordBreak="break-word"
        >
          ({arg.type}
          {arrayLength !== null && ` [${arrayLength}]`})
        </Text>

        {/* Param value */}
        {renderParamTypes(arg, chainId)}
      </HStack>
    </Box>
  );
}
