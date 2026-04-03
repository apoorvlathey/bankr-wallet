import fs from "fs/promises";
import path from "path";

// Chain IDs to fetch dapps for (from swiss-knife's walletChains)
const CHAIN_IDS = [
  { id: 1, name: "Ethereum" },
  { id: 8453, name: "Base" },
  { id: 137, name: "Polygon" },
  { id: 130, name: "Unichain" },
  { id: 42161, name: "Arbitrum" },
  { id: 10, name: "Optimism" },
  { id: 56, name: "BSC" },
  { id: 43114, name: "Avalanche" },
  { id: 7777777, name: "Zora" },
  { id: 42220, name: "Celo" },
  { id: 100, name: "Gnosis" },
  { id: 57073, name: "Ink" },
  { id: 369, name: "PulseChain" },
  { id: 1868, name: "Soneium" },
  { id: 146, name: "Sonic" },
];

interface DappInfo {
  id: number;
  name: string;
  description: string;
  url: string;
  iconUrl: string;
  chains: number[];
  categories?: string[];
  /** Whether the dapp auto-connects the wallet when opened in iframe.
   *  true = tested & auto-connects, false = tested & does NOT, undefined = untested */
  autoConnect?: boolean;
}

interface SafeApiResponse {
  id: number;
  name: string;
  description: string;
  url: string;
  iconUrl: string;
  networks: number[];
}

// Disabled dapp IDs (don't work in iframes, deprecated, or Safe-internal)
const DISABLED_IDS = [
  // Updated chains/URL in custom
  38,
  74, // CoW Swap (custom override with referral URL)
  88,
  44,
  20,
  196,
  87,
  135, // Drips (blocks iframes)
  122,
  142,
  155, // Jumper Exchange (blocks iframes)
  // Enzyme (renamed in custom)
  51, // Enzyme Finance (all chains — custom override)
  parseInt(`51${42161}`), // Enzyme - Arbitrum
  parseInt(`51${8453}`), // Enzyme - Base
  // Safe default apps
  29,
  11,
  // Deprecated
  89,
  101, // Polynomial Earn Vaults (shutdown)
  94, // Maker Governance Portal (deprecated)
  167, // Nexus Mutual v2 (duplicate of v1)
  200, // Balancer Pool Creator (duplicate of Balancer)
  26, // Reflexer (global settlement completed, protocol wound down)
  117, // LSD Networks / Stakehouse (site returns 403)
  194, // DYAD Stablecoin (domain hijacked)
  // Random dapps
  163, // MilkmApp
  // Not supported in iframe
  129,
  1,
  186,
  18,
  75,
  49,
  61,
  17,
  67,
  174,
  66,
  77,
  128,
  169,
  109,
  184,
  127,
  71,
  123,
  171,
  192,
  141,
  33,
  43,
  205,
  207,
  165,
  28,
  22,
  12,
  13,
  162,
  2,
  159,
  23,
  178,
  14,
  62,
  8,
  47,
  57,
  179,
  52,
  37,
  76,
  70,
  83,
  81,
  65,
  156,
  168,
  72,
  73,
  98,
  85,
  31,
  110,
  108,
  189,
  130,
  131,
  121,
  126,
  176,
  132,
  133,
  119,
  124,
  125,
  116,
  48,
  143,
  182,
  177,
  144,
  190,
  149,
  140,
  193,
  146,
  195,
  198,
  199,
  209,
  68,
  150,
  40,
  161,
  46, // Origin Unified Defi (blocks iframes)
  175, // TokenOps (URL changed, custom override)
  92, // OpenOcean (blocks iframes)
  210, // Arrakis Pro (blocks iframes)
  102, // Wombat Exchange (blocks iframes)
  97, // Timeless Finance (no longer active)
  90, // Enzyme Finance Polygon (renamed in custom)
  35, // Sushi (updated chains in custom)
];

// Custom dapps with corrected chain support
const CUSTOM_DAPPS: DappInfo[] = [
  {
    id: 38,
    name: "Uniswap",
    description: "Swap or provide liquidity on the Uniswap Protocol",
    url: "https://app.uniswap.org",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/38/icon.png",
    chains: [1, 130, 8453, 42161, 137, 10, 56, 43114, 7777777, 42220],
  },
  {
    id: 74,
    name: "CoW Swap",
    description:
      "CoW Swap finds the lowest prices from all decentralized exchanges and DEX aggregators & saves you more with p2p trading and protection from MEV",
    url: "https://swap.cow.fi?ref=COW-WALLETCHAN",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/74/icon.png",
    chains: [1, 8453, 137, 42161, 56, 43114, 100],
  },
  {
    id: 88,
    name: "Revoke.cash",
    description: "Manage and revoke your token allowances with Revoke.cash",
    url: "https://revoke.cash/",
    iconUrl:
      "https://www.google.com/s2/favicons?domain=revoke.cash&sz=128",
    chains: [
      1, 8453, 42161, 43114, 56, 100, 57073, 10, 137, 130, 7777777, 369, 1868,
      146,
    ],
  },
  {
    id: 44,
    name: "Yearn",
    description: "The yield protocol for digital assets",
    url: "https://yearn.fi",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/44/icon.png",
    chains: [1, 42161, 8453, 137, 146],
  },
  {
    id: 20,
    name: "Curve Finance",
    description:
      "Decentralized exchange liquidity pool designed for extremely efficient stablecoin trading and low-risk income for liquidity providers",
    url: "https://www.curve.finance/",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/b979c596-ffd7-43ca-b732-4057479dd282/icon.png",
    chains: [1, 8453, 42161, 43114, 56, 100, 57073, 10, 137, 146],
  },
  {
    id: 196,
    name: "sky.money",
    description: "Rewards, savings, upgrade, and trade",
    url: "https://app.sky.money/",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/abf3c7f9-baa3-42bf-9782-d77433e22fc1/icon.png",
    chains: [1, 42161, 8453, 10, 130],
  },
  {
    id: 87,
    name: "Aura Finance",
    description: "Boosting DeFi yield potential and governance power",
    url: "https://app.aura.finance/",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/87/icon.png",
    chains: [1, 42161, 43114, 8453, 100, 10, 137],
  },
  // Drips (135) removed — blocks iframes
  {
    id: 51,
    name: "Enzyme (ETH)",
    description: "Onchain Asset Management",
    url: "https://app.enzyme.finance",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/51/icon.png",
    chains: [1],
  },
  {
    id: 90,
    name: "Enzyme (Polygon)",
    description: "Onchain Asset Management",
    url: "https://app.enzyme.finance/?network=polygon",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/90/icon.png",
    chains: [137],
  },
  {
    id: 122,
    name: "dump.services",
    description: "Dump your tokens like a pro",
    url: "https://dump.services/",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/122/icon.png",
    chains: [1, 137],
  },
  {
    id: 142,
    name: "Pods Yield",
    description:
      "Earn more yield for your DAO treasury without risking the principal",
    url: "https://app.pods.finance",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/142/icon.png",
    chains: [1, 8453],
  },
  // Jumper Exchange (155) removed — blocks iframes
  {
    id: 1753279954,
    name: "DefiLlama Swap",
    description:
      "LlamaSwap looks for the best route for your trade among a variety of Dex Aggregators, guaranteeing you the best execution prices in DeFi.",
    url: "https://swap.defillama.com/",
    iconUrl:
      "https://swap.defillama.com/_next/static/media/loader.268d236d.png",
    chains: [1, 8453, 42161, 43114, 56, 42220, 100, 10, 137, 146, 130],
  },
  {
    id: 1767000293,
    name: "Ethereum Follow Protocol",
    description: "The onchain social graph protocol for Ethereum accounts",
    url: "https://efp.app",
    iconUrl: "https://metadata.ens.domains/mainnet/avatar/efp.eth",
    chains: [1, 10, 8453],
  },
  {
    id: 35,
    name: "Sushi",
    description:
      "Be a DeFi Chef with Sushi. Swap, earn, stack yields, lend, borrow, leverage all on one decentralized, community driven platform.",
    url: "https://www.sushi.com/",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/35/icon.png",
    chains: [1, 8453, 42161, 137, 10, 56, 43114, 42220, 100, 146],
  },
  {
    id: 175,
    name: "TokenOps",
    description: "Create, track, and automate token vesting schedules.",
    url: "https://claim.tokenops.xyz/",
    iconUrl:
      "https://safe-transaction-assets.safe.global/safe_apps/06b0ba7a-1ecb-46d5-97dc-7feab3f9165c/icon.png",
    chains: [1, 8453, 137, 42161, 10, 56, 43114, 100],
  },
];

// Priority ordering for dapps (first = top of page)
const DAPPS_PRIORITY = [
  38, // Uniswap
  1753279954, // DefiLlama Swap
  155, // Jumper Exchange
  44, // Yearn
  151, // Aerodrome Finance
  74, // CoW Swap
  88, // Revoke.cash
  21, // DeFi Saver
  20, // Curve Finance
  196, // sky.money
  93, // Balancer
  35, // Sushi
  91, // PancakeSwap
  1767000293, // EFP
  34, // Summer.fi
  25, // Velora (formerly ParaSwap)
  87, // Aura Finance
  138, // Spark
  173, // Arcadia Finance
  54, // Bancor Network
  152, // Velodrome Finance
  160, // Everstake
  84, // Tenderize
  51, // Enzyme Finance (ethereum)
  90, // Enzyme Finance (polygon)
  36, // DODO
];

function transformDapp(dapp: SafeApiResponse, chainId: number): DappInfo {
  const chains = dapp.networks || [];
  if (!chains.includes(chainId)) {
    chains.push(chainId);
  }
  return {
    id: dapp.id,
    name: dapp.name,
    description: dapp.description,
    url: dapp.url,
    iconUrl: dapp.iconUrl,
    chains,
  };
}

async function fetchDappsForChain(chainId: number): Promise<DappInfo[]> {
  try {
    const response = await fetch(
      `https://safe-client.safe.global/v1/chains/${chainId}/safe-apps?clientUrl=https://app.safe.global`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://app.safe.global",
          Referer: "https://app.safe.global/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
      },
    );
    if (!response.ok) {
      console.error(`HTTP ${response.status} for chain ${chainId}`);
      return [];
    }
    const data: SafeApiResponse[] = await response.json();
    return data.map((dapp) => transformDapp(dapp, chainId));
  } catch (error) {
    console.error(`Error fetching dapps for chain ${chainId}:`, error);
    return [];
  }
}

async function downloadIcon(
  iconUrl: string,
  id: number,
  iconsDir: string,
): Promise<string> {
  const localPath = `/images/dapp-icons/${id}.png`;
  const filePath = path.join(iconsDir, `${id}.png`);

  try {
    const response = await fetch(iconUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    return localPath;
  } catch {
    // Fallback: keep remote URL if download fails
    return iconUrl;
  }
}

async function main() {
  // Read existing dapps.json to preserve manually-set categories
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const outputPath = path.join(
    scriptDir,
    "..",
    "app",
    "os",
    "data",
    "dapps.json",
  );
  const iconsDir = path.join(scriptDir, "..", "public", "images", "dapp-icons");
  await fs.mkdir(iconsDir, { recursive: true });
  let existingCategories: Record<number, string[]> = {};
  let existingAutoConnect: Record<number, boolean> = {};
  try {
    const existing: DappInfo[] = JSON.parse(
      await fs.readFile(outputPath, "utf-8"),
    );
    existing.forEach((d) => {
      if (d.categories?.length) existingCategories[d.id] = d.categories;
      if (d.autoConnect !== undefined) existingAutoConnect[d.id] = d.autoConnect;
    });
  } catch {
    // No existing file — fresh run
  }

  const uniqueDapps = new Map<number, DappInfo>();

  for (const chain of CHAIN_IDS) {
    console.log(`Fetching dapps for ${chain.name} (${chain.id})...`);
    const dapps = await fetchDappsForChain(chain.id);

    dapps.forEach((dapp) => {
      if (!uniqueDapps.has(dapp.id)) {
        uniqueDapps.set(dapp.id, { ...dapp, chains: dapp.chains || [] });
      } else {
        const existing = uniqueDapps.get(dapp.id)!;
        const mergedChains = Array.from(
          new Set([...(existing.chains || []), ...(dapp.chains || [])]),
        );
        uniqueDapps.set(dapp.id, { ...existing, chains: mergedChains });
      }
    });
  }

  // Filter out disabled dapps
  const finalDapps = Array.from(uniqueDapps.values()).filter(
    (dapp) => !DISABLED_IDS.includes(dapp.id),
  );

  // Add custom dapps
  finalDapps.push(...CUSTOM_DAPPS);

  // Sort: priority dapps first, then the rest
  const sortedDapps = [
    ...DAPPS_PRIORITY.map((id) =>
      finalDapps.find((dapp) => dapp.id === id),
    ).filter((dapp): dapp is DappInfo => dapp !== undefined),
    ...finalDapps.filter((dapp) => !DAPPS_PRIORITY.includes(dapp.id)),
  ];

  // Download icons locally for instant loading
  console.log(`\nDownloading ${sortedDapps.length} dapp icons...`);
  const iconResults = await Promise.all(
    sortedDapps.map((dapp) => downloadIcon(dapp.iconUrl, dapp.id, iconsDir)),
  );

  // Preserve categories and autoConnect from existing dapps.json (single source of truth)
  const dappsWithMetadata = sortedDapps.map((dapp, i) => ({
    ...dapp,
    iconUrl: iconResults[i],
    ...(existingCategories[dapp.id]
      ? { categories: existingCategories[dapp.id] }
      : {}),
    ...(existingAutoConnect[dapp.id] !== undefined
      ? { autoConnect: existingAutoConnect[dapp.id] }
      : {}),
  }));

  await fs.writeFile(outputPath, JSON.stringify(dappsWithMetadata, null, 2));

  console.log(`\n✅ Saved ${sortedDapps.length} dapps to ${outputPath}`);
}

main().catch(console.error);
