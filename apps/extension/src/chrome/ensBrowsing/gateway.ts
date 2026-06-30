// URL builders for ENS-resolved navigations.
//
// Two flavors:
//   - `buildHostedGatewayUrl()` — hosted-gateway path. Returns the canonical
//     hosted gateway URL for the kind: <name>.eth.limo or
//     <name>.gwei.domains for ipfs/ipns, <name>.w3eth.io for web3 (ERC-4804).
//   - `buildSubdomainUrl()` — local-gateway path. Returns the local Kubo
//     subdomain gateway URL (<cid>.ipfs.<host>:<port>). Defaults to
//     localhost:8080 but the caller can pass a user-configured host/port.
//
// Ported from dapp3 `src/lib/gateway.ts`; the hosted-gateway builder is new.

import type { ResolveKind } from "./types";
import {
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
} from "./settingsStorage";

const ETH_LIMO_HOST = "eth.limo";
const GWEI_DOMAINS_HOST = "domains";
const W3ETH_IO_HOST = "w3eth.io";

export type GatewayLocation = { host: string; port: number };

export const DEFAULT_GATEWAY_LOCATION: GatewayLocation = {
  host: DEFAULT_GATEWAY_HOST,
  port: DEFAULT_GATEWAY_PORT,
};

export function buildSubdomainUrl(
  kind: ResolveKind,
  value: string,
  path = "/",
  search = "",
  hash = "",
  gateway: GatewayLocation = DEFAULT_GATEWAY_LOCATION,
): string {
  // ERC-4804 (web3) content is pinned to local Kubo and served at the same
  // <cid>.ipfs.<host> subdomain as a normal IPFS contenthash — `value` here
  // is already the resulting IPFS CID. Map web3 to ipfs for URL shape.
  const subdomain = kind === "web3" ? "ipfs" : kind;
  const label = subdomain === "ipns" ? encodeIpnsLabel(value) : value;
  const base = `http://${label}.${subdomain}.${gateway.host}:${gateway.port}`;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}${search}${hash}`;
}

// Route through the user's choice of hosted gateway. eth.limo for
// IPFS/IPNS-served ENS sites, gwei.domains for GNS sites, and w3eth.io for
// ERC-4804 onchain HTML dapps. The name remains visible in the address bar.
export function buildHostedGatewayUrl(
  kind: ResolveKind,
  ensName: string,
  path = "/",
  search = "",
  hash = "",
): string {
  const lower = ensName.toLowerCase();
  if (kind !== "web3" && lower.endsWith(".gwei")) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `https://${lower}.${GWEI_DOMAINS_HOST}${normalizedPath}${search}${hash}`;
  }

  // ENS subdomains like `app.uniswap.eth` are passed through verbatim — both
  // eth.limo and w3eth.io route on the full label chain in front of `.eth`.
  const trimmed = lower.endsWith(".eth") ? lower.slice(0, -4) : lower;
  const host =
    kind === "web3" ? `${trimmed}.${W3ETH_IO_HOST}` : `${trimmed}.${ETH_LIMO_HOST}`;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${host}${normalizedPath}${search}${hash}`;
}

export function encodeIpnsLabel(label: string): string {
  // DNS-safe transform — Kubo's subdomain gateway expects `.` → `-`, `-` → `--`.
  return label.replace(/-/g, "--").replace(/\./g, "-");
}

export function isGatewayHost(
  host: string,
  gatewayHost: string = DEFAULT_GATEWAY_HOST,
): boolean {
  const escaped = gatewayHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.(ipfs|ipns)\\.${escaped}(:\\d+)?$`, "i").test(host);
}

export function parseGatewayHost(
  host: string,
  gatewayHost: string = DEFAULT_GATEWAY_HOST,
): { kind: "ipfs" | "ipns"; label: string } | null {
  const escaped = gatewayHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = host.match(
    new RegExp(`^(.+)\\.(ipfs|ipns)\\.${escaped}(?::\\d+)?$`, "i"),
  );
  if (!m || !m[1] || !m[2]) return null;
  return { kind: m[2] as "ipfs" | "ipns", label: m[1] };
}
