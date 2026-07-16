import {
  decodeFunctionResult,
  encodeFunctionData,
  namehash,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { normalize, packetToBytes, parseAvatarRecord } from "viem/ens";
import { L2ResolverAbi } from "@/lib/L2ResolverAbi";
import {
  BASENAME_L2_RESOLVER_ADDRESS,
  convertReverseNodeToBytes,
  getBaseNameServiceClient,
  getMainnetNameServiceClient,
  getMegaNameServiceClient,
  sanitizeResolvedName,
} from "@/lib/ensUtils";
import { GWEI_CONTRACT, WEI_CONTRACT } from "@/utils/wei";
import { MEGA_NAMES_CONTRACT, megaNamesAbi } from "@/utils/mega";

const MULTICALL3_ADDRESS = "0xca11bde05977b3631167028862be2a173976ca11" as const;
const ENS_UNIVERSAL_RESOLVER_ADDRESS = "0xeeeeeeee14d718c2b47d9923deab1335e144eeee" as const;
const LOCAL_BATCH_GATEWAY_URL = "x-batch-gateway:true";

const REVERSE_RESOLVER_ABI = [{
  name: "reverseResolve",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "addr", type: "address" }],
  outputs: [{ name: "", type: "string" }],
}] as const;

const ENS_REVERSE_ABI = [{
  name: "reverseWithGateways",
  type: "function",
  stateMutability: "view",
  inputs: [
    { name: "reverseName", type: "bytes" },
    { name: "coinType", type: "uint256" },
    { name: "gateways", type: "string[]" },
  ],
  outputs: [
    { name: "resolvedName", type: "string" },
    { name: "resolver", type: "address" },
    { name: "reverseResolver", type: "address" },
  ],
}] as const;

const TEXT_RESOLVER_ABI = [{
  name: "text",
  type: "function",
  stateMutability: "view",
  inputs: [
    { name: "node", type: "bytes32" },
    { name: "key", type: "string" },
  ],
  outputs: [{ name: "", type: "string" }],
}] as const;

const ENS_RESOLVE_ABI = [{
  name: "resolveWithGateways",
  type: "function",
  stateMutability: "view",
  inputs: [
    { name: "name", type: "bytes" },
    { name: "data", type: "bytes" },
    { name: "gateways", type: "string[]" },
  ],
  outputs: [
    { name: "", type: "bytes" },
    { name: "resolver", type: "address" },
  ],
}] as const;

const GWEI_AVATAR_ABI = [
  {
    name: "computeId",
    type: "function",
    stateMutability: "pure",
    inputs: [{ name: "fullName", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

interface BatchResult {
  status: "success" | "failure";
  result?: unknown;
}

export interface BatchEnsIdentity {
  name: string | null;
  avatar: string | null;
}

function successfulResult(results: readonly BatchResult[], index: number): unknown {
  const result = results[index];
  return result?.status === "success" ? result.result : null;
}

function stringResult(results: readonly BatchResult[], index: number): string | null {
  const result = successfulResult(results, index);
  return typeof result === "string" && result.length > 0 ? result : null;
}

function ensReverseName(results: readonly BatchResult[], index: number): string | null {
  const result = successfulResult(results, index);
  return Array.isArray(result) ? sanitizeResolvedName(result[0]) : null;
}

function normalizedEnsAvatarCall(name: string) {
  const normalizedName = normalize(name);
  return {
    address: ENS_UNIVERSAL_RESOLVER_ADDRESS,
    abi: ENS_RESOLVE_ABI,
    functionName: "resolveWithGateways" as const,
    args: [
      toHex(packetToBytes(normalizedName)),
      encodeFunctionData({
        abi: TEXT_RESOLVER_ABI,
        functionName: "text",
        args: [namehash(normalizedName), "avatar"],
      }),
      [LOCAL_BATCH_GATEWAY_URL],
    ] as const,
  };
}

function decodeEnsAvatarRecord(value: unknown): string | null {
  if (!Array.isArray(value) || typeof value[0] !== "string" || value[0] === "0x") return null;
  try {
    const record = decodeFunctionResult({
      abi: TEXT_RESOLVER_ABI,
      functionName: "text",
      data: value[0] as Hex,
    });
    return typeof record === "string" && record.length > 0 ? record : null;
  } catch {
    return null;
  }
}

async function resolvePrimaryNames(
  addresses: Address[],
  knownNames: ReadonlyMap<string, string>,
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  const unresolved = addresses.filter((address) => {
    const known = sanitizeResolvedName(knownNames.get(address.toLowerCase()));
    if (known) names.set(address.toLowerCase(), known);
    return !known;
  });
  if (unresolved.length === 0) return names;

  const [mainnetClient, baseClient, megaClient] = await Promise.all([
    getMainnetNameServiceClient(),
    getBaseNameServiceClient(),
    getMegaNameServiceClient(),
  ]);
  const mainnetCalls = unresolved.flatMap((address) => [
    {
      address: ENS_UNIVERSAL_RESOLVER_ADDRESS,
      abi: ENS_REVERSE_ABI,
      functionName: "reverseWithGateways" as const,
      args: [address, 60n, [LOCAL_BATCH_GATEWAY_URL]] as const,
    },
    { address: WEI_CONTRACT as Address, abi: REVERSE_RESOLVER_ABI, functionName: "reverseResolve" as const, args: [address] as const },
    { address: GWEI_CONTRACT as Address, abi: REVERSE_RESOLVER_ABI, functionName: "reverseResolve" as const, args: [address] as const },
  ]);
  const baseCalls = unresolved.map((address) => ({
    address: BASENAME_L2_RESOLVER_ADDRESS,
    abi: L2ResolverAbi,
    functionName: "name" as const,
    args: [convertReverseNodeToBytes(address, 8453)] as const,
  }));
  const megaCalls = unresolved.map((address) => ({
    address: MEGA_NAMES_CONTRACT,
    abi: megaNamesAbi,
    functionName: "getName" as const,
    args: [address] as const,
  }));

  const [mainnetResults, baseResults, megaResults] = await Promise.all([
    mainnetClient.multicall({ contracts: mainnetCalls, allowFailure: true, multicallAddress: MULTICALL3_ADDRESS }).catch(() => []),
    baseClient.multicall({ contracts: baseCalls, allowFailure: true, multicallAddress: MULTICALL3_ADDRESS }).catch(() => []),
    megaClient.multicall({ contracts: megaCalls, allowFailure: true, multicallAddress: MULTICALL3_ADDRESS }).catch(() => []),
  ]) as [BatchResult[], BatchResult[], BatchResult[]];

  unresolved.forEach((address, index) => {
    const mainnetOffset = index * 3;
    const name = ensReverseName(mainnetResults, mainnetOffset)
      || sanitizeResolvedName(stringResult(baseResults, index))
      || sanitizeResolvedName(stringResult(mainnetResults, mainnetOffset + 1))
      || sanitizeResolvedName(stringResult(mainnetResults, mainnetOffset + 2))
      || sanitizeResolvedName(stringResult(megaResults, index));
    names.set(address.toLowerCase(), name);
  });
  return names;
}

async function resolveAvatars(names: Map<string, string | null>): Promise<Map<string, string | null>> {
  const avatars = new Map<string, string | null>();
  const named = [...names].filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (named.length === 0) return avatars;

  const [mainnetClient, baseClient, megaClient] = await Promise.all([
    getMainnetNameServiceClient(),
    getBaseNameServiceClient(),
    getMegaNameServiceClient(),
  ]);
  const ensCandidates = named.filter(([, name]) => !/\.(?:wei|gwei|mega)$/iu.test(name));
  const basenameCandidates = named.filter(([, name]) => name.toLowerCase().endsWith(".base.eth"));
  const gweiCandidates = named.filter(([, name]) => name.toLowerCase().endsWith(".gwei"));
  const megaCandidates = named.filter(([, name]) => name.toLowerCase().endsWith(".mega"));

  const [ensResults, basenameResults, gweiIdResults, megaResults] = await Promise.all([
    mainnetClient.multicall({ contracts: ensCandidates.map(([, name]) => normalizedEnsAvatarCall(name)), allowFailure: true, multicallAddress: MULTICALL3_ADDRESS }).catch(() => []),
    baseClient.multicall({ contracts: basenameCandidates.map(([, name]) => ({ address: BASENAME_L2_RESOLVER_ADDRESS, abi: L2ResolverAbi, functionName: "text" as const, args: [namehash(name), "avatar"] as const })), allowFailure: true, multicallAddress: MULTICALL3_ADDRESS }).catch(() => []),
    mainnetClient.multicall({ contracts: gweiCandidates.map(([, name]) => ({ address: GWEI_CONTRACT as Address, abi: GWEI_AVATAR_ABI, functionName: "computeId" as const, args: [name] as const })), allowFailure: true, multicallAddress: MULTICALL3_ADDRESS }).catch(() => []),
    megaClient.multicall({ contracts: megaCandidates.map(([, name]) => ({ address: MEGA_NAMES_CONTRACT, abi: megaNamesAbi, functionName: "text" as const, args: [BigInt(namehash(name.toLowerCase())), "avatar"] as const })), allowFailure: true, multicallAddress: MULTICALL3_ADDRESS }).catch(() => []),
  ]) as [BatchResult[], BatchResult[], BatchResult[], BatchResult[]];

  const gweiWithIds = gweiCandidates.flatMap((entry, index) => {
    const id = successfulResult(gweiIdResults, index);
    return typeof id === "bigint" && id !== 0n ? [[entry, id] as const] : [];
  });
  const gweiAvatarResults = await mainnetClient.multicall({
    contracts: gweiWithIds.map(([, id]) => ({ address: GWEI_CONTRACT as Address, abi: GWEI_AVATAR_ABI, functionName: "text" as const, args: [id, "avatar"] as const })),
    allowFailure: true,
    multicallAddress: MULTICALL3_ADDRESS,
  }).catch(() => []) as BatchResult[];

  const ensRecords = new Map<string, string>();
  ensCandidates.forEach(([address], index) => {
    const record = decodeEnsAvatarRecord(successfulResult(ensResults, index));
    if (record) ensRecords.set(address, record);
  });
  const parsedEnsAvatars = await Promise.all([...ensRecords].map(async ([address, record]) => {
    try {
      return [address, await parseAvatarRecord(mainnetClient, { record })] as const;
    } catch {
      return [address, null] as const;
    }
  }));
  for (const [address, avatar] of parsedEnsAvatars) avatars.set(address, avatar);
  basenameCandidates.forEach(([address], index) => {
    const avatar = stringResult(basenameResults, index);
    if (avatar) avatars.set(address, avatar);
  });
  gweiWithIds.forEach(([[address]], index) => avatars.set(address, stringResult(gweiAvatarResults, index)));
  megaCandidates.forEach(([address], index) => avatars.set(address, stringResult(megaResults, index)));
  for (const [address] of named) if (!avatars.has(address)) avatars.set(address, null);
  return avatars;
}

export async function resolveEnsIdentitiesBatch(
  addresses: Address[],
  knownNames: ReadonlyMap<string, string> = new Map(),
): Promise<Map<string, BatchEnsIdentity>> {
  const unique = [...new Map(addresses.map((address) => [address.toLowerCase(), address])).values()];
  const names = await resolvePrimaryNames(unique, knownNames);
  const avatars = await resolveAvatars(names);
  return new Map(unique.map((address) => {
    const key = address.toLowerCase();
    return [key, { name: names.get(key) ?? null, avatar: avatars.get(key) ?? null }];
  }));
}
