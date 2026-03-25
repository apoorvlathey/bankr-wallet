"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Box, Text } from "@chakra-ui/react";
import { Desktop } from "./os/Desktop";
import { IframeApp } from "./components/IframeApp";
import { MenuBar } from "./os/MenuBar";
import { DAPPS } from "./data/dapps";
import type { DappEntry } from "./data/dapps";
import {
  DESKTOP_BG,
  WIN95_FONT,
} from "./os/win95styles";

/** Mobile fallback: OS-styled icon grid + fullscreen IframeApp */
function MobileAppsView() {
  const searchParams = useSearchParams();
  const router = useRouter();

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
      router.replace(`/os?${params.toString()}`, { scroll: false });
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
          {DAPPS.slice(0, 24).map((dapp) => (
            <Box
              key={dapp.id}
              as="button"
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap={1}
              onClick={() => {
                router.push(`/os?url=${encodeURIComponent(dapp.url)}`);
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

export default function AppsPage() {
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
        <MobileAppsView />
      </Box>
    </>
  );
}
