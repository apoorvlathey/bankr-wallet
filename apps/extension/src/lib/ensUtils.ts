import {
  createPublicClient,
  Hex,
  Address,
  encodePacked,
  keccak256,
  namehash,
} from "viem";
import { mainnet, base } from "viem/chains";
import { normalize } from "viem/ens";
import { L2ResolverAbi } from "./L2ResolverAbi";
import wei from "@/utils/wei";
import {
  isMega,
  megaNamesAbi,
  MEGA_NAMES_CONTRACT,
  MEGAETH_CHAIN_ID,
} from "@/utils/mega";
import { getStoredRpcUrl } from "@/lib/chains";
import { secureHttpTransport } from "@/chrome/network/rpcClient";

// ============================================================================
// Constants
// ============================================================================

const BASENAME_L2_RESOLVER_ADDRESS =
  "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;

// ============================================================================
// Public Clients (use user-configured RPCs from storage)
// ============================================================================

// Resolves via chainRegistry → user override > registry default. Throws if the
// chain isn't registered; only call with chain IDs known to be in CHAIN_REGISTRY.
async function getUserRpcUrl(chainId: number): Promise<string> {
  const rpcUrl = await getStoredRpcUrl(chainId).catch(() => undefined);
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }
  return rpcUrl;
}

async function getMainnetClient() {
  const rpcUrl = await getUserRpcUrl(mainnet.id);
  return createPublicClient({
    chain: mainnet,
    transport: secureHttpTransport(rpcUrl, { timeout: 8_000, retryCount: 0 }),
  });
}

async function getBaseClient() {
  const rpcUrl = await getUserRpcUrl(base.id);
  return createPublicClient({
    chain: base,
    transport: secureHttpTransport(rpcUrl, { timeout: 8_000, retryCount: 0 }),
  });
}

async function getMegaEthClient() {
  const rpcUrl = await getUserRpcUrl(MEGAETH_CHAIN_ID);
  return createPublicClient({
    chain: {
      id: MEGAETH_CHAIN_ID,
      name: "MegaETH",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: secureHttpTransport(rpcUrl, { timeout: 8_000, retryCount: 0 }),
  });
}

// ============================================================================
// Helpers
// ============================================================================

export const isResolvableName = (value: string): boolean => {
  if (!value || value.length === 0) return false;
  return value.includes(".") && !value.toLowerCase().startsWith("0x");
};

/**
 * Unicode characters that must NEVER appear in a name we render to the user:
 *  - C0/C1 control chars (break rendering)
 *  - Zero-width / invisible marks (hide content inside a name)
 *  - BiDi overrides + isolates (reverse displayed text — U+202E "Trojan Source")
 *  - Line/paragraph separators (split the rendered name across lines)
 *  - Object Replacement Character (placeholder for missing glyphs)
 *
 * Any resolved name (ENS / Basename / Wei / Gwei / Mega) containing one of these is
 * treated as hostile and discarded. We do NOT try to clean / repair the name —
 * showing a partial name is worse than showing the raw address.
 */
// Written with \u escape sequences only — the literal characters would
// themselves render the source file dangerously (U+202E reverses surrounding
// text; U+2028 terminates lines from a JS lexer's perspective). Do not edit
// this regex by pasting the raw characters.
const HAZARDOUS_NAME_CHARS_RE =
// eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2028\u2029\u2066-\u2069\uFEFF\uFFFC]/;

const PRINTABLE_ASCII_RE = /^[\x21-\x7e]+$/;

/**
 * Sanitize an address-to-name resolution result for display.
 *
 * Returns:
 *  - `null` if the name is empty, exceeds DNS length (253), or contains
 *    hazardous Unicode. Callers fall back to showing the raw address.
 *  - the ASCII / IDN-encoded ("xn--…") form if the name contained non-ASCII
 *    characters. This forces visually-confusable Unicode (Cyrillic 'а' that
 *    looks like Latin 'a', etc.) to render as its unambiguous punycode label
 *    so users can tell at a glance that the name is not pure-ASCII.
 *  - the name unchanged when it's already pure printable ASCII.
 *
 * Defense against reverse-resolution spoofing. An attacker who owns
 * `apple‐.eth` (with a combining mark) or a Cyrillic-Latin homoglyph name
 * can register it cheaply on ENS/Basenames/WNS/GNS/Mega and dangle it on a vanity
 * address; if a victim ever transacts with that address, the reverse lookup
 * decorates every future confirmation surface with a trusted-looking name.
 * Hard-rejecting hazardous chars and forcing punycode for non-ASCII names
 * closes both vectors without engineering full Unicode-confusable detection.
 */
export function sanitizeResolvedName(name: string | null | undefined): string | null {
  if (!name || typeof name !== "string") return null;
  if (name.length === 0 || name.length > 253) return null;
  if (HAZARDOUS_NAME_CHARS_RE.test(name)) return null;
  // Pure printable-ASCII fast path — the common case for ENS/Basenames.
  if (PRINTABLE_ASCII_RE.test(name)) return name;
  // Any non-ASCII name is forced through the URL parser's IDN encoder; the
  // resulting hostname is the canonical punycode form. If encoding fails or
  // the result is itself non-ASCII (shouldn't happen with a conforming URL
  // parser), refuse to display.
  try {
    const ascii = new URL(`http://${name}/`).hostname;
    if (ascii && PRINTABLE_ASCII_RE.test(ascii)) return ascii;
    return null;
  } catch {
    return null;
  }
}

const isBasename = (name: string): boolean => {
  return name.toLowerCase().endsWith(".base.eth");
};

const convertChainIdToCoinType = (chainId: number): string => {
  if (chainId === mainnet.id) return "addr";
  const cointype = (0x80000000 | chainId) >>> 0;
  return cointype.toString(16).toLocaleUpperCase();
};

const convertReverseNodeToBytes = (
  address: Address,
  chainId: number
): Hex => {
  const addressFormatted = address.toLocaleLowerCase() as Address;
  const addressNode = keccak256(addressFormatted.substring(2) as Address);
  const chainCoinType = convertChainIdToCoinType(chainId);
  const baseReverseNode = namehash(
    `${chainCoinType.toLocaleUpperCase()}.reverse`
  );
  const addressReverseNode = keccak256(
    encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode])
  );
  return addressReverseNode;
};

// ============================================================================
// Forward Resolution (Name → Address)
// ============================================================================

const resolveMegaName = async (
  name: string
): Promise<Address | null> => {
  try {
    const client = await getMegaEthClient();
    const tokenId = BigInt(namehash(name.toLowerCase()));
    const ZERO = "0x0000000000000000000000000000000000000000";

    // Primary: ownerOf (ERC-721 owner is the resolved address)
    try {
      const owner = await client.readContract({
        abi: megaNamesAbi,
        address: MEGA_NAMES_CONTRACT,
        functionName: "ownerOf",
        args: [tokenId],
      });
      if (owner && owner !== ZERO) return owner as Address;
    } catch {
      // Token may not exist — fall through to addr
    }

    // Fallback: explicit addr mapping (for subdomains or custom setAddr)
    const address = await client.readContract({
      abi: megaNamesAbi,
      address: MEGA_NAMES_CONTRACT,
      functionName: "addr",
      args: [tokenId],
    });
    if (!address || address === ZERO) return null;
    return address as Address;
  } catch {
    return null;
  }
};

const getMegaName = async (
  address: string
): Promise<string | null> => {
  try {
    const client = await getMegaEthClient();
    const name = await client.readContract({
      abi: megaNamesAbi,
      address: MEGA_NAMES_CONTRACT,
      functionName: "getName",
      args: [address as Address],
    });
    if (!name || name.length === 0) return null;
    return sanitizeResolvedName(name as string);
  } catch {
    return null;
  }
};

export const resolveNameToAddress = async (
  name: string
): Promise<Address | null> => {
  // Handle .wei/.gwei names via WNS/GNS. Missing mainnet RPC still surfaces
  // from getUserRpcUrl; service-level misses/timeouts resolve as null.
  if (wei.isSupportedName(name)) {
    const rpcUrl = await getUserRpcUrl(mainnet.id);
    wei.config({ rpc: rpcUrl });
    const address = await wei.resolve(name);
    return address as Address | null;
  }

  // Handle .mega names via MegaNames (handles its own errors, returns null for not-found)
  if (isMega(name)) {
    return await resolveMegaName(name);
  }

  // ENS handles .eth, .base.eth, and other names
  // normalize() throws for invalid name format — return null for that (not an RPC issue)
  let normalizedName: string;
  try {
    normalizedName = normalize(name);
  } catch {
    return null;
  }

  // Let RPC errors (429, timeouts, etc.) propagate so callers can show actionable feedback
  const client = await getMainnetClient();
  return await client.getEnsAddress({ name: normalizedName });
};

// ============================================================================
// Reverse Resolution (Address → Name)
// ============================================================================

const getBasename = async (address: Address): Promise<string | null> => {
  try {
    const client = await getBaseClient();
    const addressReverseNode = convertReverseNodeToBytes(address, base.id);
    const basename = await client.readContract({
      abi: L2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      functionName: "name",
      args: [addressReverseNode],
    });

    if (basename && basename.length > 0) {
      return sanitizeResolvedName(basename as string);
    }
    return null;
  } catch {
    return null;
  }
};

const getEnsName = async (address: string): Promise<string | null> => {
  try {
    const client = await getMainnetClient();
    const name = await client.getEnsName({
      address: address as Hex,
    });
    return sanitizeResolvedName(name);
  } catch {
    return null;
  }
};

const getWeiName = async (
  address: string,
  suffix: ".wei" | ".gwei" = ".wei"
): Promise<string | null> => {
  try {
    // Configure name SDK to use user's Ethereum RPC instead of hardcoded defaults
    const rpcUrl = await getUserRpcUrl(mainnet.id);
    wei.config({ rpc: rpcUrl });
    return sanitizeResolvedName(await wei.reverseResolve(address, suffix));
  } catch {
    return null;
  }
};

const getGweiName = async (address: string): Promise<string | null> => {
  return getWeiName(address, ".gwei");
};

export const resolveAddressToName = async (
  address: string
): Promise<string | null> => {
  try {
    const [ensName, basename, weiName, gweiName, megaName] = await Promise.all([
      getEnsName(address),
      getBasename(address as Address),
      getWeiName(address),
      getGweiName(address),
      getMegaName(address),
    ]);
    // Priority: ENS > Basename > WNS > GNS > Mega
    return ensName || basename || weiName || gweiName || megaName || null;
  } catch (error) {
    console.error("Error resolving address to name:", error);
    return null;
  }
};

// ============================================================================
// Avatar Resolution
// ============================================================================

const getEnsAvatar = async (ensName: string): Promise<string | null> => {
  try {
    const client = await getMainnetClient();
    const avatar = await client.getEnsAvatar({
      name: normalize(ensName),
    });
    return avatar;
  } catch {
    return null;
  }
};

const getBasenameAvatar = async (
  basename: string
): Promise<string | null> => {
  try {
    const client = await getBaseClient();
    const avatar = await client.readContract({
      abi: L2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      functionName: "text",
      args: [namehash(basename), "avatar"],
    });

    if (avatar && avatar.length > 0) {
      return avatar as string;
    }
    return null;
  } catch {
    return null;
  }
};

const getMegaAvatar = async (
  megaName: string
): Promise<string | null> => {
  try {
    const client = await getMegaEthClient();
    const tokenId = BigInt(namehash(megaName.toLowerCase()));
    const avatar = await client.readContract({
      abi: megaNamesAbi,
      address: MEGA_NAMES_CONTRACT,
      functionName: "text",
      args: [tokenId, "avatar"],
    });
    if (avatar && avatar.length > 0) return avatar as string;
    return null;
  } catch {
    return null;
  }
};

export const getNameAvatar = async (
  name: string
): Promise<string | null> => {
  if (isMega(name)) {
    return await getMegaAvatar(name);
  }
  if (wei.isSupportedName(name)) {
    return null;
  }
  if (isBasename(name)) {
    const basenameAvatar = await getBasenameAvatar(name);
    if (basenameAvatar) return basenameAvatar;
    return await getEnsAvatar(name);
  }
  return await getEnsAvatar(name);
};

// ============================================================================
// Combined Identity Resolution (ENS > Basename > WNS > GNS > Mega)
// ============================================================================

/**
 * Resolves name + avatar for an address with explicit priority:
 * ENS > Basename > WNS > GNS > Mega
 * - Resolves all name services in parallel for speed
 * - If ENS name exists, uses ENS name + ENS avatar
 * - Falls back to Basename name + Basename avatar
 * - Falls back to WNS/GNS name (no avatar support for .wei/.gwei names)
 * - Falls back to Mega name + Mega avatar (via text record)
 */
export const resolveEnsIdentity = async (
  address: string
): Promise<{ name: string | null; avatar: string | null }> => {
  try {
    const [ensName, basename, weiName, gweiName, megaName] = await Promise.all([
      getEnsName(address),
      getBasename(address as Address),
      getWeiName(address),
      getGweiName(address),
      getMegaName(address),
    ]);

    // ENS takes priority
    if (ensName) {
      const avatar = await getEnsAvatar(ensName);
      return { name: ensName, avatar };
    }

    // Fall back to Basename
    if (basename) {
      const avatar = await getBasenameAvatar(basename);
      return { name: basename, avatar };
    }

    // Fall back to WNS/GNS (no avatar support)
    if (weiName) {
      return { name: weiName, avatar: null };
    }
    if (gweiName) {
      return { name: gweiName, avatar: null };
    }

    // Fall back to Mega
    if (megaName) {
      const avatar = await getMegaAvatar(megaName);
      return { name: megaName, avatar };
    }

    return { name: null, avatar: null };
  } catch (error) {
    console.error("Error resolving identity for", address, error);
    return { name: null, avatar: null };
  }
};
