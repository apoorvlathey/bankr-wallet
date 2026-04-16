"use client";

import {
  Box,
  Button,
  ButtonProps,
  Code,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useState } from "react";

type Status = "idle" | "pending" | "ok" | "error";

type TestButtonProps = {
  label: string;
  description?: string;
  onRun: () => Promise<unknown>;
  variant?: ButtonProps["variant"];
  isDisabled?: boolean;
  /** Extra controls (e.g. an <Input />) rendered above the button. */
  children?: React.ReactNode;
};

function stringify(value: unknown): string {
  if (value === undefined) return "(no return value)";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(
      value,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
  } catch {
    return String(value);
  }
}

export function TestButton({
  label,
  description,
  onRun,
  variant = "secondary",
  isDisabled,
  children,
}: TestButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setStatus("pending");
    setResult(null);
    try {
      const value = await onRun();
      setResult(stringify(value));
      setStatus("ok");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : stringify(err);
      setResult(msg);
      setStatus("error");
    }
  }, [onRun]);

  return (
    <VStack
      align="stretch"
      spacing={2}
      p={3}
      bg="white"
      border="2px solid"
      borderColor="bauhaus.black"
    >
      <HStack justify="space-between" align="flex-start" spacing={3}>
        <Box flex={1}>
          <Text
            fontSize="sm"
            fontWeight="900"
            textTransform="uppercase"
            letterSpacing="wider"
            lineHeight="1.2"
          >
            {label}
          </Text>
          {description && (
            <Text fontSize="xs" color="gray.600" fontWeight="500" mt={0.5}>
              {description}
            </Text>
          )}
        </Box>
        <Button
          size="sm"
          variant={variant}
          onClick={handleClick}
          isLoading={status === "pending"}
          isDisabled={isDisabled}
          flexShrink={0}
          minW="92px"
        >
          Run
        </Button>
      </HStack>

      {children && <Box>{children}</Box>}

      {result !== null && (
        <Box
          bg={status === "error" ? "red.50" : "gray.50"}
          border="2px solid"
          borderColor={status === "error" ? "red.300" : "gray.300"}
          p={2}
          maxH="200px"
          overflowY="auto"
        >
          <Text
            fontSize="2xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wider"
            color={status === "error" ? "red.600" : "gray.500"}
            mb={1}
          >
            {status === "error" ? "Error" : "Result"}
          </Text>
          <Code
            display="block"
            whiteSpace="pre-wrap"
            wordBreak="break-all"
            bg="transparent"
            p={0}
            fontSize="xs"
            color={status === "error" ? "red.700" : "bauhaus.black"}
          >
            {result}
          </Code>
        </Box>
      )}
    </VStack>
  );
}
