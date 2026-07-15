import { WarningTwoIcon } from "@chakra-ui/icons";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";

import { CopyButton } from "@/components/CopyButton";

interface SignatureMessageDataProps {
  message: string;
  messageReadable: boolean;
  rawPayload: string;
}

interface RawSignatureDataProps {
  message?: string;
  rawPayload: string;
  rawData: string;
  includeRawPayload?: boolean;
}

const scrollStyles = {
  "&::-webkit-scrollbar": { width: "6px" },
  "&::-webkit-scrollbar-track": { background: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    background: "var(--chakra-colors-border-default)",
    borderRadius: "3px",
  },
};

function DataBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <VStack align="stretch" spacing={2}>
      <HStack justify="space-between" spacing={3}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          {label}
        </Text>
        <CopyButton value={value} />
      </HStack>
      <Box
        maxH="220px"
        overflowY="auto"
        p={3}
        bg="surface.raised"
        borderWidth="1px"
        borderColor="border.subtle"
        borderRadius="md"
        css={scrollStyles}
      >
        <Text
          color="fg.primary"
          fontFamily="mono"
          fontSize="xs"
          lineHeight="1.55"
          overflowWrap="anywhere"
          whiteSpace="pre-wrap"
        >
          {value || "No data provided"}
        </Text>
      </Box>
    </VStack>
  );
}

/** Human-readable personal message, kept ahead of raw request data. */
export function SignatureMessageData({
  message,
  messageReadable,
  rawPayload,
}: SignatureMessageDataProps) {
  if (!messageReadable) {
    return (
      <VStack align="stretch" spacing={3}>
        <HStack
          align="flex-start"
          spacing={2}
          px={3}
          py={2.5}
          bg="status.warning.tint"
          borderWidth="1px"
          borderColor="status.warning.border"
          borderRadius="md"
        >
          <WarningTwoIcon
            mt={0.5}
            color="status.warning.emphasis"
            boxSize="14px"
            flexShrink={0}
          />
          <Text color="fg.primary" fontSize="xs" lineHeight="1.45">
            This message is raw data. Only sign if you trust the requesting
            site.
          </Text>
        </HStack>
        <DataBlock label="Raw payload" value={rawPayload} />
      </VStack>
    );
  }

  return (
    <Box
      p={3}
      bg="surface.raised"
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="lg"
    >
      <Text
        color="fg.primary"
        fontSize="sm"
        lineHeight="1.55"
        overflowWrap="anywhere"
        whiteSpace="pre-wrap"
      >
        {message || "Empty message"}
      </Text>
    </Box>
  );
}

/** Exact payloads shown only inside the shared Advanced details disclosure. */
export function RawSignatureData({
  message,
  rawPayload,
  rawData,
  includeRawPayload = true,
}: RawSignatureDataProps) {
  return (
    <VStack align="stretch" spacing={4}>
      {message && message !== rawPayload && (
        <DataBlock label="Decoded message" value={message} />
      )}
      {includeRawPayload && (
        <DataBlock label="Raw payload" value={rawPayload} />
      )}
      <DataBlock label="Request parameters" value={rawData} />
    </VStack>
  );
}
