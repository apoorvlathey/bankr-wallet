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
