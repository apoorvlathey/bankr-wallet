import { Box, Code, HStack, Text, VStack } from "@chakra-ui/react";
import { memo, useEffect, useState } from "react";

import { CopyButton } from "@/components/CopyButton";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { getEthShLabels } from "@/lib/ethShLabelsCache";

interface TypedDataDisplayProps {
  typedData: Record<string, unknown>;
  rawData: string;
  connectedChainId?: number;
  explorer?: string;
  mode?: "message" | "technical";
}

const scrollStyles = {
  "&::-webkit-scrollbar": { width: "6px" },
  "&::-webkit-scrollbar-track": { background: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    background: "var(--chakra-colors-border-default)",
    borderRadius: "3px",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function AddressValue({
  address,
  chainId,
  explorer,
}: {
  address: string;
  chainId?: number;
  explorer?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!chainId) return;
    let cancelled = false;
    getEthShLabels(address, chainId).then((labels) => {
      if (!cancelled) setLabel(labels[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return (
    <LabeledAddressPopover
      address={address}
      contextLabel="typed-data address"
      explorer={explorer}
      label={label ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
      maxW="190px"
    />
  );
}

function MessageField({
  name,
  value,
  chainId,
  explorer,
  depth = 0,
}: {
  name: string;
  value: unknown;
  chainId?: number;
  explorer?: string;
  depth?: number;
}) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/u.test(value)) {
    return (
      <HStack
        w="full"
        minW={0}
        align="center"
        justify="space-between"
        spacing={3}
        pl={depth * 3}
      >
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          {name}
        </Text>
        <AddressValue address={value} chainId={chainId} explorer={explorer} />
      </HStack>
    );
  }

  if (Array.isArray(value)) {
    return (
      <VStack w="full" align="stretch" spacing={1.5} pl={depth * 3}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          {name} · {value.length} item{value.length === 1 ? "" : "s"}
        </Text>
        <VStack
          align="stretch"
          spacing={1.5}
          pl={3}
          borderLeftWidth="1px"
          borderColor="border.subtle"
        >
          {value.map((item, index) => (
            <MessageField
              key={`${name}-${index}`}
              name={`#${index + 1}`}
              value={item}
              chainId={chainId}
              explorer={explorer}
            />
          ))}
        </VStack>
      </VStack>
    );
  }

  if (isRecord(value)) {
    return (
      <VStack w="full" align="stretch" spacing={1.5} pl={depth * 3}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          {name}
        </Text>
        <VStack
          align="stretch"
          spacing={1.5}
          pl={3}
          borderLeftWidth="1px"
          borderColor="border.subtle"
        >
          {Object.entries(value).map(([nestedName, nestedValue]) => (
            <MessageField
              key={nestedName}
              name={nestedName}
              value={nestedValue}
              chainId={chainId}
              explorer={explorer}
            />
          ))}
        </VStack>
      </VStack>
    );
  }

  const isNumeric =
    typeof value === "number" ||
    typeof value === "bigint" ||
    (typeof value === "string" && /^\d+$/u.test(value));

  return (
    <HStack
      w="full"
      minW={0}
      align="flex-start"
      justify="space-between"
      spacing={3}
      pl={depth * 3}
    >
      <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
        {name}
      </Text>
      <Text
        minW={0}
        color={
          typeof value === "boolean"
            ? value
              ? "chart.positive"
              : "chart.negative"
            : isNumeric
              ? "chart.numeric"
              : "fg.primary"
        }
        fontFamily={isNumeric ? "mono" : "body"}
        fontSize="xs"
        fontWeight="600"
        lineHeight="1.45"
        overflowWrap="anywhere"
        textAlign="right"
      >
        {String(value)}
      </Text>
    </HStack>
  );
}

function TechnicalBlock({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  let serialized: string;
  try {
    serialized =
      typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
  } catch {
    serialized = String(value ?? "");
  }

  return (
    <VStack align="stretch" spacing={2}>
      <HStack justify="space-between" spacing={3}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          {label}
        </Text>
        <CopyButton value={serialized} />
      </HStack>
      <Box
        maxH="220px"
        overflowY="auto"
        p={3}
        bg="surface.sunken"
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
          {serialized || "Not provided"}
        </Text>
      </Box>
    </VStack>
  );
}

function TypedDataDisplay({
  typedData,
  rawData,
  connectedChainId,
  explorer,
  mode = "message",
}: TypedDataDisplayProps) {
  const domain = isRecord(typedData.domain) ? typedData.domain : undefined;
  const message = isRecord(typedData.message) ? typedData.message : undefined;
  const types = isRecord(typedData.types) ? typedData.types : undefined;
  const primaryType =
    typeof typedData.primaryType === "string" ? typedData.primaryType : null;
  const domainChainId = domain?.chainId;
  const parsedDomainChainId = Number(domainChainId);
  const chainId =
    domainChainId !== undefined && Number.isSafeInteger(parsedDomainChainId)
      ? parsedDomainChainId
      : connectedChainId;

  if (mode === "technical") {
    return (
      <VStack align="stretch" spacing={4}>
        <TechnicalBlock label="Domain" value={domain} />
        <TechnicalBlock label="Types" value={types} />
        <TechnicalBlock label="Raw typed data" value={rawData} />
      </VStack>
    );
  }

  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="lg"
      overflow="hidden"
    >
      {primaryType && (
        <HStack
          minH="40px"
          px={3}
          justify="space-between"
          borderBottomWidth="1px"
          borderColor="border.subtle"
        >
          <Text color="fg.secondary" fontSize="xs" fontWeight="600">
            Primary type
          </Text>
          <Code color="fg.primary" bg="transparent" fontSize="xs">
            {primaryType}
          </Code>
        </HStack>
      )}
      <VStack align="stretch" spacing={2.5} p={3}>
        {message && Object.keys(message).length > 0 ? (
          Object.entries(message).map(([name, value]) => (
            <MessageField
              key={name}
              name={name}
              value={value}
              chainId={chainId}
              explorer={explorer}
            />
          ))
        ) : (
          <Text color="fg.secondary" fontSize="sm">
            No structured message fields were provided.
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default memo(TypedDataDisplay);
