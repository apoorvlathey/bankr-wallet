/**
 * Build apps/website/data/clearsigning-index.json from the public ERC-7730 registry.
 *
 * Run:  pnpm tsx apps/website/scripts/snapshot-clearsigning-index.ts
 *
 * The output is a map (chainId, lowercased contract address) -> { calldata?, eip712? }
 * where each value points at the registry file holding the matching `display.formats`.
 *
 * The website's /api/clearsigning/descriptor route uses this snapshot to resolve
 * (chainId, address) -> registry file path before fetching the JSON from GitHub raw.
 */

import fs from "fs/promises";
import path from "path";

const REPO = "ethereum/clear-signing-erc7730-registry";
const BRANCH = "master";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const API_BASE = `https://api.github.com/repos/${REPO}`;

interface Deployment {
  chainId: number;
  address: string;
}

interface RawDescriptor {
  $schema?: string;
  includes?: string;
  context?: {
    contract?: { deployments?: Deployment[] };
    eip712?: { deployments?: Deployment[] };
  };
  display?: { formats?: Record<string, unknown> };
}

type Kind = "calldata" | "eip712";

interface IndexEntry {
  calldata?: string;
  eip712?: string;
}

interface Snapshot {
  updatedAt: string;
  source: string;
  entries: Record<string, Record<string, IndexEntry>>;
}

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "walletchan-clearsigning-snapshot",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchTree(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/git/trees/${BRANCH}?recursive=1`, {
    headers: ghHeaders(),
  });
  if (!res.ok) {
    throw new Error(`tree fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    tree: Array<{ path: string; type: string }>;
    truncated: boolean;
  };
  if (data.truncated) console.warn("WARNING: registry tree response was truncated");
  return data.tree
    .filter(
      (x) =>
        x.type === "blob" &&
        x.path.startsWith("registry/") &&
        x.path.endsWith(".json") &&
        !x.path.includes("/tests/"),
    )
    .map((x) => x.path);
}

const fileCache = new Map<string, RawDescriptor>();

async function fetchJson(p: string): Promise<RawDescriptor> {
  const cached = fileCache.get(p);
  if (cached) return cached;
  const res = await fetch(`${RAW_BASE}/${p}`);
  if (!res.ok) throw new Error(`fetch ${p}: ${res.status}`);
  const data = (await res.json()) as RawDescriptor;
  fileCache.set(p, data);
  return data;
}

function resolveIncludePath(originPath: string, includeRel: string): string {
  const dir = originPath.includes("/")
    ? originPath.slice(0, originPath.lastIndexOf("/"))
    : "";
  return path.posix.normalize(dir ? `${dir}/${includeRel}` : includeRel);
}

interface ResolvedContext {
  calldata: Deployment[];
  eip712: Deployment[];
  hasContractContext: boolean;
  hasEip712Context: boolean;
  /**
   * Format keys merged across the descriptor and its `includes` chain. We
   * don't need the format bodies for indexing — just the count, so the
   * "skip if no formats" guard below counts include-inherited formats too.
   * Without this, files like `calldata-Safe-1.4.1.json` (deployments only,
   * formats live in `common-Safe.json` via `includes`) were dropped before
   * indexing, so the Safe singleton ended up indexed for `eip712` only.
   */
  formatCount: number;
}

async function resolveContext(
  desc: RawDescriptor,
  originPath: string,
  depth = 0,
): Promise<ResolvedContext> {
  const out: ResolvedContext = {
    calldata: [],
    eip712: [],
    hasContractContext: false,
    hasEip712Context: false,
    formatCount: 0,
  };
  if (desc.context?.contract) {
    out.hasContractContext = true;
    if (desc.context.contract.deployments) {
      out.calldata.push(...desc.context.contract.deployments);
    }
  }
  if (desc.context?.eip712) {
    out.hasEip712Context = true;
    if (desc.context.eip712.deployments) {
      out.eip712.push(...desc.context.eip712.deployments);
    }
  }
  if (desc.display?.formats) {
    out.formatCount += Object.keys(desc.display.formats).length;
  }

  if (desc.includes && depth < 3) {
    try {
      const includePath = resolveIncludePath(originPath, desc.includes);
      const included = await fetchJson(includePath);
      const inner = await resolveContext(included, includePath, depth + 1);
      out.calldata.push(...inner.calldata);
      out.eip712.push(...inner.eip712);
      out.hasContractContext ||= inner.hasContractContext;
      out.hasEip712Context ||= inner.hasEip712Context;
      out.formatCount += inner.formatCount;
    } catch (err) {
      console.warn(`  include resolve failed for ${originPath}: ${(err as Error).message}`);
    }
  }

  return out;
}

function isAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

async function main() {
  console.log("Fetching registry tree…");
  const paths = await fetchTree();
  console.log(`Found ${paths.length} descriptor files`);

  const entries: Record<number, Record<string, IndexEntry>> = {};
  let processed = 0;
  let withFormats = 0;
  let written = 0;

  // Mild concurrency to keep total time tolerable.
  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= paths.length) return;
      const p = paths[i];
      try {
        const desc = await fetchJson(p);
        const ctx = await resolveContext(desc, p);
        // Skip files that contribute no formats AFTER include-resolution. Doing
        // this before include-resolution would drop deployment-only descriptors
        // like `calldata-Safe-1.4.1.json` whose formats live in an included
        // `common-Safe.json`, leaving the Safe singleton un-indexed for
        // calldata lookups.
        if (ctx.formatCount === 0) {
          processed++;
          continue;
        }
        withFormats++;

        // Decide which kind this file's formats apply to.
        // A file with eip712 context covers eip712; with contract context covers calldata.
        // A file with both covers both (rare).
        const kinds: Kind[] = [];
        if (ctx.hasContractContext) kinds.push("calldata");
        if (ctx.hasEip712Context) kinds.push("eip712");
        if (kinds.length === 0) {
          // No context at all → can't be looked up by (chainId, address). Skip.
          processed++;
          continue;
        }

        // Pool every deployment from any context; the address is the same lookup key.
        const deployments = [...ctx.calldata, ...ctx.eip712];
        for (const d of deployments) {
          if (!d || typeof d.chainId !== "number" || !isAddress(d.address)) continue;
          const addr = d.address.toLowerCase();
          if (!entries[d.chainId]) entries[d.chainId] = {};
          const slot = (entries[d.chainId][addr] ??= {});
          for (const k of kinds) {
            if (!slot[k]) {
              slot[k] = p;
              written++;
            }
          }
        }
      } catch (err) {
        console.warn(`  skip ${p}: ${(err as Error).message}`);
      } finally {
        processed++;
        if (processed % 50 === 0) {
          console.log(`  ${processed}/${paths.length} processed`);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const chainCount = Object.keys(entries).length;
  const addrCount = Object.values(entries).reduce((a, b) => a + Object.keys(b).length, 0);

  const snapshot: Snapshot = {
    updatedAt: new Date().toISOString(),
    source: `https://github.com/${REPO}@${BRANCH}`,
    entries: Object.fromEntries(
      Object.entries(entries).sort(([a], [b]) => Number(a) - Number(b)),
    ),
  };

  const outPath = path.resolve(__dirname, "../data/clearsigning-index.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2) + "\n");

  console.log("");
  console.log(`Done.`);
  console.log(`  Files with formats: ${withFormats}/${paths.length}`);
  console.log(`  Total kind slots written: ${written}`);
  console.log(`  Chains covered: ${chainCount}`);
  console.log(`  Unique addresses covered: ${addrCount}`);
  console.log(`  Output: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
