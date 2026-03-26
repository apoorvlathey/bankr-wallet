"use client";

import { useState } from "react";
import { Box, VStack, HStack, Text, Input, Link } from "@chakra-ui/react";
import { ExternalLink } from "lucide-react";
import type { WidgetComponentProps } from "../widgetRegistry";
import { ACCENT_BLUE } from "../win95styles";

const RESOLUTIONS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "12h", value: "12h" },
  { label: "1d", value: "1d" },
];

const CHART_TYPES = [
  { label: "Price", value: "price" },
  { label: "Market Cap", value: "market_cap" },
];

const URL_REGEX = /geckoterminal\.com\/([^/]+)\/pools\/([^/?\s]+)/;

interface GeckoConfig {
  chain: string;
  pool: string;
  resolution: string;
  chartType: string;
  rawUrl: string;
}

function parseGeckoUrl(url: string): { chain: string; pool: string } | null {
  const match = url.match(URL_REGEX);
  if (!match) return null;
  return { chain: match[1], pool: match[2] };
}

export function GeckoChartWidget({ config, onSaveConfig }: WidgetComponentProps) {
  const existing = config as GeckoConfig | null;
  const [url, setUrl] = useState(existing?.rawUrl ?? "");
  const [resolution, setResolution] = useState(existing?.resolution ?? "1d");
  const [chartType, setChartType] = useState(existing?.chartType ?? "price");
  const [error, setError] = useState("");

  // ── Config form (dark themed to match desktop) ──
  if (!config) {
    const handleSubmit = () => {
      const parsed = parseGeckoUrl(url.trim());
      if (!parsed) {
        setError("Invalid GeckoTerminal URL. Paste a pool page URL.");
        return;
      }
      setError("");
      onSaveConfig({
        chain: parsed.chain,
        pool: parsed.pool,
        resolution,
        chartType,
        rawUrl: url.trim(),
      });
    };

    return (
      <Box h="100%" display="flex" alignItems="center" justifyContent="center" p={5}>
        <VStack spacing={4} w="100%" maxW="320px">
          <Text fontSize="14px" fontWeight="bold" color="white">
            📈 Configure Chart
          </Text>

          {/* URL input */}
          <VStack spacing={1} w="100%" align="start">
            <HStack spacing="6px" align="center">
              <Text fontSize="11px" fontWeight="bold" color="rgba(255,255,255,0.6)">
                Pool URL
              </Text>
              <Link
                href="https://www.geckoterminal.com"
                isExternal
                display="flex"
                alignItems="center"
                gap="3px"
                fontSize="10px"
                color="rgba(255,255,255,0.35)"
                _hover={{ color: ACCENT_BLUE }}
              >
                geckoterminal.com
                <ExternalLink size={9} />
              </Link>
            </HStack>
            <Input
              placeholder="https://www.geckoterminal.com/base/pools/0x..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              bg="rgba(255,255,255,0.06)"
              color="white"
              fontSize="11px"
              borderRadius="6px"
              h="34px"
              border="1px solid rgba(255,255,255,0.12)"
              _placeholder={{ color: "rgba(255,255,255,0.25)" }}
              _focus={{ borderColor: ACCENT_BLUE, boxShadow: `0 0 0 1px ${ACCENT_BLUE}` }}
            />
            {error && (
              <Text fontSize="10px" color="#FF5F57">
                {error}
              </Text>
            )}
          </VStack>

          {/* Resolution selector — horizontal pills */}
          <VStack spacing={1.5} w="100%" align="start">
            <Text fontSize="11px" fontWeight="bold" color="rgba(255,255,255,0.6)">
              Candle Size
            </Text>
            <HStack spacing="6px" flexWrap="wrap">
              {RESOLUTIONS.map((r) => {
                const isActive = resolution === r.value;
                return (
                  <Box
                    key={r.value}
                    as="button"
                    px="10px"
                    py="4px"
                    fontSize="11px"
                    fontWeight={isActive ? "bold" : "normal"}
                    color={isActive ? "white" : "rgba(255,255,255,0.5)"}
                    bg={isActive ? ACCENT_BLUE : "rgba(255,255,255,0.06)"}
                    border="1px solid"
                    borderColor={isActive ? ACCENT_BLUE : "rgba(255,255,255,0.1)"}
                    borderRadius="6px"
                    _hover={{
                      bg: isActive ? ACCENT_BLUE : "rgba(255,255,255,0.1)",
                      color: "white",
                    }}
                    onClick={() => setResolution(r.value)}
                  >
                    {r.label}
                  </Box>
                );
              })}
            </HStack>
          </VStack>

          {/* Chart type selector */}
          <VStack spacing={1.5} w="100%" align="start">
            <Text fontSize="11px" fontWeight="bold" color="rgba(255,255,255,0.6)">
              Chart Type
            </Text>
            <HStack spacing="6px">
              {CHART_TYPES.map((ct) => {
                const isActive = chartType === ct.value;
                return (
                  <Box
                    key={ct.value}
                    as="button"
                    px="10px"
                    py="4px"
                    fontSize="11px"
                    fontWeight={isActive ? "bold" : "normal"}
                    color={isActive ? "white" : "rgba(255,255,255,0.5)"}
                    bg={isActive ? ACCENT_BLUE : "rgba(255,255,255,0.06)"}
                    border="1px solid"
                    borderColor={isActive ? ACCENT_BLUE : "rgba(255,255,255,0.1)"}
                    borderRadius="6px"
                    _hover={{
                      bg: isActive ? ACCENT_BLUE : "rgba(255,255,255,0.1)",
                      color: "white",
                    }}
                    onClick={() => setChartType(ct.value)}
                  >
                    {ct.label}
                  </Box>
                );
              })}
            </HStack>
          </VStack>

          {/* Apply */}
          <Box
            as="button"
            w="100%"
            py="8px"
            fontSize="12px"
            fontWeight="bold"
            bg={ACCENT_BLUE}
            color="white"
            borderRadius="6px"
            border="none"
            _hover={{ bg: "#1350E0" }}
            _active={{ bg: "#0D38A0" }}
            onClick={handleSubmit}
          >
            Apply
          </Box>
        </VStack>
      </Box>
    );
  }

  // ── Active: render chart iframe ──
  const { chain, pool, resolution: savedResolution, chartType: savedChartType } = config as unknown as GeckoConfig;
  const embedUrl = `https://www.geckoterminal.com/${chain}/pools/${pool}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0&chart_type=${savedChartType || "price"}&resolution=${savedResolution}`;

  return (
    <Box w="100%" h="100%" borderRadius="8px" overflow="hidden">
      <iframe
        src={embedUrl}
        title="GeckoTerminal Chart"
        width="100%"
        height="100%"
        style={{ border: "none", marginBottom: "-32px", height: "calc(100% + 32px)" }}
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </Box>
  );
}
