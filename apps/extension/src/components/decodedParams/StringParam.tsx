import { useState } from "react";
import { Box, HStack, Text, Textarea, VStack, Code } from "@chakra-ui/react";
import { CopyButton } from "@/components/CopyButton";
import SafeImage from "@/components/SafeImage";
import { isValidJSON, decodeBase64 } from "@/lib/convertUtils";
import { isAddress } from "viem";
import { AddressParam } from "./AddressParam";
import { IPFS_GATEWAY } from "@/constants/externalUrls";
import { ParamTabButton } from "./ParamTabButton";

interface StringParamProps {
  value: string;
  chainId: number;
  disableRich?: boolean;
}

type TabKey = "rich" | "raw" | "image" | "rawSvg";

export function StringParam({ value, chainId, disableRich }: StringParamProps) {
  // See UintParam for the rationale behind chart.numeric.
  const numericColor = "chart.numeric";
  const [activeTab, setActiveTab] = useState<TabKey>("rich");

  const str = String(value);
  const isJSON = isValidJSON(str);
  const base64Result = !isJSON ? decodeBase64(str) : null;
  const isSVG = base64Result?.isSVG || str.trimStart().startsWith("<svg");
  const isURL = /^https?:\/\//.test(str) || str.startsWith("ipfs://");
  const isAddressValue = isAddress(str);

  const remoteImageUrl = isURL
    ? str.startsWith("ipfs://")
      ? str.replace("ipfs://", IPFS_GATEWAY)
      : str
    : null;

  // Simple string — no rich features
  if (disableRich || (!isJSON && !base64Result && !isSVG && !isURL && !isAddressValue && str.length <= 200)) {
    return (
      <HStack spacing={1} align="center">
        <Code
          fontSize="xs"
          fontFamily="mono"
          bg="transparent"
          color="text.primary"
          fontWeight="600"
          p={0}
          wordBreak="break-all"
        >
          &quot;{str.length > 60 ? `${str.slice(0, 60)}...` : str}&quot;
        </Code>
        <CopyButton value={str} />
      </HStack>
    );
  }

  // Address detected in string
  if (isAddressValue) {
    return <AddressParam value={str} chainId={chainId} />;
  }

  // Determine available tabs
  const tabs: { key: TabKey; label: string }[] = [{ key: "rich", label: "Rich" }];
  if (isJSON || base64Result?.isJSON) {
    tabs.push({ key: "raw", label: "Raw JSON" });
  }
  if (remoteImageUrl) {
    tabs.push({ key: "image", label: "Image" });
  }
  if (isSVG) {
    tabs.push({ key: "rawSvg", label: "Raw SVG" });
  }

  // Parsed content for rich display
  const jsonContent = isJSON
    ? str
    : base64Result?.isJSON
    ? base64Result.decoded
    : null;

  const svgContent = isSVG
    ? str
    : base64Result?.isSVG
    ? base64Result.decoded
    : null;

  return (
    <VStack align="start" spacing={1.5} w="full">
      {/* Tab bar */}
      {tabs.length > 1 && (
        <HStack spacing={0}>
          {tabs.map((t) => (
            <ParamTabButton
              key={t.key}
              label={t.label}
              isActive={activeTab === t.key}
              isLast={t.key === tabs[tabs.length - 1].key}
              onClick={() => setActiveTab(t.key)}
            />
          ))}
        </HStack>
      )}

      {/* Rich view */}
      {activeTab === "rich" && (
        <Box w="full">
          {jsonContent ? (
            <RichJsonTable json={jsonContent} chainId={chainId} numericColor={numericColor} />
          ) : base64Result && !base64Result.isJSON && !base64Result.isSVG ? (
            <Box>
              <Text fontSize="9px" color="text.tertiary" fontWeight="700" textTransform="uppercase" mb={1}>
                Base64 Decoded
              </Text>
              <ScrollableText value={base64Result.decoded} />
            </Box>
          ) : svgContent ? (
            <ScrollableText value={svgContent} />
          ) : isURL ? (
            <HStack spacing={1}>
              <Code fontSize="xs" fontFamily="mono" bg="transparent" color="accent.secondary" fontWeight="600" p={0}>
                {str.length > 60 ? `${str.slice(0, 60)}...` : str}
              </Code>
              <CopyButton value={str} />
            </HStack>
          ) : (
            <ScrollableText value={str} />
          )}
        </Box>
      )}

      {/* Raw JSON view */}
      {activeTab === "raw" && jsonContent && (
        <Box w="full">
          <HStack justify="flex-end" mb={1}>
            <CopyButton value={JSON.stringify(JSON.parse(jsonContent), null, 2)} />
          </HStack>
          <Box
            as="pre"
            p={2}
            bg="bg.muted"
            border="2px solid"
            borderColor="border.default"
            fontSize="10px"
            fontFamily="mono"
            maxH="120px"
            overflowY="auto"
            whiteSpace="pre-wrap"
            wordBreak="break-all"
            css={{
              "&::-webkit-scrollbar": { width: "4px" },
              "&::-webkit-scrollbar-thumb": { background: "var(--chakra-colors-border-default)" },
            }}
          >
            {JSON.stringify(JSON.parse(jsonContent), null, 2)}
          </Box>
        </Box>
      )}

      {/* Image view — literal white tile is intentional (physical surface) */}
      {activeTab === "image" && (
        <Box border="2px solid" borderColor="border.default" p={2} bg="white" maxW="200px">
          {remoteImageUrl ? (
            <SafeImage
              src={remoteImageUrl}
              maxH="120px"
              objectFit="contain"
              alt="Decoded parameter preview"
              fallback={
                <Text fontSize="xs" color="text.tertiary">
                  No safe raster preview
                </Text>
              }
            />
          ) : null}
        </Box>
      )}

      {/* Raw SVG view */}
      {activeTab === "rawSvg" && svgContent && (
        <Box w="full">
          <HStack justify="flex-end" mb={1}>
            <CopyButton value={svgContent} />
          </HStack>
          <Box
            as="pre"
            p={2}
            bg="bg.muted"
            border="2px solid"
            borderColor="border.default"
            fontSize="10px"
            fontFamily="mono"
            maxH="120px"
            overflowY="auto"
            whiteSpace="pre-wrap"
            wordBreak="break-all"
            css={{
              "&::-webkit-scrollbar": { width: "4px" },
              "&::-webkit-scrollbar-thumb": { background: "var(--chakra-colors-border-default)" },
            }}
          >
            {svgContent}
          </Box>
        </Box>
      )}
    </VStack>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ScrollableText({ value }: { value: string }) {
  if (value.length <= 200) {
    return (
      <HStack spacing={1} align="center">
        <Code
          fontSize="xs"
          fontFamily="mono"
          bg="transparent"
          color="text.primary"
          fontWeight="600"
          p={0}
          wordBreak="break-all"
        >
          &quot;{value}&quot;
        </Code>
        <CopyButton value={value} />
      </HStack>
    );
  }

  return (
    <Box w="full">
      <HStack justify="flex-end" mb={1}>
        <CopyButton value={value} />
      </HStack>
      <Textarea
        value={value}
        readOnly
        fontSize="10px"
        fontFamily="mono"
        fontWeight="600"
        border="2px solid"
        borderColor="border.default"
        borderRadius={0}
        maxH="80px"
        resize="none"
        bg="bg.muted"
        _focus={{ borderColor: "border.focus" }}
      />
    </Box>
  );
}

function RichJsonTable({
  json,
  chainId,
  numericColor,
}: {
  json: string;
  chainId: number;
  numericColor: string;
}) {
  try {
    const parsed = JSON.parse(json);

    if (typeof parsed !== "object" || parsed === null) {
      return <ScrollableText value={json} />;
    }

    const entries = Array.isArray(parsed)
      ? parsed.map((v, i) => [String(i), v] as const)
      : Object.entries(parsed);

    return (
      <VStack align="start" spacing={1} w="full">
        {entries.map(([key, val]) => (
          <HStack key={key} spacing={1.5} align="start" w="full" flexWrap="wrap">
            <Text
              fontSize="10px"
              fontFamily="mono"
              fontWeight="700"
              color="text.secondary"
              minW="fit-content"
            >
              {key}:
            </Text>
            <RichJsonValue value={val} chainId={chainId} numericColor={numericColor} />
          </HStack>
        ))}
      </VStack>
    );
  } catch {
    return <ScrollableText value={json} />;
  }
}

function RichJsonValue({
  value,
  chainId,
  numericColor,
}: {
  value: any;
  chainId: number;
  numericColor: string;
}) {
  if (typeof value === "string" && isAddress(value)) {
    return <AddressParam value={value} chainId={chainId} />;
  }

  if (typeof value === "object" && value !== null) {
    return (
      <Code
        fontSize="xs"
        fontFamily="mono"
        bg="transparent"
        color="text.primary"
        fontWeight="600"
        p={0}
        wordBreak="break-all"
      >
        {JSON.stringify(value).length > 80
          ? `${JSON.stringify(value).slice(0, 80)}...`
          : JSON.stringify(value)}
      </Code>
    );
  }

  return (
    <Code
      fontSize="xs"
      fontFamily="mono"
      bg="transparent"
      color={typeof value === "number" ? numericColor : "text.primary"}
      fontWeight="600"
      p={0}
    >
      {String(value)}
    </Code>
  );
}
