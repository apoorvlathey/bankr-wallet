// ERC-4804 / ERC-5219 fallback probe.
//
// Ported from dapp3 `src/lib/web3url.ts`. Two callers:
//   - Tier 1 routing (`resolver.ts`) — uses `probeOnly: true` to confirm the
//     contract implements ERC-4804 (so we can route to w3eth.io) without
//     paying the cost of the full `request()` call.
//   - Tier 2b serving (future fetchPinAndCacheErc4804) — uses the default
//     mode to fetch the full HTML body for pinning to local Kubo.
//
// v1 scope: manual / 5219 mode only, index route only, HTML responses only.
// Auto mode + path routing + non-HTML are deferred.

import { parseAbi, type PublicClient } from "viem";

export type Web3FetchResult = {
  status: number;
  body: Uint8Array;
  contentType: string | null;
};

export type Web3FetchErrorKind =
  | { kind: "not-a-contract" }
  | { kind: "unsupported-mode"; mode: string }
  | { kind: "call-reverted"; cause: string }
  | { kind: "bad-status"; status: number }
  | { kind: "body-too-large"; size: number };

export class Web3FetchError extends Error {
  constructor(public detail: Web3FetchErrorKind) {
    super(describeWeb3Error(detail));
  }
}

export function describeWeb3Error(d: Web3FetchErrorKind): string {
  switch (d.kind) {
    case "not-a-contract":
      return "Resolved address is not a contract (no code).";
    case "unsupported-mode":
      return d.mode
        ? `Unsupported resolveMode "${d.mode}" (only manual / 5219 supported).`
        : "Contract did not implement resolveMode() (auto mode is not supported).";
    case "call-reverted":
      return `Contract is not ERC-4804 compatible: request() reverted (${d.cause}).`;
    case "bad-status":
      return `ERC-5219 request returned status ${d.status} (only 200 supported).`;
    case "body-too-large":
      return `Response body is ${d.size} bytes; cap is ${MAX_BODY_BYTES} bytes.`;
  }
}

// ERC-4804 §4.1 resolveMode — bytes32, ASCII null-padded.
const RESOLVE_MODE_ABI = parseAbi([
  "function resolveMode() view returns (bytes32)",
]);

// ERC-5219 — KeyValue is (string,string). The named-field form would decode
// differently in viem; the unnamed form is what the spec wires onchain and
// what zRouter (and others) implement.
const REQUEST_ABI = parseAbi([
  "function request(string[] resource, (string,string)[] params) view returns (uint16, string, (string,string)[])",
]);

const MAX_BODY_BYTES = 1 * 1024 * 1024;

function bytes32ToString(value: `0x${string}`): string {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.slice(i, i + 2), 16);
    if (b === 0) break;
    out += String.fromCharCode(b);
  }
  return out;
}

export type FetchErc4804Options = {
  // Tier 1 only needs to confirm the contract implements ERC-4804 so it can
  // route to w3eth.io. probeOnly=true skips the (potentially expensive)
  // request() call and returns immediately after the resolveMode() check.
  probeOnly?: boolean;
};

export async function fetchErc4804(
  client: PublicClient,
  address: `0x${string}`,
  opts: FetchErc4804Options = {},
): Promise<Web3FetchResult> {
  // TODO(helios): this currently uses whatever client the caller passed; once
  // Helios lands the caller will pass a verified-transport client for the
  // same trust model as the contenthash path.
  const code = await client.getCode({ address });
  if (!code || code === "0x") {
    throw new Web3FetchError({ kind: "not-a-contract" });
  }

  let mode = "";
  try {
    const raw = (await client.readContract({
      address,
      abi: RESOLVE_MODE_ABI,
      functionName: "resolveMode",
    })) as `0x${string}`;
    mode = bytes32ToString(raw);
  } catch {
    /* fall through with empty mode */
  }
  if (mode !== "5219" && mode !== "manual") {
    throw new Web3FetchError({ kind: "unsupported-mode", mode });
  }

  if (opts.probeOnly) {
    return { status: 200, body: new Uint8Array(0), contentType: null };
  }

  let result: readonly [number, string, ReadonlyArray<readonly [string, string]>];
  try {
    result = (await client.readContract({
      address,
      abi: REQUEST_ABI,
      functionName: "request",
      args: [[], []],
    })) as readonly [number, string, ReadonlyArray<readonly [string, string]>];
  } catch (e) {
    throw new Web3FetchError({
      kind: "call-reverted",
      cause: e instanceof Error ? e.message : String(e),
    });
  }

  const [status, bodyStr, headers] = result;
  if (status !== 200) {
    throw new Web3FetchError({ kind: "bad-status", status });
  }

  const body = new TextEncoder().encode(bodyStr);
  if (body.byteLength > MAX_BODY_BYTES) {
    throw new Web3FetchError({
      kind: "body-too-large",
      size: body.byteLength,
    });
  }

  let contentType: string | null = null;
  for (const h of headers) {
    if (h[0].toLowerCase() === "content-type") {
      contentType = h[1];
      break;
    }
  }

  return { status, body, contentType };
}
