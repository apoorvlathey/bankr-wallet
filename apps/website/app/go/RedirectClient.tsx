"use client";

import { useEffect } from "react";
import { FALLBACK_HOST, PRIMARY_HOST } from "../lib/siteRouting";

function cleanPath(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function buildPath(prefix: string, path: string): string {
  if (!prefix || prefix === "/") return path;
  if (path === "/") return prefix;
  return `${prefix}${path}`;
}

function getVisibleSuffix(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.search}${window.location.hash}`;
}

function probeWalletChan(): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timeout = window.setTimeout(() => resolve(false), 1800);

    img.onload = () => {
      window.clearTimeout(timeout);
      resolve(true);
    };
    img.onerror = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    img.src = `https://${PRIMARY_HOST}/images/walletchan-icon.png?probe=${Date.now()}`;
  });
}

export default function RedirectClient({
  prefix,
  path,
}: {
  prefix?: string | string[];
  path?: string | string[];
}) {
  useEffect(() => {
    let cancelled = false;

    async function redirect() {
      const targetPath = buildPath(cleanPath(prefix), cleanPath(path));
      const suffix = getVisibleSuffix();
      const canReachPrimary = await probeWalletChan();
      if (cancelled) return;

      const host = canReachPrimary ? PRIMARY_HOST : FALLBACK_HOST;
      window.location.replace(`https://${host}${targetPath}${suffix}`);
    }

    redirect();

    return () => {
      cancelled = true;
    };
  }, [path, prefix]);

  return null;
}
