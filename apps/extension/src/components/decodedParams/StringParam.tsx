import { useState, useEffect } from "react";
import { Box, HStack, Text, Image, Textarea, Button, VStack, Code } from "@chakra-ui/react";
import { CopyButton } from "@/components/CopyButton";
import { isValidJSON, decodeBase64 } from "@/lib/convertUtils";
import { isAddress } from "viem";
import { AddressParam } from "./AddressParam";
import { IPFS_GATEWAY } from "@/constants/externalUrls";

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
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [fetchedImage, setFetchedImage] = useState<string | null>(null);

  const str = String(value);
  const isJSON = isValidJSON(str);
  const base64Result = !isJSON ? decodeBase64(str) : null;
  const isSVG = base64Result?.isSVG || str.trimStart().startsWith("<svg");
  const isURL = /^https?:\/\//.test(str) || str.startsWith("ipfs://");
  const isAddressValue = isAddress(str);

  // For URLs, try to fetch content
  useEffect(() => {
    if (!isURL || disableRich) return;
    const url = str.startsWith("ipfs://")
      ? str.replace("ipfs://", IPFS_GATEWAY)
      : str;

    fetch(url, { signal: AbortSignal.timeout(5000) })
      .then(async (r) => {
        const contentType = r.headers.get("content-type") || "";
        if (contentType.includes("image")) {
          setFetchedImage(url);
        } else if (contentType.includes("json") || contentType.includes("text")) {
          const text = await r.text();
          setFetchedContent(text);
        }
      })
      .catch(() => {});
  }, [str, isURL, disableRich]);

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
  if (isJSON || base64Result?.isJSON || (fetchedContent && isValidJSON(fetchedContent))) {
    tabs.push({ key: "raw", label: "Raw JSON" });
  }
  if (fetchedImage || (base64Result?.isSVG)) {
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
    : fetchedContent && isValidJSON(fetchedContent)
    ? fetchedContent
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
            <Button
              key={t.key}
              size="xs"
              h="20px"
              px={2}
              fontSize="9px"
              fontWeight="800"
              textTransform="uppercase"
              letterSpacing="wide"
              bg={activeTab === t.key ? "fg.primary" : "transparent"}
              color={activeTab === t.key ? "fg.inverse" : "text.tertiary"}
              border="1.5px solid"
              borderColor="border.default"
              borderRadius={0}
              borderRight={t.key !== tabs[tabs.length - 1].key ? "none" : undefined}
              onClick={() => setActiveTab(t.key)}
              _hover={{ bg: "fg.primary", color: "fg.inverse" }}
              _active={{ transform: "translate(1px, 1px)" }}
            >
              {t.label}
            </Button>
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
            // SVG preview tile is intentionally a literal white "physical
            // surface" — same rationale as the QR code tile in QRCodeModal.
            <Box border="2px solid" borderColor="border.default" p={2} bg="white" maxW="200px">
              <Image
                src={`data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`}
                maxH="120px"
                objectFit="contain"
              />
            </Box>
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
          {fetchedImage ? (
            <Image src={fetchedImage} maxH="120px" objectFit="contain" />
          ) : svgContent ? (
            <Image
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`}
              maxH="120px"
              objectFit="contain"
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
        color="text.tertiary"
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
