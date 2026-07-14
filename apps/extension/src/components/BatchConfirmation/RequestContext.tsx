import type { ReactNode } from "react";
import { Box, HStack, Spinner, Text, Tooltip, VStack } from "@chakra-ui/react";
import type { ConfirmationState } from "./types";

interface RequestContextProps {
  callList: ReactNode;
  actionSummary?: string | null;
  state: ConfirmationState;
  error: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  customConfirm: boolean;
  warnings: ReactNode;
  smartAccountSetup: ReactNode;
}

/** Human-readable batch details without duplicating origin, chain, or signer. */
export function RequestContext({
  callList,
  actionSummary,
  state,
  error,
  accountType,
  customConfirm,
  warnings,
  smartAccountSetup,
}: RequestContextProps) {
  return (
    <VStack spacing={3} align="stretch">
      {actionSummary && (
        <HStack
          role="group"
          spacing={2}
          minW={0}
          px={1}
        >
          <Text
            color="text.secondary"
            fontSize="xs"
            fontWeight="600"
            lineHeight="short"
            whiteSpace="nowrap"
          >
            Batch overview
          </Text>
          <Box flex="1" minW={3} h="1px" bg="border.default" aria-hidden="true" />
          <Tooltip
            label={actionSummary}
            placement="top-end"
            openDelay={250}
            hasArrow
          >
            <Text
              color="fg.primary"
              fontSize="sm"
              fontWeight="700"
              lineHeight="short"
              maxW="68%"
              minW={0}
              textAlign="right"
              isTruncated
              tabIndex={0}
            >
              {actionSummary.split(" + ").map((action, index) => (
                <Box as="span" key={`${action}-${index}`}>
                  {index > 0 && (
                    <Box as="span" color="accent.highlight" px={1.5} aria-hidden="true">
                      +
                    </Box>
                  )}
                  {action}
                </Box>
              ))}
            </Text>
          </Tooltip>
        </HStack>
      )}

      {warnings}

      {callList}

      {smartAccountSetup}

      {error && state === "error" && (
        <Box
          bg="status.error.bg"
          border="1px solid"
          borderColor="status.error.border"
          borderRadius="lg"
          p={3}
        >
          <Text color="status.error.fg" fontSize="sm" fontWeight="700">
            {error}
          </Text>
        </Box>
      )}

      {state === "submitting" && (
        <HStack
          justify="center"
          py={3}
          bg="status.info.bg"
          border="1px solid"
          borderColor="status.info.border"
          borderRadius="lg"
        >
          <Spinner size="sm" color="status.info.fg" />
          <Text color="status.info.fg" fontSize="sm" fontWeight="700">
            Submitting batch…
          </Text>
        </HStack>
      )}

      {accountType === "impersonator" && !customConfirm && (
        <Box
          bg="accent.highlight"
          border="1px solid"
          borderColor="border.default"
          borderRadius="lg"
          p={3}
        >
          <Text color="accentFg.highlight" fontSize="sm" fontWeight="700">
            Connected via an impersonated account. Signing is disabled.
          </Text>
        </Box>
      )}
    </VStack>
  );
}
