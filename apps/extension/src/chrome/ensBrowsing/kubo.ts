// Kubo (IPFS) probes and (Tier 2b) HTTP API client.
//
// Tier 2a only needs the gateway probe — uses the no-CORS subdomain trick:
// fetching `http://bafkqaaa.ipfs.localhost:8080/` (an empty UnixFS CID) with
// `mode: "no-cors"` resolves successfully iff Kubo's subdomain gateway is
// running on 8080. It proves both that Kubo is reachable AND that the
// subdomain gateway is enabled — the two things we actually need.
//
// We don't probe the API on :5001 in Tier 2a because the API requires a
// per-Origin CORS allowlist (Kubo's CSRF defense) that ordinary users won't
// have configured. Tier 2b adds the API probe + the setup-kubo screen.

const KUBO_GATEWAY_PROBE_URL = "http://bafkqaaa.ipfs.localhost:8080/";
const PROBE_TIMEOUT_MS = 1_000;
const MEMO_DURATION_MS = 30_000;

type Probe = {
  reachable: boolean;
  checkedAt: number;
};

let memoizedProbe: Probe | null = null;

export async function probeKuboGateway(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!opts.force && memoizedProbe && Date.now() - memoizedProbe.checkedAt < MEMO_DURATION_MS) {
    return memoizedProbe.reachable;
  }
  const reachable = await runProbe();
  memoizedProbe = { reachable, checkedAt: Date.now() };
  return reachable;
}

async function runProbe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // mode: "no-cors" → we don't read the response body, just whether the
    // network connection lands. Any non-network-error resolution counts as
    // "Kubo is up". An aborted/timed-out/network-refused fetch counts as
    // not-reachable.
    await fetch(KUBO_GATEWAY_PROBE_URL, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
      // Kubo's subdomain redirect would normally bounce a CID URL to its
      // canonical form; we don't care about the body so any response is OK.
      redirect: "follow",
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
// Tier 2b: full Kubo HTTP API client.
//
// The API on :5001 lets us *write* content (pinning ERC-4804 bodies). Kubo
// rejects browser-originated requests whose Origin isn't on its allowlist
// (CSRF / DNS-rebinding defense). Users who want Tier 2b need to allow the
// extension origin in Kubo's config — `setup-kubo.html` walks them through
// it with the exact command pre-filled with `chrome.runtime.id`.
// ────────────────────────────────────────────────────────────────────────────

const KUBO_API_BASE = "http://127.0.0.1:5001";

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
    resp = await fetch(`${KUBO_API_BASE}/api/v0/version`, { method: "POST" });
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
      const data = await resp.json();
      if (typeof data?.Version === "string") version = data.Version;
    } catch {
      /* a 200 from /version is enough */
    }
    return { ok: true, version };
  }
  if (resp.status === 403 || resp.status === 405) {
    const body = await resp.text().catch(() => "");
    return {
      ok: false,
      kind: { kind: "cors", cause: body || `HTTP ${resp.status}` },
    };
  }
  const body = await resp.text().catch(() => "");
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
    resp = await fetch(url, { method: "POST", body: form });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    if (/cors|origin/i.test(cause)) {
      throw new KuboPinError({ kind: "cors", cause });
    }
    throw new KuboPinError({ kind: "unreachable", cause });
  }

  const text = await resp.text();
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
    resp = await fetch(url, { method: "POST" });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new KuboPinError({ kind: "unreachable", cause });
  }
  if (resp.ok) return;
  const text = await resp.text().catch(() => "");
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
    resp = await fetch(url, { method: "POST" });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new KuboPinError({ kind: "unreachable", cause });
  }
  if (resp.ok) return;
  const text = await resp.text().catch(() => "");
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
