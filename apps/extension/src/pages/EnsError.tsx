/**
 * EnsError — themed error page surfaced when an ENS navigation can't be
 * resolved (no contenthash, RPC failure, unsupported codec, etc.). Always
 * reached via `chrome.tabs.update` from the SW; we never throw the user
 * into Chrome's DNS-error UI.
 *
 * Query parameters:
 *   - name   : the ENS name we tried to resolve
 *   - error  : human-readable failure reason
 *   - path / search / hash : the original navigation path so the fallback
 *     "Try on eth.limo" link preserves it.
 */

import { useMemo } from "react";
import {
  Box,
  Button,
  Center,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { Decorator, IconBox, ThemedPanel, useTheme } from "@/theme";

function parseParams() {
  const p = new URLSearchParams(location.search);
  return {
    ensName: p.get("name") ?? "",
    error: p.get("error") ?? "Unknown error",
    path: p.get("path") ?? "/",
    search: p.get("search") ?? "",
    hash: p.get("hash") ?? "",
  };
}

// Raw-address w3eth.io URLs arrive here as `0x<addr>.eth` because the
// W3ETH_REGEX rewrite adds `.eth` so the existing routing catches them. For
// display we strip it back to the bare address.
function displayName(name: string): string {
  const lower = name.toLowerCase();
  if (/^0x[a-f0-9]{40}\.eth$/.test(lower)) return lower.slice(0, -4);
  return name;
}

type Fallback = { url: string; label: string; gateway: "eth.limo" | "w3eth.io" };

function hostedFallback(
  name: string,
  path: string,
  search: string,
  hash: string,
): Fallback | null {
  const lower = name.toLowerCase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (/^0x[a-f0-9]{40}\.eth$/.test(lower)) {
    const addr = lower.slice(0, -4);
    return {
      url: `https://${addr}.w3eth.io${normalizedPath}${search}${hash}`,
      label: "Try on w3eth.io",
      gateway: "w3eth.io",
    };
  }
  if (!/^(?:[a-z0-9-]+\.)+eth$/.test(lower)) return null;
  const trimmed = lower.slice(0, -4);
  return {
    url: `https://${trimmed}.eth.limo${normalizedPath}${search}${hash}`,
    label: "Try on eth.limo",
    gateway: "eth.limo",
  };
}

export default function EnsError() {
  const { tokens } = useTheme();
  const params = useMemo(() => parseParams(), []);
  const fallback = useMemo(
    () => hostedFallback(params.ensName, params.path, params.search, params.hash),
    [params],
  );
  const displayedName = useMemo(() => displayName(params.ensName), [params]);

  return (
    <Center minH="100vh" p={6}>
      <Box position="relative" w="100%" maxW="520px">
        <Decorator corner="top-left" accent="highlight" />
        <ThemedPanel variant="raised" weight="medium" p={8}>
          <VStack align="start" spacing={5}>
            <HStack spacing={3}>
              <IconBox
                bg="status.error.bg"
                color="status.error.fg"
                borderColor="status.error.border"
              >
                <WarningTwoIcon boxSize={4} />
              </IconBox>
              <VStack align="start" spacing={0}>
                <Text fontSize="xs" color="fg.muted" letterSpacing="0.08em">
                  WALLETCHAN · DAPP3 · ENS BROWSING
                </Text>
                <Text fontWeight={700} fontSize="md">
                  Couldn't resolve {displayedName || "this name"}
                </Text>
              </VStack>
            </HStack>

            <Box
              w="100%"
              bg="surface.sunken"
              border={tokens.borders.thin}
              borderColor="border.default"
              borderRadius={tokens.radii.card}
              p={4}
            >
              <Text fontSize="sm" fontFamily="mono" color="fg.primary">
                {params.error}
              </Text>
            </Box>

            <VStack align="start" spacing={2} w="100%">
              <Text fontSize="sm" color="fg.muted">
                You can try the hosted gateway directly, or open WalletChan to
                pick a different mainnet RPC.
              </Text>
              {fallback && (
                <Button
                  variant="solid"
                  size="md"
                  rightIcon={<ExternalLinkIcon />}
                  onClick={() => {
                    // Route through the SW so it can install the per-tab
                    // ALLOW bypass first — both gateways are intercepted by
                    // our DNR rules in the relevant configurations and a
                    // direct `location.assign` would just bounce back here.
                    chrome.runtime
                      .sendMessage({
                        type: "ens-open-on-gateway",
                        url: fallback.url,
                      })
                      .then((resp) => {
                        if (!resp?.ok) location.assign(fallback.url);
                      })
                      .catch(() => location.assign(fallback.url));
                  }}
                >
                  {fallback.label}
                </Button>
              )}
            </VStack>
          </VStack>
        </ThemedPanel>
      </Box>
    </Center>
  );
}
