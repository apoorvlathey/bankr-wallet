import { NextRequest, NextResponse } from "next/server";
import snapshotRaw from "@/data/clearsigning-index.json";

const REPO = "ethereum/clear-signing-erc7730-registry";
const BRANCH = "master";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const API_TREE = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;

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

interface RawDescriptor {
  $schema?: string;
  includes?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  display?: { formats?: Record<string, unknown> };
}

const committed = snapshotRaw as unknown as Snapshot;

// In-memory live index that augments the committed snapshot if a fresh rebuild succeeds.
let liveIndex: Snapshot | null = null;
let liveIndexFetchedAt = 0;
const LIVE_INDEX_TTL_MS = 6 * 3600 * 1000;

// Descriptor JSON cache (post-include-resolution).
const descCache = new Map<string, { data: RawDescriptor; fetchedAt: number }>();
const DESCRIPTOR_TTL_MS = 24 * 3600 * 1000;

async function fetchAndResolve(p: string, depth = 0): Promise<RawDescriptor> {
  if (depth > 3) throw new Error("include depth exceeded");
  const cached = descCache.get(p);
  if (cached && Date.now() - cached.fetchedAt < DESCRIPTOR_TTL_MS) return cached.data;

  const res = await fetch(`${RAW_BASE}/${p}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch ${p}: ${res.status}`);
  const desc = (await res.json()) as RawDescriptor;

  if (desc.includes) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    const includePath = normalizeJoin(dir, desc.includes);
    try {
      const inner = await fetchAndResolve(includePath, depth + 1);
      desc.context = { ...(inner.context || {}), ...(desc.context || {}) };
      desc.metadata = { ...(inner.metadata || {}), ...(desc.metadata || {}) };
      desc.display = {
        ...(inner.display || {}),
        ...(desc.display || {}),
        formats: {
          ...(inner.display?.formats || {}),
          ...(desc.display?.formats || {}),
        },
      };
    } catch (err) {
      console.warn(`include resolution failed for ${p}: ${(err as Error).message}`);
    }
    delete desc.includes;
  }

  descCache.set(p, { data: desc, fetchedAt: Date.now() });
  return desc;
}

function normalizeJoin(dir: string, rel: string): string {
  const parts = (dir ? `${dir}/${rel}` : rel).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

async function tryRefreshLiveIndex(): Promise<void> {
  if (liveIndex && Date.now() - liveIndexFetchedAt < LIVE_INDEX_TTL_MS) return;
  // Refresh in the background; do NOT await callers if we already have committed data.
  try {
    const res = await fetch(API_TREE, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "walletchan-website",
      },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { tree?: Array<{ path: string; type: string }> };
    // Only mark fetchedAt; we don't rebuild the full index at request time
    // because that's hundreds of file fetches. We rely on the committed snapshot.
    // This is a stub that future work could expand into a real rebuild.
    if (data.tree) liveIndexFetchedAt = Date.now();
  } catch {
    // ignore — fall back to committed snapshot
  }
}

function resolveEntry(chainId: string, address: string): IndexEntry | undefined {
  // Prefer live index when available; fall back to committed snapshot.
  if (liveIndex?.entries[chainId]?.[address]) return liveIndex.entries[chainId][address];
  return committed.entries[chainId]?.[address];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chainId = searchParams.get("chainId");
  const addressRaw = searchParams.get("address");
  const kind = (searchParams.get("kind") || "") as Kind | "";

  if (!chainId || !/^\d+$/.test(chainId)) {
    return NextResponse.json({ error: "Missing or invalid chainId" }, { status: 400 });
  }
  if (!addressRaw || !/^0x[0-9a-fA-F]{40}$/.test(addressRaw)) {
    return NextResponse.json({ error: "Missing or invalid address" }, { status: 400 });
  }
  if (kind && kind !== "calldata" && kind !== "eip712") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const address = addressRaw.toLowerCase();

  // Fire and forget — caller is unaffected if this fails.
  void tryRefreshLiveIndex();

  const entry = resolveEntry(chainId, address);
  if (!entry) {
    return NextResponse.json(
      { error: "no descriptor" },
      { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } },
    );
  }

  const path = kind ? entry[kind] : entry.calldata || entry.eip712;
  if (!path) {
    return NextResponse.json(
      { error: "no descriptor for kind" },
      { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } },
    );
  }

  try {
    const desc = await fetchAndResolve(path);
    return NextResponse.json(
      { descriptor: desc, sourcePath: path, kind },
      { headers: { "Cache-Control": "public, s-maxage=86400" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
