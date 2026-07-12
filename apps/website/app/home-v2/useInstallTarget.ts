"use client";

import { useEffect, useState } from "react";
import { CHROME_STORE_URL, FIREFOX_STORE_URL } from "../constants";

type BrowserFamily = "chromium" | "firefox";
type BrowserId = "arc" | "brave" | "chrome" | "edge" | "firefox" | "opera" | "vivaldi" | "zen";

type UserAgentBrand = {
  brand: string;
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    brands?: UserAgentBrand[];
  };
  brave?: {
    isBrave?: () => boolean | Promise<boolean>;
  };
};

const installTargets = {
  arc: {
    browser: "arc",
    family: "chromium",
    label: "Add to Arc",
    navLabel: "Install",
    href: CHROME_STORE_URL,
    iconSrc: "/images/browsers/arc.svg",
    iconAlt: "Arc",
  },
  brave: {
    browser: "brave",
    family: "chromium",
    label: "Add to Brave",
    navLabel: "Install",
    href: CHROME_STORE_URL,
    iconSrc: "/images/browsers/brave.svg",
    iconAlt: "Brave",
  },
  chrome: {
    browser: "chrome",
    family: "chromium",
    label: "Add to Chrome",
    navLabel: "Install",
    href: CHROME_STORE_URL,
    iconSrc: "/images/browsers/chrome.svg",
    iconAlt: "Chrome",
  },
  edge: {
    browser: "edge",
    family: "chromium",
    label: "Add to Edge",
    navLabel: "Install",
    href: CHROME_STORE_URL,
    iconSrc: "/images/browsers/edge.svg",
    iconAlt: "Edge",
  },
  firefox: {
    browser: "firefox",
    family: "firefox",
    label: "Add to Firefox",
    navLabel: "Install",
    href: FIREFOX_STORE_URL,
    iconSrc: "/images/browsers/firefox.svg",
    iconAlt: "Firefox",
  },
  opera: {
    browser: "opera",
    family: "chromium",
    label: "Add to Opera",
    navLabel: "Install",
    href: CHROME_STORE_URL,
    iconSrc: "/images/browsers/opera.svg",
    iconAlt: "Opera",
  },
  vivaldi: {
    browser: "vivaldi",
    family: "chromium",
    label: "Add to Vivaldi",
    navLabel: "Install",
    href: CHROME_STORE_URL,
    iconSrc: "/images/browsers/vivaldi.svg",
    iconAlt: "Vivaldi",
  },
  zen: {
    browser: "zen",
    family: "firefox",
    label: "Add to Zen",
    navLabel: "Install",
    href: FIREFOX_STORE_URL,
    iconSrc: "/images/browsers/zen.svg",
    iconAlt: "Zen",
  },
} as const satisfies Record<
  BrowserId,
  {
    browser: BrowserId;
    family: BrowserFamily;
    label: string;
    navLabel: string;
    href: string;
    iconSrc: string;
    iconAlt: string;
  }
>;

type InstallTarget = (typeof installTargets)[BrowserId];

function getBrowserSignals() {
  if (typeof navigator === "undefined") {
    return "";
  }

  const brands = (navigator as NavigatorWithUserAgentData).userAgentData?.brands ?? [];
  const brandList = brands.map((brand) => brand.brand).join(" ");

  return [navigator.userAgent, navigator.vendor, brandList].filter(Boolean).join(" ").toLowerCase();
}

function detectBrowserFromSignals(signals: string): BrowserId | null {
  if (!signals) {
    return null;
  }

  if (/\bzen\b|zenbrowser|zen browser/.test(signals)) {
    return "zen";
  }

  if (/\bedg(e|ios|a)?\//.test(signals) || signals.includes("microsoft edge")) {
    return "edge";
  }

  if (/\bopr\/|\bopt\/|opera/.test(signals)) {
    return "opera";
  }

  if (/vivaldi/.test(signals)) {
    return "vivaldi";
  }

  if (/\barc\b|arcsearch|arc browser/.test(signals)) {
    return "arc";
  }

  if (/firefox|fxios/.test(signals)) {
    return "firefox";
  }

  if (/chromium|chrome|crios/.test(signals)) {
    return "chrome";
  }

  return null;
}

async function isBraveBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const isBrave = (navigator as NavigatorWithUserAgentData).brave?.isBrave;
  if (!isBrave) {
    return false;
  }

  try {
    return Boolean(await isBrave());
  } catch {
    return false;
  }
}

async function detectInstallTarget(): Promise<InstallTarget> {
  const signals = getBrowserSignals();

  if (await isBraveBrowser()) {
    return installTargets.brave;
  }

  const detected = detectBrowserFromSignals(signals);
  if (detected) {
    return installTargets[detected];
  }

  return /gecko\/\d/i.test(signals) && !signals.includes("like gecko") ? installTargets.firefox : installTargets.chrome;
}

export function useInstallTarget() {
  const [target, setTarget] = useState<InstallTarget>(installTargets.chrome);

  useEffect(() => {
    let mounted = true;

    detectInstallTarget().then((detectedTarget) => {
      if (mounted) {
        setTarget(detectedTarget);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return target;
}
