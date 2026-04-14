"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Box, Text } from "@chakra-ui/react";
import { useSiteNav } from "../lib/useSiteNav";
import { Desktop } from "./os/Desktop";
import { IframeApp } from "./components/IframeApp";
import { MenuBar } from "./os/MenuBar";
import { DAPPS } from "./data/dapps";
import type { DappEntry } from "./data/dapps";
import { SearchBar } from "./os/SearchBar";
import {
  DESKTOP_BG,
  WIN95_FONT,
} from "./os/win95styles";

/** Mobile fallback: OS-styled icon grid + fullscreen IframeApp */
function MobileAppsView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getRouteBasePath } = useSiteNav();
  const osBasePath = getRouteBasePath("/os");

  const [activeDapp, setActiveDapp] = useState<DappEntry | null>(() => {
    const urlParam = searchParams.get("url");
    if (!urlParam) return null;
    return (
      DAPPS.find((d) => d.url === urlParam) ||
      DAPPS.filter((d) => urlParam.startsWith(d.url)).sort(
        (a, b) => b.url.length - a.url.length
      )[0] ||
      null
    );
  });

  const [initialChainId] = useState<number | undefined>(() => {
    const chainParam = searchParams.get("chainId");
    return chainParam ? Number(chainParam) : undefined;
  });

  const updateChainInUrl = useCallback(
    (appUrl: string, chainId: number) => {
      const params = new URLSearchParams();
      params.set("url", appUrl);
      params.set("chainId", String(chainId));
      router.replace(`${osBasePath}?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  const handleBack = useCallback(() => {
    document.title = "WalletChan - The Wallet for AI Era";
    router.replace("/os", { scroll: false });
    setActiveDapp(null);
  }, [router]);

  if (activeDapp) {
    return (
      <IframeApp
        appUrl={activeDapp.url}
        appName={activeDapp.name}
        appIconUrl={activeDapp.iconUrl}
        supportedChains={activeDapp.chains}
        autoConnect={activeDapp.autoConnect}
        disabled={activeDapp.disabled}
        initialChainId={initialChainId}
        onChainChange={(chainId) => updateChainInUrl(activeDapp.url, chainId)}
        onBack={handleBack}
      />
    );
  }

  return (
    <Box minH="100vh" bg={DESKTOP_BG} display="flex" flexDirection="column">
      <MenuBar />
      <Box
        bg="#F0C020"
        px={3}
        py={1.5}
        textAlign="center"
        fontFamily={WIN95_FONT}
        fontSize="10px"
        fontWeight="700"
        color="#000"
        letterSpacing="0.02em"
      >
        For the full OS experience, visit on a desktop
      </Box>
      <Box px={4} pt={4}>
        <SearchBar
          onOpenUrl={(url, name) => {
            // Find matching dapp or open as custom URL
            const match = DAPPS.find((d) => url.startsWith(d.url));
            if (match) {
              router.push(`${osBasePath}?url=${encodeURIComponent(match.url)}`);
              setActiveDapp(match);
            } else {
              router.push(`${osBasePath}?url=${encodeURIComponent(url)}`);
              setActiveDapp({
                id: -1,
                name: name || url,
                description: "",
                url,
                iconUrl: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`,
                chains: [1, 8453, 137, 42161],
              });
            }
          }}
        />
      </Box>
      <Box
        flex={1}
        overflowY="auto"
        px={4}
        py={5}
      >
        <Box
          display="grid"
          gridTemplateColumns="repeat(4, 1fr)"
          gap={4}
          justifyItems="center"
        >
          {DAPPS.map((dapp) => (
            <Box
              key={dapp.id}
              as="button"
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap={1}
              onClick={() => {
                router.push(`${osBasePath}?url=${encodeURIComponent(dapp.url)}`);
                setActiveDapp(dapp);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dapp.iconUrl}
                alt={dapp.name}
                width={48}
                height={48}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "12px",
                }}
              />
              <Text
                fontFamily={WIN95_FONT}
                fontSize="10px"
                fontWeight="600"
                textAlign="center"
                noOfLines={2}
                lineHeight="1.2"
                color="white"
              >
                {dapp.name}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export default function OsContent() {
  return (
    <>
      {/* Desktop view — hidden on mobile via CSS (no flash) */}
      <Box
        h="100vh"
        display={{ base: "none", md: "flex" }}
        flexDirection="column"
      >
        {/* Preload character image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/walletchan-icon-nobg.png"
          alt=""
          style={{ display: "none" }}
        />
        <Desktop />
      </Box>

      {/* Mobile view — hidden on desktop via CSS (no flash) */}
      <Box display={{ base: "block", md: "none" }}>
        {
          // @ts-ignore React 19 types conflict on Vercel
          <Suspense>
            <MobileAppsView />
          </Suspense>
        }
      </Box>
    </>
  );
}
