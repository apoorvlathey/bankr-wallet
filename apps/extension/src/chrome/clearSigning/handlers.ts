import type { DescriptorKind } from "@/lib/clearSigning/types";
import {
  CLEAR_SIGNING_CACHE_SCHEMA_VERSION,
  readDescriptorCache,
  writeDescriptorCache,
  type DescriptorCacheEntry,
} from "./descriptorCache";
import { resolveRemoteDescriptor } from "./descriptorResolver";
import { getClearSigningEnabled } from "./settings";
import type {
  DescriptorLookup,
  GetDescriptorMessage,
  GetDescriptorResponse,
} from "./types";

export interface ClearSigningHandlerDependencies {
  getEnabled: () => Promise<boolean>;
  readCache: (
    lookup: DescriptorLookup,
  ) => Promise<DescriptorCacheEntry | null>;
  resolveDescriptor: (
    lookup: DescriptorLookup,
  ) => Promise<GetDescriptorResponse["descriptor"]>;
  writeCache: (
    lookup: DescriptorLookup,
    descriptor: GetDescriptorResponse["descriptor"],
  ) => Promise<void>;
  now: () => number;
}

const DEFAULT_DEPENDENCIES: ClearSigningHandlerDependencies = {
  getEnabled: getClearSigningEnabled,
  readCache: readDescriptorCache,
  resolveDescriptor: resolveRemoteDescriptor,
  writeCache: writeDescriptorCache,
  now: () => Date.now(),
};

function normalizeLookup(
  message: GetDescriptorMessage,
): DescriptorLookup | null {
  const chainId = Number(message.chainId);
  const address = String(message.address || "").toLowerCase();
  const kind = message.kind as DescriptorKind;
  const selector =
    typeof message.selector === "string" &&
    /^0x[0-9a-fA-F]{8}$/.test(message.selector)
      ? message.selector.toLowerCase()
      : undefined;
  const formatKey =
    typeof message.formatKey === "string" && message.formatKey.length <= 8192
      ? message.formatKey
      : undefined;
  if (!chainId || !/^0x[0-9a-f]{40}$/.test(address)) return null;
  if (kind !== "calldata" && kind !== "eip712") return null;
  return { chainId, address, kind, selector, formatKey };
}

export async function handleGetClearSigningDescriptorWithDependencies(
  message: GetDescriptorMessage,
  dependencies: ClearSigningHandlerDependencies,
): Promise<GetDescriptorResponse> {
  const enabled = await dependencies.getEnabled();
  if (!enabled) return { descriptor: null, enabled: false };

  const lookup = normalizeLookup(message);
  if (!lookup) return { descriptor: null, enabled };
  const tag = `[clear-signing/bg] ${lookup.kind} ${lookup.chainId}:${lookup.address}`;

  const cached = await dependencies.readCache(lookup);
  if (cached) {
    console.log(
      `${tag} cache ${cached.descriptor ? "HIT" : "MISS"} (age=${Math.round(
        (dependencies.now() - cached.updatedAt) / 1000,
      )}s)`,
    );
    return { descriptor: cached.descriptor, enabled };
  }
  console.log(`${tag} cache empty → fetching from proxy`);

  const descriptor = await dependencies.resolveDescriptor(lookup);
  await dependencies.writeCache(lookup, descriptor);
  console.log(
    `${tag} cached ${descriptor ? "hit" : "miss"} (schema v${CLEAR_SIGNING_CACHE_SCHEMA_VERSION})`,
  );
  return { descriptor, enabled };
}

export async function handleGetClearSigningDescriptor(
  message: GetDescriptorMessage,
): Promise<GetDescriptorResponse> {
  return handleGetClearSigningDescriptorWithDependencies(
    message,
    DEFAULT_DEPENDENCIES,
  );
}
