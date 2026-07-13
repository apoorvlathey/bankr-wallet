/**
 * Proxy resolver — given (chainId, address) where the address has no direct
 * ERC-7730 descriptor in the registry, detect whether the contract is a known
 * proxy pattern and return its implementation address. Lets the clear-signing
 * resolver fall back to the implementation's descriptor (every Safe proxy
 * shares the singleton's `execTransaction` format, every UUPS / Transparent
 * proxy shares its implementation's selectors, etc.).
 *
 * Patterns covered:
 *   - **Safe Proxy** — singleton at literal storage slot 0 (matches every
 *     Safe deployed via SafeProxyFactory).
 *   - **EIP-1967 logic slot** — covers OZ Transparent + UUPS + most modern
 *     upgradeable proxies.
 *   - **EIP-1967 beacon slot** — beacon proxies. We do one follow-up
 *     `implementation()` call on the beacon to get the actual impl.
 *
 * NOT covered (yet): ERC-1167 minimal proxies (bytecode pattern, needs
 * `eth_getCode`), EIP-2535 Diamond (per-selector facets, needs `facetAddress`
 * lookup per call). Add when a real registry entry needs them.
 */

import { createPublicClient, type PublicClient, type Hex } from "viem";
import { getRpcUrl } from "../transactions/rpcConfig";
import { secureHttpTransport } from "./rpcClient";

/** EIP-1967 logic slot: `bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)` */
const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
/** EIP-1967 beacon slot: `bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1)` */
const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as const;
/** Safe stores the singleton at the literal slot 0 of its Proxy contract. */
const SAFE_SINGLETON_SLOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** `function implementation() external view returns (address)` — beacon ABI. */
const BEACON_IMPL_ABI = [
  {
    type: "function",
    name: "implementation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const RPC_TIMEOUT = 8_000;

export type ProxyKind = "safe" | "eip1967" | "beacon";

export interface ProxyResolution {
  implementation: string;
  kind: ProxyKind;
}

const clientCache = new Map<number, { rpcUrl: string; client: PublicClient }>();

async function getClient(chainId: number): Promise<PublicClient | null> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;
  const cached = clientCache.get(chainId);
  if (cached && cached.rpcUrl === rpcUrl) return cached.client;
  const client = createPublicClient({
    transport: secureHttpTransport(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 1 }),
  });
  clientCache.set(chainId, { rpcUrl, client });
  return client;
}

/**
 * Decode a 32-byte storage word as an address: take the last 20 bytes, treat
 * all-zero as "no value". Returns the lowercased `0x…` form or null.
 */
function slotToAddress(slot: Hex | undefined | null): string | null {
  if (!slot || typeof slot !== "string" || !slot.startsWith("0x")) return null;
  // Strip 0x, pad to 64 (some RPCs return shortened hex for small values).
  const body = slot.slice(2).padStart(64, "0");
  if (/^0+$/.test(body)) return null;
  const addr = `0x${body.slice(-40)}`.toLowerCase();
  if (/^0x0+$/.test(addr)) return null;
  return addr;
}

/**
 * Try to resolve `address` to an implementation address. Returns null when
 * the address doesn't look like a proxy or the RPC isn't reachable. Reads
 * all three candidate slots in parallel (single batched RPC round-trip on
 * providers that support it; three sequential calls otherwise — still cheap).
 */
export async function resolveProxyImplementation(
  chainId: number,
  address: string,
): Promise<ProxyResolution | null> {
  const tag = `[proxy-resolver] ${chainId}:${address}`;
  const client = await getClient(chainId);
  if (!client) {
    console.log(`${tag} no RPC configured for chain — skipping`);
    return null;
  }
  const target = address as Hex;

  let safeSlot: Hex | null = null;
  let logicSlot: Hex | null = null;
  let beaconSlot: Hex | null = null;
  try {
    [safeSlot, logicSlot, beaconSlot] = (await Promise.all([
      client.getStorageAt({ address: target, slot: SAFE_SINGLETON_SLOT }),
      client.getStorageAt({ address: target, slot: EIP1967_IMPLEMENTATION_SLOT }),
      client.getStorageAt({ address: target, slot: EIP1967_BEACON_SLOT }),
    ])) as [Hex | null, Hex | null, Hex | null];
  } catch (err) {
    console.warn(`${tag} storage read failed:`, err);
    return null;
  }
  console.log(`${tag} slots:`, {
    safe_slot0: safeSlot,
    eip1967_logic: logicSlot,
    eip1967_beacon: beaconSlot,
  });

  // EIP-1967 takes priority over Safe slot 0 — slot 0 collides with the first
  // declared storage variable of many non-Safe contracts and would yield a
  // garbage "implementation" address. Beacon takes priority over slot 0 too.
  const eip1967 = slotToAddress(logicSlot);
  if (eip1967) {
    console.log(`${tag} ✓ EIP-1967 logic slot → ${eip1967}`);
    return { implementation: eip1967, kind: "eip1967" };
  }

  const beacon = slotToAddress(beaconSlot);
  if (beacon) {
    console.log(`${tag} EIP-1967 beacon slot → ${beacon}; reading implementation()…`);
    try {
      const impl = (await client.readContract({
        address: beacon as Hex,
        abi: BEACON_IMPL_ABI,
        functionName: "implementation",
      })) as string;
      if (impl && /^0x[a-fA-F0-9]{40}$/.test(impl)) {
        const lower = impl.toLowerCase();
        console.log(`${tag} ✓ beacon implementation() → ${lower}`);
        return { implementation: lower, kind: "beacon" };
      }
      console.log(`${tag} ✗ beacon implementation() returned non-address`, impl);
    } catch (err) {
      console.warn(`${tag} beacon impl read failed for ${beacon}:`, err);
    }
  }

  // Safe-specific slot 0. Validate it looks like a Safe singleton by checking
  // it's a non-precompile address — slot 0 IS the first variable on many
  // contracts (LP pairs, ERC-20s, etc.) so without additional sanity we'd
  // happily resolve every USDT call to "0x000...01". Heuristic: at least one
  // upper-nibble bit must be set (the singleton addresses we care about all
  // have high-entropy addresses; precompiles + literal small numbers don't).
  const safeImpl = slotToAddress(safeSlot);
  if (safeImpl) {
    if (looksLikeRealAddress(safeImpl)) {
      console.log(`${tag} ✓ Safe slot 0 → ${safeImpl}`);
      return { implementation: safeImpl, kind: "safe" };
    }
    console.log(
      `${tag} slot 0 has value ${safeImpl} but looks like a non-address storage variable — skipping`,
    );
  }

  console.log(`${tag} ✗ no proxy pattern matched`);
  return null;
}

/**
 * Cheap "not obviously a number in disguise" check. Singleton + impl addresses
 * derived from CREATE2 / deploy nonces have substantial entropy; precompiles
 * and storage-variable-bleed-through values (`0x000…01`, the magic 1 from a
 * boolean, etc.) do not. Reject if the address has fewer than 5 non-zero nibbles
 * in the leading 20 nibbles (i.e. the top half looks like padding).
 */
function looksLikeRealAddress(addr: string): boolean {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return false;
  const head = addr.slice(2, 22);
  let nonZero = 0;
  for (const ch of head) if (ch !== "0") nonZero++;
  return nonZero >= 5;
}
