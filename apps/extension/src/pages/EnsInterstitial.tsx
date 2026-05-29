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
  Image,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Decorator, ThemedPanel, useTheme } from "@/theme";

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
  const w3linkMatch = host.match(/^(0x[a-f0-9]{40})\.1\.w3link\.io$/i);
  if (w3linkMatch?.[1]) {
    return {
      ensName: `${w3linkMatch[1].toLowerCase()}.eth`,
      path: u.pathname || "/",
      search: u.search,
      hash: u.hash,
    };
  }
  const w3ethMatch = host.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.w3eth\.io$/i);
  if (w3ethMatch?.[1]) {
    return {
      ensName: `${w3ethMatch[1].toLowerCase()}.eth`,
      path: u.pathname || "/",
      search: u.search,
      hash: u.hash,
    };
  }
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

// Raw-address gateway URLs arrive here as `0x<addr>.eth` either because a DNR
// gateway rewrite tacks `.eth` on or because the manual dapp3 launcher
// normalized the target before opening this page. For display we want the bare
// address back — the `.eth` is plumbing, not part of the user-visible identity.
function displayName(ensName: string): string {
  const lower = ensName.toLowerCase();
  if (lower.endsWith(".eth") && /^0x[a-f0-9]{40}\.eth$/.test(lower)) {
    return lower.slice(0, -4);
  }
  return ensName;
}

export default function EnsInterstitial() {
  const { tokens, themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const target = useMemo(() => parseTarget(), []);
  const displayedName = useMemo(
    () => (target ? displayName(target.ensName) : ""),
    [target],
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setError("Couldn't parse the .eth URL from this navigation.");
      return;
    }
    document.title = `Resolving ${displayName(target.ensName)}…`;

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
          // Pin-onchain-HTML path: Kubo is up but its CORS allowlist hasn't been updated.
          // Bounce to the setup screen with a `return` param so the user can
          // come back to this navigation after fixing it.
          if (resp.code === "kubo-cors-blocked") {
            const setup = new URL(chrome.runtime.getURL("setup-kubo.html"));
            location.replace(setup.toString());
            return;
          }
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
      <Box position="relative" maxW="100%" w="fit-content">
        <Decorator corner="top-right" accent="highlight" />
        <ThemedPanel variant="raised" weight="medium" p={6}>
          <VStack align="stretch" spacing={5}>
            {/* Header — WalletChan logo + breadcrumb on one line */}
            <HStack spacing={3} align="center">
              <Box
                p={1.5}
                bg="surface.raised"
                border={tokens.borders.thin}
                borderColor="border.default"
                borderRadius={tokens.radii.card}
                flexShrink={0}
              >
                <Image
                  src="walletchan-animated.gif"
                  w="32px"
                  h="32px"
                  display="block"
                  borderRadius={isDarkTheme ? "md" : undefined}
                />
              </Box>
              <Text
                fontSize="xs"
                color="fg.muted"
                letterSpacing="0.08em"
                fontWeight={700}
              >
                WALLETCHAN · DAPP3 - ENS BROWSING
              </Text>
            </HStack>

            {error ? (
              <VStack
                align="start"
                spacing={2}
                bg="status.error.bg"
                color="status.error.fg"
                border={tokens.borders.thin}
                borderColor="status.error.border"
                borderRadius={tokens.radii.card}
                p={4}
              >
                <Text fontWeight={700} fontSize="sm">
                  Couldn't resolve {displayedName}
                </Text>
                <Text fontSize="xs" fontFamily="mono" wordBreak="break-all">
                  {error}
                </Text>
              </VStack>
            ) : (
              <VStack align="start" spacing={2}>
                <HStack spacing={2} color="fg.muted">
                  <Spinner size="xs" speed="0.6s" />
                  <Text
                    fontSize="xs"
                    fontWeight={700}
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                  >
                    Resolving
                  </Text>
                </HStack>
                <Text
                  fontFamily="mono"
                  fontWeight={800}
                  fontSize="2xl"
                  color="fg.primary"
                  lineHeight="1.1"
                  wordBreak="break-all"
                >
                  {displayedName}
                </Text>
              </VStack>
            )}

            <Box borderTop={tokens.borders.thin} borderColor="border.subtle" pt={3}>
              <Text fontSize="xs" color="fg.muted">
                Manage in{" "}
                <Text as="span" fontWeight={700} color="fg.secondary">
                  Settings → dapp3 - ENS Browsing
                </Text>
              </Text>
            </Box>
          </VStack>
        </ThemedPanel>
      </Box>
    </Center>
  );
}
