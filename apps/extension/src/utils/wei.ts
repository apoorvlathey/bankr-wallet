import { fetchRpcResult } from "@/chrome/network/rpcClient";

/**
 * Wei/Gwei Name Service SDK
 * Resolve .wei and .gwei names with a single line of code
 *
 * Source: https://import.wei.domains/wei.js
 * Gwei reference: https://github.com/lucadonnoh/gwei-names
 * Converted to TypeScript ES module for bundler compatibility
 *
 * Usage:
 *   import wei from '@/utils/wei'
 *   const addr = await wei.resolve('name.wei')
 *   const gweiAddr = await wei.resolve('name.gwei')
 *   const name = await wei.reverseResolve('0x...')
 */

export type NameServiceSuffix = ".wei" | ".gwei";

export const WEI_CONTRACT = "0x0000000000696760E15f265e828DB644A0c242EB";
export const GWEI_CONTRACT = "0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6";
export const CONTRACT = WEI_CONTRACT;
export const BASE_PORTAL = "0x49048044D57e1C92A77f79988d21Fa8fAF74E97e";

// Populated via config({ rpc }) — callers must set this before resolve/reverseResolve.
// Keeping this empty by default ensures CHAIN_REGISTRY (via ensUtils.getUserRpcUrl) is
// the single source of truth for the Ethereum mainnet RPC used by name resolution.
let RPC_ENDPOINTS: string[] = [];

const SERVICE_CONFIG: Record<NameServiceSuffix, { contract: string }> = {
  ".wei": { contract: WEI_CONTRACT },
  ".gwei": { contract: GWEI_CONTRACT },
};

const SUPPORTED_SUFFIXES: NameServiceSuffix[] = [".gwei", ".wei"];

// Function selectors
const SEL = {
  resolve: "0x4f896d4f", // resolve(uint256)
  reverseResolve: "0x9af8b7aa", // reverseResolve(address)
  computeId: "0xfb021939", // computeId(string)
};

// Minimal ABI encoding
function encodeString(str: string): string {
  const utf8 = new TextEncoder().encode(str);
  const len = utf8.length;
  const padded = Math.ceil(len / 32) * 32;
  const data = new Uint8Array(padded);
  data.set(utf8);
  const encodedData = bytesToHex(data).slice(2);
  return `0x${encodeUint256(32n)}${encodeUint256(BigInt(len))}${encodedData}`;
}

function encodeUint256(n: bigint | number): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// Minimal ABI decoding
function decodeAddress(hex: string | null): string | null {
  if (!hex || hex === "0x" || hex.length < 66) return null;
  const addr = "0x" + hex.slice(-40);
  return addr === "0x0000000000000000000000000000000000000000" ? null : addr;
}

function decodeString(hex: string | null): string | null {
  if (!hex || hex === "0x" || hex.length < 130) return null;
  hex = hex.slice(2);
  const len = parseInt(hex.slice(64, 128), 16);
  if (len === 0) return "";
  const strHex = hex.slice(128, 128 + len * 2);
  const bytes: number[] = [];
  for (let i = 0; i < strHex.length; i += 2) {
    bytes.push(parseInt(strHex.slice(i, i + 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function decodeUint256(hex: string | null): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex.slice(0, 66));
}

// RPC call with fallback
async function ethCall(data: string, contract: string): Promise<string> {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const result = await fetchRpcResult(
        rpc,
        "eth_call",
        [{ to: contract, data }, "latest"],
        { timeoutMs: 5_000, allowPrivateWithoutOrigin: true },
      );
      return typeof result === "string" ? result : "0x";
    } catch {
      continue;
    }
  }
  throw new Error("All RPC endpoints failed");
}

function getSupportedSuffix(name: string): NameServiceSuffix | null {
  if (!name || typeof name !== "string") return null;
  const lower = name.toLowerCase().trim();
  return SUPPORTED_SUFFIXES.find((suffix) => lower.endsWith(suffix)) ?? null;
}

function normalizeName(
  name: string,
  defaultSuffix: NameServiceSuffix = ".wei"
): { fullName: string; suffix: NameServiceSuffix } | null {
  if (!name || typeof name !== "string") return null;
  const normalized = name.toLowerCase().trim();
  if (!normalized) return null;

  const detectedSuffix = getSupportedSuffix(normalized);
  const suffix = detectedSuffix ?? defaultSuffix;
  const label = detectedSuffix
    ? normalized.slice(0, -detectedSuffix.length)
    : normalized;
  if (!label) return null;

  return {
    fullName: detectedSuffix ? normalized : `${label}${suffix}`,
    suffix,
  };
}

/**
 * Check if a string is a .wei name
 */
export function isWei(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  return name.toLowerCase().endsWith(".wei");
}

/**
 * Check if a string is a .gwei name
 */
export function isGwei(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  return name.toLowerCase().endsWith(".gwei");
}

/**
 * Check if a string is a supported WNS/GNS name
 */
export function isSupportedName(name: string): boolean {
  return getSupportedSuffix(name) !== null;
}

/**
 * Resolve a .wei or .gwei name to an address
 * @param name - e.g. 'vitalik.wei', 'vitalik.gwei', or 'vitalik'
 * @returns Address or null if not found
 */
export async function resolve(
  name: string,
  defaultSuffix: NameServiceSuffix = ".wei"
): Promise<string | null> {
  const normalized = normalizeName(name, defaultSuffix);
  if (!normalized) return null;

  try {
    const { contract } = SERVICE_CONFIG[normalized.suffix];

    // Get tokenId via computeId
    const idData = SEL.computeId + encodeString(normalized.fullName).slice(2);
    const idResult = await ethCall(idData, contract);
    const tokenId = decodeUint256(idResult);

    if (tokenId === 0n) return null;

    // Resolve tokenId to address
    const resolveData = SEL.resolve + encodeUint256(tokenId);
    const resolveResult = await ethCall(resolveData, contract);

    return decodeAddress(resolveResult);
  } catch {
    return null;
  }
}

/**
 * Reverse resolve an address to a .wei or .gwei name
 * @param address - Ethereum address
 * @returns Name or null if not set
 */
export async function reverseResolve(
  address: string,
  suffix: NameServiceSuffix = ".wei"
): Promise<string | null> {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

  try {
    const { contract } = SERVICE_CONFIG[suffix];
    const data = SEL.reverseResolve + encodeAddress(address);
    const result = await ethCall(data, contract);
    const name = decodeString(result);

    return name || null;
  } catch {
    return null;
  }
}

/**
 * Resolve any input - address passthrough, .wei/.gwei names resolved
 * @param input - Address, .wei name, or .gwei name
 */
export async function resolveAny(
  input: string,
  defaultSuffix: NameServiceSuffix = ".wei"
): Promise<string | null> {
  if (!input) return null;
  if (/^0x[a-fA-F0-9]{40}$/.test(input)) return input;
  if (isSupportedName(input) || !input.includes(".")) {
    return resolve(input, defaultSuffix);
  }
  return null;
}

/**
 * Configure SDK options
 * @param options - { rpc: string | string[] }
 */
export function config(options: { rpc?: string | string[] }): void {
  if (options.rpc) {
    RPC_ENDPOINTS = Array.isArray(options.rpc) ? options.rpc : [options.rpc];
  }
}

/**
 * Bridge ETH from Mainnet to Base
 * @param recipient - Address, .wei/.gwei name, or null for self
 * @param amount - Amount in ETH (e.g., '0.1')
 * @param signer - Ethers.js signer
 * @returns Transaction response
 */
export async function bridgeToBase(
  recipient: string | null,
  amount: string,
  signer: { getAddress: () => Promise<string>; sendTransaction: (tx: object) => Promise<unknown> }
): Promise<unknown> {
  if (!signer) throw new Error("Signer required");
  if (!amount) throw new Error("Amount required");

  // Resolve recipient
  let to: string;
  if (!recipient) {
    to = await signer.getAddress();
  } else if (/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    to = recipient;
  } else {
    const resolved = await resolve(recipient);
    if (!resolved) throw new Error("Could not resolve recipient");
    to = resolved;
  }

  // Parse amount to wei
  const value = BigInt(Math.floor(parseFloat(amount) * 1e18));
  if (value <= 0n) throw new Error("Amount must be positive");

  // ABI-encode depositTransaction(address,uint256,uint64,bool,bytes)
  // Selector: 0xe9e05c42
  const selector = "0xe9e05c42";
  const toParam = to.toLowerCase().slice(2).padStart(64, "0");
  const valueParam = value.toString(16).padStart(64, "0");
  const gasParam = (100000n).toString(16).padStart(64, "0");
  const isCreationParam = "0".padStart(64, "0");
  const dataOffsetParam = (160).toString(16).padStart(64, "0"); // 5 * 32 bytes
  const dataLengthParam = "0".padStart(64, "0");

  const data =
    selector +
    toParam +
    valueParam +
    gasParam +
    isCreationParam +
    dataOffsetParam +
    dataLengthParam;

  // Send transaction
  return signer.sendTransaction({
    to: BASE_PORTAL,
    data,
    value,
  });
}

// Default export matching SDK style
const wei = {
  resolve,
  reverseResolve,
  resolveAny,
  isWei,
  isGwei,
  isSupportedName,
  config,
  bridgeToBase,
  CONTRACT,
  WEI_CONTRACT,
  GWEI_CONTRACT,
  BASE_PORTAL,
};

export default wei;
