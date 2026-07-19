import { RPC_URLS } from "@/constants/chainRegistry";
import { fetchTextBounded, parseJsonObjectBounded } from "../network/boundedHttp";
import { fetchRpcResult } from "../network/rpcClient";

const ENS_SUBGRAPH_ID = "5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH";
const THE_GRAPH_API_KEY = import.meta.env?.VITE_THE_GRAPH_API_KEY?.trim() ?? "";
const ENS_SUBGRAPH_URL = THE_GRAPH_API_KEY
  ? `https://gateway.thegraph.com/api/${THE_GRAPH_API_KEY}/subgraphs/id/${ENS_SUBGRAPH_ID}`
  : "https://api.thegraph.com/subgraphs/name/ensdomains/ens";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 128_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  updatedAt: number | null;
};

const cache = new Map<string, CacheEntry>();

class EnsContenthashHistoryError extends Error {
  constructor(
    readonly stage: string,
    message: string,
  ) {
    super(`${stage}: ${message}`);
    this.name = "EnsContenthashHistoryError";
  }
}

function normalizeEnsName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase().replace(/\.$/, "");
  const hasControlCharacter = Array.from(name).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (
    name.length < 5 ||
    name.length > 255 ||
    !name.endsWith(".eth") ||
    /\s/u.test(name) ||
    hasControlCharacter
  ) {
    return null;
  }
  return name;
}

async function querySubgraph(
  stage: "domain-query" | "event-query",
  query: string,
  variables: Record<string, string>,
): Promise<Record<string, unknown>> {
  const body = JSON.stringify({ query, variables });
  const { response, text } = await fetchTextBounded(
    ENS_SUBGRAPH_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    },
    { timeoutMs: REQUEST_TIMEOUT_MS, maxBytes: MAX_RESPONSE_BYTES },
  );
  if (!response.ok) {
    throw new EnsContenthashHistoryError(
      stage,
      `subgraph request returned HTTP ${response.status}`,
    );
  }
  let envelope: Record<string, unknown>;
  try {
    envelope = parseJsonObjectBounded(text, "Invalid ENS history response");
  } catch {
    throw new EnsContenthashHistoryError(stage, "invalid subgraph response");
  }
  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    throw new EnsContenthashHistoryError(stage, "subgraph returned GraphQL errors");
  }
  const data = envelope.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new EnsContenthashHistoryError(stage, "subgraph response omitted data");
  }
  return data as Record<string, unknown>;
}

function firstResolverId(data: Record<string, unknown>): string | null {
  const domains = data.domains;
  if (!Array.isArray(domains) || domains.length === 0) return null;
  const domain = domains[0];
  if (!domain || typeof domain !== "object" || Array.isArray(domain)) return null;
  const resolver = (domain as Record<string, unknown>).resolver;
  if (!resolver || typeof resolver !== "object" || Array.isArray(resolver)) return null;
  const id = (resolver as Record<string, unknown>).id;
  return typeof id === "string" && id.length <= 160 ? id : null;
}

function firstContenthashBlock(data: Record<string, unknown>): string | null {
  const events = data.contenthashChangeds;
  if (!Array.isArray(events) || events.length === 0) return null;
  const event = events[0];
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const blockNumber = (event as Record<string, unknown>).blockNumber;
  if (
    typeof blockNumber === "number" &&
    Number.isSafeInteger(blockNumber) &&
    blockNumber >= 0
  ) {
    return String(blockNumber);
  }
  return typeof blockNumber === "string" && /^\d{1,20}$/.test(blockNumber)
    ? blockNumber
    : null;
}

async function fetchLatestContenthashUpdate(name: string): Promise<number | null> {
  const domainData = await querySubgraph(
    "domain-query",
    `query GetDomainResolver($ens: String!) {
      domains(first: 1, where: { name: $ens }) { resolver { id } }
    }`,
    { ens: name },
  );
  const resolverId = firstResolverId(domainData);
  if (!resolverId) {
    throw new EnsContenthashHistoryError(
      "resolver",
      "no current resolver was indexed for this ENS name",
    );
  }

  const eventData = await querySubgraph(
    "event-query",
    `query GetLatestContenthashUpdate($resolverId: String!) {
      contenthashChangeds(
        first: 1
        orderBy: blockNumber
        orderDirection: desc
        where: { resolver: $resolverId }
      ) { blockNumber }
    }`,
    { resolverId },
  );
  const blockNumber = firstContenthashBlock(eventData);
  if (!blockNumber) {
    throw new EnsContenthashHistoryError(
      "contenthash-event",
      "no ContenthashChanged event was indexed for the current resolver",
    );
  }

  const block = await fetchRpcResult(
    RPC_URLS[1],
    "eth_getBlockByNumber",
    [`0x${BigInt(blockNumber).toString(16)}`, false],
    {
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxResponseBytes: MAX_RESPONSE_BYTES,
      allowPrivateWithoutOrigin: true,
    },
  );
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    throw new EnsContenthashHistoryError(
      "block-query",
      "Ethereum RPC returned no block",
    );
  }
  const timestamp = (block as Record<string, unknown>).timestamp;
  if (typeof timestamp !== "string" || !/^0x[0-9a-f]+$/i.test(timestamp)) {
    throw new EnsContenthashHistoryError(
      "block-timestamp",
      "Ethereum RPC returned an invalid timestamp",
    );
  }
  const seconds = Number(BigInt(timestamp));
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new EnsContenthashHistoryError(
      "block-timestamp",
      "Ethereum RPC timestamp was out of range",
    );
  }
  return seconds * 1000;
}

export async function getEnsContenthashLastUpdated(
  ensName: unknown,
): Promise<number | null> {
  const name = normalizeEnsName(ensName);
  if (!name) throw new Error("Invalid ENS name");
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.updatedAt;
  const updatedAt = await fetchLatestContenthashUpdate(name);
  cache.set(name, { expiresAt: Date.now() + CACHE_TTL_MS, updatedAt });
  return updatedAt;
}
