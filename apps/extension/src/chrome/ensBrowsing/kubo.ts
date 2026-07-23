// Kubo (IPFS) gateway probe + HTTP API client.
//
// The local-gateway path only needs the gateway probe — uses the no-CORS
// subdomain trick: fetching `http://bafkqaaa.ipfs.localhost:8080/` (an empty
// UnixFS CID) with `mode: "no-cors"` resolves successfully iff Kubo's
// subdomain gateway is running on 8080. It proves both that Kubo is reachable
// AND that the subdomain gateway is enabled — the two things we actually need.
//
// We don't probe the API on :5001 for the local-gateway path because the API
// requires a per-Origin CORS allowlist (Kubo's CSRF defense) that ordinary
// users won't have configured. The pin-onchain-HTML path adds the API probe
// + the setup-kubo screen for that.

import { getEnsBrowsingSettings } from "./settingsStorage";

const PROBE_TIMEOUT_MS = 1_000;
const MEMO_DURATION_MS = 30_000;

type Probe = {
  reachable: boolean;
  checkedAt: number;
  // Probe URL the cached result was taken against; if the user changes their
  // gateway host/port, the memo is invalidated automatically.
  probeUrl: string;
};

let memoizedProbe: Probe | null = null;

async function buildProbeUrl(): Promise<string> {
  const { gatewayHost, gatewayPort } = await getEnsBrowsingSettings();
  // bafkqaaa = the empty UnixFS CID — small + universally available.
  return `http://bafkqaaa.ipfs.${gatewayHost}:${gatewayPort}/`;
}

export async function probeKuboGateway(opts: { force?: boolean } = {}): Promise<boolean> {
  const probeUrl = await buildProbeUrl();
  if (
    !opts.force &&
    memoizedProbe &&
    memoizedProbe.probeUrl === probeUrl &&
    Date.now() - memoizedProbe.checkedAt < MEMO_DURATION_MS
  ) {
    return memoizedProbe.reachable;
  }
  const reachable = await runProbe(probeUrl);
  memoizedProbe = { reachable, checkedAt: Date.now(), probeUrl };
  return reachable;
}

async function runProbe(probeUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // mode: "no-cors" → we don't read the response body, just whether the
    // network connection lands. Any non-network-error resolution counts as
    // "Kubo is up". An aborted/timed-out/network-refused fetch counts as
    // not-reachable.
    await fetch(probeUrl, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
      // Kubo's subdomain redirect would normally bounce a CID URL to its
      // canonical form; we don't care about the body so any response is OK.
      redirect: "manual",
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function invalidateKuboGatewayProbe(): void {
  memoizedProbe = null;
}

// ────────────────────────────────────────────────────────────────────────────
// Full Kubo HTTP API client (used when `pinOnchainHtml` is ON).
//
// The API on :5001 lets us *write* content (pinning ERC-4804 bodies). Kubo
// rejects browser-originated requests whose Origin isn't on its allowlist
// (CSRF / DNS-rebinding defense). Users who want onchain-HTML pinning need
// to allow the extension origin in Kubo's config — `setup-kubo.html` walks
// them through it with the exact command pre-filled with `chrome.runtime.id`.
// ────────────────────────────────────────────────────────────────────────────

const KUBO_API_BASE = "http://127.0.0.1:5001";
const KUBO_API_TIMEOUT_MS = 10_000;
const MAX_KUBO_API_RESPONSE_BYTES = 65_536;

function kuboApiFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(KUBO_API_TIMEOUT_MS),
  });
}

async function readBoundedKuboResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_KUBO_API_RESPONSE_BYTES
  ) {
    throw new Error("Kubo API response is too large");
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_KUBO_API_RESPONSE_BYTES) {
      throw new Error("Kubo API response is too large");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_KUBO_API_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("Kubo API response is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export type KuboPinErrorKind =
  | { kind: "unreachable"; cause: string }
  | { kind: "cors"; cause: string }
  | { kind: "http"; status: number; body: string }
  | { kind: "parse"; body: string };

export class KuboPinError extends Error {
  constructor(public detail: KuboPinErrorKind) {
    super(describeKuboPinError(detail));
  }
}

export function describeKuboPinError(d: KuboPinErrorKind): string {
  switch (d.kind) {
    case "unreachable":
      return `Kubo API at ${KUBO_API_BASE} is unreachable: ${d.cause}. Is IPFS Desktop running?`;
    case "cors":
      return `Kubo rejected the request (CORS / Origin not allowed): ${d.cause}. Allow the extension origin in Kubo's API.HTTPHeaders.Access-Control-Allow-Origin.`;
    case "http":
      return `Kubo /api/v0/add returned ${d.status}: ${d.body}`;
    case "parse":
      return `Kubo /api/v0/add returned an unparseable response: ${d.body}`;
  }
}

export type KuboAddResult = { cid: string; size: number };

export type KuboProbeResult =
  | { ok: true; version?: string }
  | { ok: false; kind: KuboPinErrorKind };

// Lightweight canary probe of the Kubo RPC API. POST /api/v0/version takes
// no args, returns a tiny JSON object, and goes through the same Origin
// check as `add` — so a 200 here means writes will succeed too.
export async function probeKuboApi(): Promise<KuboProbeResult> {
  let resp: Response;
  try {
    resp = await kuboApiFetch(`${KUBO_API_BASE}/api/v0/version`, {
      method: "POST",
    });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    if (/cors|origin/i.test(cause)) {
      return { ok: false, kind: { kind: "cors", cause } };
    }
    return { ok: false, kind: { kind: "unreachable", cause } };
  }
  if (resp.ok) {
    let version: string | undefined;
    try {
      const data = JSON.parse(await readBoundedKuboResponse(resp));
      if (typeof data?.Version === "string") version = data.Version;
    } catch {
      /* a 200 from /version is enough */
    }
    return { ok: true, version };
  }
  if (resp.status === 403 || resp.status === 405) {
    const body = await readBoundedKuboResponse(resp).catch(() => "");
    return {
      ok: false,
      kind: { kind: "cors", cause: body || `HTTP ${resp.status}` },
    };
  }
  const body = await readBoundedKuboResponse(resp).catch(() => "");
  return {
    ok: false,
    kind: { kind: "http", status: resp.status, body: body.slice(0, 512) },
  };
}

export type AddOptions = {
  // MFS path under which to copy the pinned object. Allows enumeration and
  // pruning later (e.g. /walletchan/ens/web3/<contract>/<contentHash>).
  mfsPath?: string;
};

export async function addToKubo(
  body: Uint8Array,
  opts: AddOptions = {},
): Promise<KuboAddResult> {
  const params = new URLSearchParams({
    "cid-version": "1",
    "raw-leaves": "true",
    pin: "true",
  });
  if (opts.mfsPath) params.set("to-files", opts.mfsPath);

  const form = new FormData();
  form.append("file", new Blob([body as BlobPart]), "body");

  const url = `${KUBO_API_BASE}/api/v0/add?${params.toString()}`;

  let resp: Response;
  try {
    resp = await kuboApiFetch(url, { method: "POST", body: form });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    if (/cors|origin/i.test(cause)) {
      throw new KuboPinError({ kind: "cors", cause });
    }
    throw new KuboPinError({ kind: "unreachable", cause });
  }

  const text = await readBoundedKuboResponse(resp);
  if (!resp.ok) {
    if (resp.status === 403 || resp.status === 405) {
      throw new KuboPinError({ kind: "cors", cause: text || `HTTP ${resp.status}` });
    }
    throw new KuboPinError({
      kind: "http",
      status: resp.status,
      body: text.slice(0, 512),
    });
  }

  // /api/v0/add returns one JSON object per added entry, newline-delimited.
  const lastLine = text.trim().split("\n").pop() ?? "";
  let parsed: { Hash?: string; Size?: string };
  try {
    parsed = JSON.parse(lastLine);
  } catch {
    throw new KuboPinError({ kind: "parse", body: text.slice(0, 512) });
  }
  if (!parsed.Hash) {
    throw new KuboPinError({ kind: "parse", body: text.slice(0, 512) });
  }
  return { cid: parsed.Hash, size: Number(parsed.Size ?? body.byteLength) };
}

export async function unpinFromKubo(cid: string): Promise<void> {
  const url = `${KUBO_API_BASE}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`;
  let resp: Response;
  try {
    resp = await kuboApiFetch(url, { method: "POST" });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new KuboPinError({ kind: "unreachable", cause });
  }
  if (resp.ok) return;
  const text = await readBoundedKuboResponse(resp).catch(() => "");
  if (/not pinned/i.test(text)) return;
  if (resp.status === 403 || resp.status === 405) {
    throw new KuboPinError({ kind: "cors", cause: text || `HTTP ${resp.status}` });
  }
  throw new KuboPinError({
    kind: "http",
    status: resp.status,
    body: text.slice(0, 512),
  });
}

export async function removeMfsPath(path: string): Promise<void> {
  const params = new URLSearchParams({
    arg: path,
    recursive: "true",
    force: "true",
  });
  const url = `${KUBO_API_BASE}/api/v0/files/rm?${params.toString()}`;
  let resp: Response;
  try {
    resp = await kuboApiFetch(url, { method: "POST" });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new KuboPinError({ kind: "unreachable", cause });
  }
  if (resp.ok) return;
  const text = await readBoundedKuboResponse(resp).catch(() => "");
  if (/file does not exist/i.test(text)) return;
  if (resp.status === 403 || resp.status === 405) {
    throw new KuboPinError({ kind: "cors", cause: text || `HTTP ${resp.status}` });
  }
  throw new KuboPinError({
    kind: "http",
    status: resp.status,
    body: text.slice(0, 512),
  });
}
