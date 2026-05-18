/**
 * EnsInterstitial — the brief themed page the user sees while WalletChan
 * resolves a `.eth` navigation.
 *
 * Flow:
 *   1. DNR rule redirects `*.eth` → `interstitial.html#<original-url>`.
 *   2. We parse the original URL out of `location.hash`.
 *   3. Ask SW for a cache hit (`ens-cache-check`) — if found, immediately
 *      redirect via `location.replace` and let the SW kick off background
 *      revalidation.
 *   4. Otherwise ask SW to resolve fresh (`ens-resolve`). SW navigates the
 *      tab itself via `chrome.tabs.update`; we just wait. If SW returns an
 *      error code we render the inline error state (no separate navigation
 *      so the user keeps the address-bar context).
 *
 * Adapted from dapp3 `src/interstitial/interstitial.ts`; the Helios polling,
 * bookmarks/menu UI, and "bypass Helios" affordance are intentionally
 * stripped — they re-land when Helios ships.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Center,
  HStack,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Decorator, IconBox, ThemedPanel, useTheme } from "@/theme";

type ParsedTarget = {
  ensName: string;
  path: string;
  search: string;
  hash: string;
};

function parseTarget(): ParsedTarget | null {
  // DNR's regexSubstitution writes the original URL into our fragment via
  // `#\\0`. Fragments tolerate `:`, `/`, `?`, additional `#` etc., so the
  // whole URL survives verbatim with no decoding required.
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/\.$/, "").toLowerCase();
  if (!/^(?:[a-z0-9-]+\.)+eth$/.test(host)) return null;
  return {
    ensName: host,
    path: u.pathname || "/",
    search: u.search,
    hash: u.hash,
  };
}

type ResolveResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export default function EnsInterstitial() {
  const { tokens } = useTheme();
  const target = useMemo(() => parseTarget(), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setError("Couldn't parse the .eth URL from this navigation.");
      return;
    }
    document.title = `Resolving ${target.ensName}…`;

    let cancelled = false;
    const run = async () => {
      // Cache check first — synchronous redirect on hit.
      try {
        const cacheResp = await chrome.runtime.sendMessage({
          type: "ens-cache-check",
          name: target.ensName,
          path: target.path,
          search: target.search,
          hash: target.hash,
        });
        if (cancelled) return;
        if (cacheResp?.cached && typeof cacheResp.gatewayUrl === "string") {
          location.replace(cacheResp.gatewayUrl);
          return;
        }
      } catch {
        // Fall through to fresh resolve.
      }

      // Fresh resolve — SW will navigate the tab itself on success.
      try {
        const resp = (await chrome.runtime.sendMessage({
          type: "ens-resolve",
          name: target.ensName,
          path: target.path,
          search: target.search,
          hash: target.hash,
        })) as ResolveResult | undefined;
        if (cancelled) return;
        if (resp && !resp.ok) {
          setError(resp.error || "Resolution failed.");
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || "Couldn't reach the background worker.");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target) {
    return (
      <Center minH="100vh" p={6}>
        <ThemedPanel variant="raised" weight="medium" maxW="420px" w="100%">
          <VStack align="start" spacing={3}>
            <Text fontWeight={700} fontSize="lg">
              Couldn't parse this URL
            </Text>
            <Text color="fg.muted" fontSize="sm">
              The ENS browsing interstitial expects a fragment containing the
              original navigation URL. Try typing the `.eth` name again.
            </Text>
          </VStack>
        </ThemedPanel>
      </Center>
    );
  }

  return (
    <Center minH="100vh" p={6}>
      <Box position="relative" w="100%" maxW="480px">
        <Decorator corner="top-left" accent="primary" />
        <Decorator corner="top-right" accent="secondary" />
        <ThemedPanel variant="raised" weight="medium" p={8}>
          <VStack align="start" spacing={5}>
            <HStack spacing={3}>
              <IconBox bg="accent.primary" color="accentFg.primary">
                <Text fontSize="lg" fontWeight={900}>
                  .eth
                </Text>
              </IconBox>
              <VStack align="start" spacing={0}>
                <Text fontSize="xs" color="fg.muted" letterSpacing="0.08em">
                  WALLETCHAN · ENS BROWSING
                </Text>
                <Text fontWeight={700} fontSize="md">
                  Resolving {target.ensName}
                </Text>
              </VStack>
            </HStack>

            {error ? (
              <VStack
                align="start"
                spacing={3}
                w="100%"
                bg="status.error.bg"
                color="status.error.fg"
                border={tokens.borders.thin}
                borderColor="status.error.border"
                borderRadius={tokens.radii.card}
                p={4}
              >
                <Text fontWeight={700}>Couldn't resolve {target.ensName}</Text>
                <Text fontSize="sm" fontFamily="mono">
                  {error}
                </Text>
              </VStack>
            ) : (
              <HStack spacing={3} color="fg.muted">
                <Spinner size="sm" speed="0.6s" />
                <Text fontSize="sm">
                  Looking up the ENS contenthash via your mainnet RPC…
                </Text>
              </HStack>
            )}

            <Text fontSize="xs" color="fg.muted">
              You can disable this anytime in WalletChan → Settings → ENS
              Browsing.
            </Text>
          </VStack>
        </ThemedPanel>
      </Box>
    </Center>
  );
}
