import {
  createPublicClient,
  http,
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
    transport: http(rpcUrl),
  });
}

async function getBaseClient() {
  const rpcUrl = await getUserRpcUrl(base.id);
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
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
    transport: http(rpcUrl),
  });
}

// ============================================================================
// Helpers
// ============================================================================

export const isResolvableName = (value: string): boolean => {
  if (!value || value.length === 0) return false;
  return value.includes(".") && !value.toLowerCase().startsWith("0x");
};

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
    return name as string;
  } catch {
    return null;
  }
};

export const resolveNameToAddress = async (
  name: string
): Promise<Address | null> => {
  // Handle .wei names via WNS — let RPC errors propagate
  if (wei.isWei(name)) {
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
      return basename as string;
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
    return name;
  } catch {
    return null;
  }
};

const getWeiName = async (address: string): Promise<string | null> => {
  try {
    // Configure Wei SDK to use user's Ethereum RPC instead of hardcoded defaults
    const rpcUrl = await getUserRpcUrl(mainnet.id);
    wei.config({ rpc: rpcUrl });
    return await wei.reverseResolve(address);
  } catch {
    return null;
  }
};

export const resolveAddressToName = async (
  address: string
): Promise<string | null> => {
  try {
    const [ensName, basename, weiName, megaName] = await Promise.all([
      getEnsName(address),
      getBasename(address as Address),
      getWeiName(address),
      getMegaName(address),
    ]);
    // Priority: ENS > Basename > WNS > Mega
    return ensName || basename || weiName || megaName || null;
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
  if (isBasename(name)) {
    const basenameAvatar = await getBasenameAvatar(name);
    if (basenameAvatar) return basenameAvatar;
    return await getEnsAvatar(name);
  }
  return await getEnsAvatar(name);
};

// ============================================================================
// Combined Identity Resolution (ENS > Basename > WNS > Mega)
// ============================================================================

/**
 * Resolves name + avatar for an address with explicit priority:
 * ENS > Basename > WNS > Mega
 * - Resolves all name services in parallel for speed
 * - If ENS name exists, uses ENS name + ENS avatar
 * - Falls back to Basename name + Basename avatar
 * - Falls back to WNS name (no avatar support for .wei names)
 * - Falls back to Mega name + Mega avatar (via text record)
 */
export const resolveEnsIdentity = async (
  address: string
): Promise<{ name: string | null; avatar: string | null }> => {
  try {
    const [ensName, basename, weiName, megaName] = await Promise.all([
      getEnsName(address),
      getBasename(address as Address),
      getWeiName(address),
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

    // Fall back to WNS (no avatar support)
    if (weiName) {
      return { name: weiName, avatar: null };
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
