/**
 * Wei Name Service SDK
 * Resolve .wei names with a single line of code
 *
 * Source: https://import.wei.domains/wei.js
 * Converted to TypeScript ES module for bundler compatibility
 *
 * Usage:
 *   import wei from '@/utils/wei'
 *   const addr = await wei.resolve('name.wei')
 *   const name = await wei.reverseResolve('0x...')
 */

export const CONTRACT = "0x0000000000696760E15f265e828DB644A0c242EB";
export const BASE_PORTAL = "0x49048044D57e1C92A77f79988d21Fa8fAF74E97e";

// Populated via config({ rpc }) — callers must set this before resolve/reverseResolve.
// Keeping this empty by default ensures CHAIN_REGISTRY (via ensUtils.getUserRpcUrl) is
// the single source of truth for the Ethereum mainnet RPC used by .wei resolution.
let RPC_ENDPOINTS: string[] = [];

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
  const data = new Uint8Array(64 + padded);
  data[31] = 0x20; // offset
  data[63] = len; // length
  data.set(utf8, 64);
  return bytesToHex(data);
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
async function ethCall(data: string): Promise<string> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: CONTRACT, data }, "latest"],
  });

  for (const rpc of RPC_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const json = await res.json();

      if (json.error) continue;
      return json.result;
    } catch {
      continue;
    }
  }
  throw new Error("All RPC endpoints failed");
}

/**
 * Check if a string is a .wei name
 */
export function isWei(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  return name.toLowerCase().endsWith(".wei");
}

/**
 * Resolve a .wei name to an address
 * @param name - e.g. 'vitalik.wei' or 'vitalik'
 * @returns Address or null if not found
 */
export async function resolve(name: string): Promise<string | null> {
  if (!name) return null;

  let label = name.toLowerCase().trim();
  if (label.endsWith(".wei")) label = label.slice(0, -4);
  if (!label) return null;

  try {
    // Get tokenId via computeId
    const idData = SEL.computeId + encodeString(label + ".wei").slice(2);
    const idResult = await ethCall(idData);
    const tokenId = decodeUint256(idResult);

    if (tokenId === 0n) return null;

    // Resolve tokenId to address
    const resolveData = SEL.resolve + encodeUint256(tokenId);
    const resolveResult = await ethCall(resolveData);

    return decodeAddress(resolveResult);
  } catch {
    return null;
  }
}

/**
 * Reverse resolve an address to a .wei name
 * @param address - Ethereum address
 * @returns Name or null if not set
 */
export async function reverseResolve(address: string): Promise<string | null> {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

  try {
    const data = SEL.reverseResolve + encodeAddress(address);
    const result = await ethCall(data);
    const name = decodeString(result);

    return name || null;
  } catch {
    return null;
  }
}

/**
 * Resolve any input - address passthrough, .wei names resolved
 * @param input - Address or .wei name
 */
export async function resolveAny(input: string): Promise<string | null> {
  if (!input) return null;
  if (/^0x[a-fA-F0-9]{40}$/.test(input)) return input;
  if (isWei(input) || !input.includes(".")) {
    return resolve(input);
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
 * @param recipient - Address, .wei name, or null for self
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
  config,
  bridgeToBase,
  CONTRACT,
  BASE_PORTAL,
};

export default wei;
