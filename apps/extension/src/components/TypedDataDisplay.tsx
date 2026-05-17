import { useState, useEffect, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Code,
  IconButton,
  Spacer,
  Collapse,
} from "@chakra-ui/react";
import { CopyIcon, CheckIcon, ExternalLinkIcon, ChevronDownIcon } from "@chakra-ui/icons";

import { getChainConfig } from "@/constants/chainConfig";
import { ethShLabelsUrl } from "@/constants/externalUrls";
import { useStripTokens, useTheme } from "@/theme";

interface TypedDataDisplayProps {
  typedData: any;
  rawData: string;
  /**
   * When true, render only a thin collapsed header — used when a
   * clear-signing descriptor above already conveys the essential info.
   */
  defaultCollapsed?: boolean;
  /**
   * Chain the dapp is connected on (per-tab selected chain). Used as a
   * fallback for chain-scoped lookups (eth.sh labels, explorer links) when
   * `typedData.domain.chainId` is absent — EIP-712 makes domain.chainId
   * optional, but the wallet still knows which chain the dapp is on.
   */
  connectedChainId?: number;
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <IconButton
      aria-label="Copy"
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      size="xs"
      variant="ghost"
      color={copied ? "accent.highlight" : "text.secondary"}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
    />
  );
}

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function AddressValue({ address, chainId }: { address: string; chainId?: number }) {
  const [label, setLabel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const explorerUrl = (() => {
    // Drop the explorer link when chainId is unknown — defaulting to mainnet
    // would point at the wrong chain's explorer for a non-mainnet address.
    if (!chainId) return null;
    const config = getChainConfig(chainId);
    return config.explorer ? `${config.explorer}/address/${address}` : null;
  })();

  useEffect(() => {
    if (!address || !address.startsWith("0x")) return;
    // Skip the label fetch when chainId is unknown — eth.sh labels are
    // chain-scoped and defaulting to mainnet would mislabel addresses on
    // other chains (e.g. Permit2 typed-data signed on Base).
    if (!chainId) return;
    fetch(ethShLabelsUrl(address, chainId))
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => {
        if (Array.isArray(l) && l.length > 0) setLabel(l[0]);
      })
      .catch(() => {});
  }, [address, chainId]);

  return (
    <HStack spacing={0.5}>
      <Text fontSize="xs" fontFamily="mono" color="accent.secondary" fontWeight="600">
        {truncateAddr(address)}
      </Text>
      <IconButton
        aria-label="Copy address"
        icon={copied ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
        size="xs"
        variant="ghost"
        minW="18px"
        h="18px"
        color={copied ? "accent.highlight" : "text.tertiary"}
        onClick={async () => {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        _hover={{ color: "accent.secondary", bg: "bg.muted" }}
      />
      {explorerUrl && (
        <IconButton
          aria-label="View on explorer"
          icon={<ExternalLinkIcon boxSize="10px" />}
          size="xs"
          variant="ghost"
          minW="18px"
          h="18px"
          color="text.tertiary"
          onClick={() => window.open(explorerUrl, "_blank")}
          _hover={{ color: "accent.secondary", bg: "bg.muted" }}
        />
      )}
      {label && (
        <Text fontSize="10px" color="text.secondary" fontWeight="700">
          ({label})
        </Text>
      )}
    </HStack>
  );
}

function MessageField({
  name,
  value,
  depth = 0,
  chainId,
  numericColor,
}: {
  name: string;
  value: any;
  depth?: number;
  chainId?: number;
  numericColor: string;
}) {
  if (value === null || value === undefined) return null;

  // Address
  if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return (
      <HStack spacing={1} align="start" flexWrap="wrap" pl={depth * 3}>
        <Text fontSize="xs" color="text.secondary" fontWeight="700" minW="fit-content">
          {name}:
        </Text>
        <AddressValue address={value} chainId={chainId} />
      </HStack>
    );
  }

  // Number or bigint string
  if (typeof value === "number" || typeof value === "bigint" || (typeof value === "string" && /^\d+$/.test(value))) {
    return (
      <HStack spacing={1} align="start" flexWrap="wrap" pl={depth * 3}>
        <Text fontSize="xs" color="text.secondary" fontWeight="700" minW="fit-content">
          {name}:
        </Text>
        <Text fontSize="xs" fontFamily="mono" color={numericColor} fontWeight="600" wordBreak="break-all">
          {String(value)}
        </Text>
      </HStack>
    );
  }

  // Boolean
  if (typeof value === "boolean") {
    return (
      <HStack spacing={1} align="start" flexWrap="wrap" pl={depth * 3}>
        <Text fontSize="xs" color="text.secondary" fontWeight="700" minW="fit-content">
          {name}:
        </Text>
        <Text fontSize="xs" fontFamily="mono" color={value ? "chart.positive" : "chart.negative"} fontWeight="600">
          {String(value)}
        </Text>
      </HStack>
    );
  }

  // Nested object
  if (typeof value === "object" && !Array.isArray(value)) {
    return (
      <VStack align="start" spacing={1} pl={depth * 3}>
        <Text fontSize="xs" color="text.secondary" fontWeight="700">
          {name}:
        </Text>
        <VStack align="start" spacing={1} pl={3} borderLeft="2px solid" borderColor="border.default">
          {Object.entries(value).map(([k, v]) => (
            <MessageField key={k} name={k} value={v} depth={0} chainId={chainId} numericColor={numericColor} />
          ))}
        </VStack>
      </VStack>
    );
  }

  // Array
  if (Array.isArray(value)) {
    return (
      <VStack align="start" spacing={1} pl={depth * 3}>
        <Text fontSize="xs" color="text.secondary" fontWeight="700">
          {name}: [{value.length}]
        </Text>
        <VStack align="start" spacing={1} pl={3} borderLeft="2px solid" borderColor="border.default">
          {value.map((item, i) => (
            <MessageField key={i} name={`[${i}]`} value={item} depth={0} chainId={chainId} numericColor={numericColor} />
          ))}
        </VStack>
      </VStack>
    );
  }

  // String or other
  return (
    <HStack spacing={1} align="start" flexWrap="wrap" pl={depth * 3}>
      <Text fontSize="xs" color="text.secondary" fontWeight="700" minW="fit-content">
        {name}:
      </Text>
      <Text fontSize="xs" fontFamily="mono" color="text.primary" fontWeight="600" wordBreak="break-all">
        {String(value)}
      </Text>
    </HStack>
  );
}

const scrollStyles = {
  "&::-webkit-scrollbar": { width: "6px" },
  "&::-webkit-scrollbar-track": { background: "var(--chakra-colors-bg-muted)" },
  "&::-webkit-scrollbar-thumb": { background: "var(--chakra-colors-border-default)" },
};

function TypedDataDisplay({ typedData, rawData, defaultCollapsed = false, connectedChainId }: TypedDataDisplayProps) {
  const { tokens } = useTheme();
  // Same theme-aware tab strip pair as MessageDataDisplay / CalldataDecoder.
  const { bg: tabActiveBg, fg: tabActiveFg } = useStripTokens();
  // Numeric value emphasis — Bauhaus dark goldenrod, Midnight warm amber.
  // Sourced from chart.numeric so the contrast intent stays in the theme.
  const numericColor = "chart.numeric";
  const [tab, setTab] = useState<"structured" | "raw">("structured");
  const [typesOpen, setTypesOpen] = useState(false);
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const domain = typedData?.domain;
  const message = typedData?.message;
  const primaryType = typedData?.primaryType;
  const types = typedData?.types;
  // Prefer the chainId the dapp baked into the typed-data domain; if absent
  // (EIP-712 allows it), fall back to the chain the dapp is connected on so
  // chain-scoped lookups (eth.sh labels, explorer links) target the right
  // chain. We only use the fallback when domain.chainId is *missing*, never
  // when it disagrees — a mismatch is itself signal worth preserving.
  const chainId = domain?.chainId
    ? Number(domain.chainId)
    : connectedChainId;

  if (!expanded) {
    return (
      <Box
        bg="surface.raised"
        border={tokens.borders.thin}
        borderColor="border.default"
        borderRadius="lg"
        boxShadow="card"
        overflow="hidden"
        p={2}
        cursor="pointer"
        onClick={() => setExpanded(true)}
        _hover={{ bg: "surface.sunken" }}
      >
        <HStack>
          <Text fontSize="xs" color="fg.secondary" fontWeight="700" textTransform="uppercase">
            Show raw typed data
          </Text>
          <Spacer />
          <ChevronDownIcon color="fg.muted" />
        </HStack>
      </Box>
    );
  }

  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      overflow="hidden"
    >
      {/* Tab header */}
      <HStack p={0} borderBottom={tokens.borders.thin} borderColor="border.default" spacing={0}>
        <Box
          flex={1}
          py={2}
          px={3}
          cursor="pointer"
          bg={tab === "structured" ? tabActiveBg : "transparent"}
          onClick={() => setTab("structured")}
        >
          <Text
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wide"
            textAlign="center"
            color={tab === "structured" ? tabActiveFg : "text.secondary"}
          >
            Structured
          </Text>
        </Box>
        <Box w="2px" bg="border.default" alignSelf="stretch" />
        <Box
          flex={1}
          py={2}
          px={3}
          cursor="pointer"
          bg={tab === "raw" ? tabActiveBg : "transparent"}
          onClick={() => setTab("raw")}
        >
          <Text
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wide"
            textAlign="center"
            color={tab === "raw" ? tabActiveFg : "text.secondary"}
          >
            Raw
          </Text>
        </Box>
        <Spacer />
        <Box pr={1}>
          <CopyBtn value={rawData} />
        </Box>
        {/* Collapse-back affordance, matching CalldataDecoder. Only shown
            when the view was opened from a collapsed default (e.g. clear
            signing matched) so the user can return to that compact state. */}
        {defaultCollapsed && (
          <IconButton
            aria-label="Hide raw typed data"
            icon={<ChevronDownIcon />}
            size="xs"
            variant="ghost"
            mr={1}
            color="text.tertiary"
            onClick={() => setExpanded(false)}
            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
          />
        )}
      </HStack>

      {/* Content */}
      <Box p={3} maxH="250px" overflowY="auto" overflowX="hidden" css={scrollStyles}>
        {tab === "structured" ? (
          <VStack align="start" spacing={3}>
            {/* Domain section */}
            {domain && (
              <VStack align="start" spacing={1} w="full">
                <Code
                  px={2}
                  py={0.5}
                  fontSize="10px"
                  bg="accent.primary"
                  color="accentFg.primary"
                  fontWeight="800"
                  border={tokens.borders.thin}
                  borderColor="border.default"
                  borderRadius="md"
                  textTransform="uppercase"
                >
                  Domain
                </Code>
                <VStack align="start" spacing={0.5} pl={1}>
                  {domain.name && (
                    <HStack spacing={1}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700">name:</Text>
                      <Text fontSize="xs" color="text.primary" fontWeight="600">{domain.name}</Text>
                    </HStack>
                  )}
                  {domain.version && (
                    <HStack spacing={1}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700">version:</Text>
                      <Text fontSize="xs" color="text.primary" fontWeight="600">{domain.version}</Text>
                    </HStack>
                  )}
                  {domain.chainId && (
                    <HStack spacing={1}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700">chainId:</Text>
                      <Text fontSize="xs" fontFamily="mono" color={numericColor} fontWeight="600">
                        {String(domain.chainId)}
                      </Text>
                    </HStack>
                  )}
                  {domain.verifyingContract && (
                    <HStack spacing={1} flexWrap="wrap">
                      <Text fontSize="xs" color="text.secondary" fontWeight="700">contract:</Text>
                      <AddressValue address={domain.verifyingContract} chainId={chainId} />
                    </HStack>
                  )}
                </VStack>
              </VStack>
            )}

            {/* Primary Type */}
            {primaryType && (
              <Code
                px={2}
                py={1}
                fontSize="xs"
                bg="accent.secondary"
                color="accentFg.secondary"
                fontFamily="mono"
                border={tokens.borders.thin}
                borderColor="border.default"
                borderRadius="md"
                fontWeight="700"
              >
                {primaryType}
              </Code>
            )}

            {/* Message fields */}
            {message && (
              <VStack align="start" spacing={1.5} w="full">
                {Object.entries(message).map(([key, val]) => (
                  <MessageField key={key} name={key} value={val} chainId={chainId} numericColor={numericColor} />
                ))}
              </VStack>
            )}

            {/* Types section (collapsible) */}
            {types && Object.keys(types).length > 0 && (
              <Box w="full">
                <HStack
                  spacing={1}
                  cursor="pointer"
                  onClick={() => setTypesOpen(!typesOpen)}
                  _hover={{ opacity: 0.8 }}
                >
                  <Code
                    px={2}
                    py={0.5}
                    fontSize="10px"
                    bg="accent.highlight"
                    color="accentFg.highlight"
                    fontWeight="800"
                    border={tokens.borders.thin}
                    borderColor="border.default"
                    borderRadius="md"
                    textTransform="uppercase"
                  >
                    Types
                  </Code>
                  <ChevronDownIcon
                    boxSize="14px"
                    color="text.secondary"
                    transform={typesOpen ? "rotate(180deg)" : "rotate(0deg)"}
                    transition="transform 0.2s ease-out"
                  />
                  <Text fontSize="10px" color="text.tertiary" fontWeight="600">
                    {Object.keys(types).length} type{Object.keys(types).length !== 1 ? "s" : ""}
                  </Text>
                </HStack>
                <Collapse in={typesOpen} animateOpacity>
                  <VStack align="start" spacing={1.5} mt={2} pl={1}>
                    {Object.entries(types).map(([typeName, typeFields]) => (
                      <VStack key={typeName} align="start" spacing={0.5} w="full">
                        <Text fontSize="xs" color="text.primary" fontWeight="700">
                          {typeName}
                        </Text>
                        <VStack align="start" spacing={0} pl={3} borderLeft="2px solid" borderColor="border.default">
                          {Array.isArray(typeFields) && typeFields.map((field: any, i: number) => (
                            <HStack key={i} spacing={1}>
                              <Text fontSize="10px" fontFamily="mono" color="accent.secondary" fontWeight="600">
                                {field.type}
                              </Text>
                              <Text fontSize="10px" fontFamily="mono" color="text.secondary" fontWeight="600">
                                {field.name}
                              </Text>
                            </HStack>
                          ))}
                        </VStack>
                      </VStack>
                    ))}
                  </VStack>
                </Collapse>
              </Box>
            )}
          </VStack>
        ) : (
          /* Raw tab */
          <Box
            p={3}
            bg="bg.muted"
            border={tokens.borders.thin}
            borderColor="border.default"
            borderRadius="md"
            maxH="200px"
            overflowY="auto"
            css={scrollStyles}
          >
            <Text fontSize="xs" fontFamily="mono" color="text.primary" wordBreak="break-all" whiteSpace="pre-wrap">
              {rawData}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default memo(TypedDataDisplay);
