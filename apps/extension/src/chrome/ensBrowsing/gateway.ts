// URL builders for ENS-resolved navigations.
//
// Two flavors:
//   - `buildHostedGatewayUrl()` — Tier 1 path. Returns the canonical hosted
//     gateway URL for the kind: <name>.eth.limo for ipfs/ipns,
//     <name>.w3eth.io for web3 (ERC-4804).
//   - `buildSubdomainUrl()` — Tier 2a/2b path. Returns the local Kubo
//     subdomain gateway URL (<cid>.ipfs.localhost:8080).
//
// Ported from dapp3 `src/lib/gateway.ts`; the hosted-gateway builder is new.

import type { ResolveKind } from "./types";

const KUBO_GATEWAY_HOST = "localhost";
const KUBO_GATEWAY_PORT = 8080;

const ETH_LIMO_HOST = "eth.limo";
const W3ETH_IO_HOST = "w3eth.io";

export function buildSubdomainUrl(
  kind: ResolveKind,
  value: string,
  path = "/",
  search = "",
  hash = "",
): string {
  // ERC-4804 (web3) content is pinned to local Kubo and served at the same
  // <cid>.ipfs.localhost subdomain as a normal IPFS contenthash — `value`
  // here is already the resulting IPFS CID. Map web3 to ipfs for URL shape.
  const subdomain = kind === "web3" ? "ipfs" : kind;
  const label = subdomain === "ipns" ? encodeIpnsLabel(value) : value;
  const base = `http://${label}.${subdomain}.${KUBO_GATEWAY_HOST}:${KUBO_GATEWAY_PORT}`;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}${search}${hash}`;
}

// Tier 1: route through the user's choice of hosted gateway. eth.limo for
// IPFS/IPNS-served ENS sites; w3eth.io for ERC-4804 onchain HTML dapps. Both
// gateways follow the `<name>.<gateway>` naming convention so the ENS name
// remains visible in the address bar.
export function buildHostedGatewayUrl(
  kind: ResolveKind,
  ensName: string,
  path = "/",
  search = "",
  hash = "",
): string {
  const lower = ensName.toLowerCase();
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

export function isGatewayHost(host: string): boolean {
  return /\.(ipfs|ipns)\.localhost(:\d+)?$/i.test(host);
}

export function parseGatewayHost(
  host: string,
): { kind: "ipfs" | "ipns"; label: string } | null {
  const m = host.match(/^(.+)\.(ipfs|ipns)\.localhost(?::\d+)?$/i);
  if (!m || !m[1] || !m[2]) return null;
  return { kind: m[2] as "ipfs" | "ipns", label: m[1] };
}
