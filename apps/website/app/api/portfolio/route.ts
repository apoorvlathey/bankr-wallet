import { NextRequest, NextResponse } from "next/server";

const OCTAV_API_URL =
  process.env.OCTAV_API_URL || "https://api.octav.fi";
const OCTAV_API_KEY = process.env.OCTAV_API_KEY;
const BASE_RPC_URL =
  process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";

// WCHAN token on Base
const WCHAN_ADDRESS = "0xBa5ED0000e1CA9136a695f0a848012A16008B032";
const WCHAN_CHAIN_ID = 8453;
const WCHAN_DECIMALS = 18;

// Custom logo overrides keyed by `${chainId}:${lowercaseAddress}`
const LOGO_OVERRIDES: Record<string, string> = {
  "8453:0xba5ed0000e1ca9136a695f0a848012a16008b032":
    "https://walletchan.com/images/walletchan-icon.png",
};

// ERC20 balanceOf selector: 0x70a08231
const BALANCE_OF_SELECTOR = "0x70a08231";

/** Fetch WCHAN balance from Base RPC via eth_call */
async function fetchWchanBalance(address: string): Promise<{
  balance: number;
  balanceRaw: string;
} | null> {
  try {
    const paddedAddr = address.toLowerCase().replace("0x", "").padStart(64, "0");
    const calldata = `${BALANCE_OF_SELECTOR}${paddedAddr}`;

    const res = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: WCHAN_ADDRESS, data: calldata }, "latest"],
        id: 1,
      }),
    });

    const json = await res.json();
    if (!json.result || json.result === "0x") return null;

    const rawBigInt = BigInt(json.result);
    if (rawBigInt === 0n) return null;

    const balance =
      Number(rawBigInt / 10n ** 12n) / 10 ** (WCHAN_DECIMALS - 12);
    return { balance, balanceRaw: json.result };
  } catch (err) {
    console.warn("[portfolio] WCHAN RPC fetch failed:", err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "Address parameter is required" },
        { status: 400 }
      );
    }

    if (!OCTAV_API_KEY) {
      return NextResponse.json(
        { error: "Portfolio API not configured" },
        { status: 503 }
      );
    }

    const params = new URLSearchParams({ addresses: address, includeImages: "true" });

    // Fetch Octav portfolio and WCHAN balance in parallel
    const [response, wchanResult] = await Promise.all([
      fetch(`${OCTAV_API_URL}/v1/portfolio?${params.toString()}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OCTAV_API_KEY}`,
        },
        next: { revalidate: 60 },
      }),
      fetchWchanBalance(address),
    ]);

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: "Portfolio API authentication failed" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `Portfolio API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    // Octav returns an array; take first item
    const portfolio = Array.isArray(data) ? data[0] : data;

    // Transform Octav response to provider-agnostic format
    // Octav structure: assetByProtocols -> protocol -> chains -> chain -> protocolPositions -> type -> assets[]
    const tokenMap = new Map<string, PortfolioToken>();
    const defiPositions: DefiPosition[] = [];
    let totalValueUsd = parseFloat(portfolio?.networth || "0");

    if (portfolio?.assetByProtocols) {
      for (const [protoKey, protocol] of Object.entries(portfolio.assetByProtocols)) {
        const proto = protocol as OctavProtocol;
        if (!proto.chains) continue;
        const isWallet = protoKey.toLowerCase() === "wallet";

        for (const [chainKey, chainData] of Object.entries(proto.chains)) {
          const chainId = getChainIdFromOctav(chainKey);
          if (!chainId) continue;

          const chain = chainData as OctavChain;
          if (!chain.protocolPositions) continue;

          for (const [posKey, positionType] of Object.entries(chain.protocolPositions)) {
            const pos = positionType as OctavPositionType;

            if (isWallet) {
              // Wallet protocol: collect into flat token list
              collectAssets(pos.assets, chainId, tokenMap);
            } else {
              // DeFi protocol: top-level assets as a position
              if (pos.assets?.length) {
                const topAssets = toDefiAssets(pos.assets, chainId);
                if (topAssets.length > 0) {
                  defiPositions.push({
                    protocol: proto.name || protoKey,
                    protocolLogo: proto.imgSmall || proto.imgLarge || undefined,
                    chainId,
                    type: posKey,
                    name: pos.name || posKey,
                    valueUsd: topAssets.reduce((s, a) => s + a.valueUsd, 0),
                    assets: topAssets,
                    rewardAssets: [],
                  });
                }
              }

              // Nested sub-positions (LP, staking, lending)
              if (pos.protocolPositions) {
                for (const subPos of pos.protocolPositions as OctavSubPosition[]) {
                  const assets = toDefiAssets([
                    ...(subPos.assets || []),
                    ...(subPos.supplyAssets || []),
                  ], chainId);
                  const rewardAssets = toDefiAssets(subPos.rewardAssets, chainId);
                  const posValueUsd =
                    assets.reduce((s, a) => s + a.valueUsd, 0) +
                    rewardAssets.reduce((s, a) => s + a.valueUsd, 0);
                  if (assets.length === 0 && rewardAssets.length === 0) continue;

                  defiPositions.push({
                    protocol: proto.name || protoKey,
                    protocolLogo: proto.imgSmall || proto.imgLarge || undefined,
                    chainId,
                    type: posKey,
                    name: subPos.name || pos.name || posKey,
                    valueUsd: posValueUsd,
                    siteUrl: subPos.siteUrl || undefined,
                    assets,
                    rewardAssets,
                  });
                }
              }
            }
          }
        }
      }
    }

    const tokens = Array.from(tokenMap.values());

    // Inject WCHAN wallet balance from RPC if not already present from Octav
    if (wchanResult && wchanResult.balance > 0) {
      const wchanKey = `wchan-${WCHAN_CHAIN_ID}`;
      if (!tokenMap.has(wchanKey)) {
        // Find WCHAN price from DeFi positions (it appears in LP assets)
        let wchanPrice = 0;
        for (const pos of defiPositions) {
          for (const asset of pos.assets) {
            if (
              asset.symbol.toLowerCase() === "wchan" &&
              asset.chainId === WCHAN_CHAIN_ID
            ) {
              const assetBal = parseFloat(asset.balance);
              if (assetBal > 0) {
                wchanPrice = asset.valueUsd / assetBal;
                break;
              }
            }
          }
          if (wchanPrice > 0) break;
        }

        const valueUsd = wchanResult.balance * wchanPrice;
        const wchanToken: PortfolioToken = {
          symbol: "wchan",
          name: "walletchan",
          contractAddress: WCHAN_ADDRESS.toLowerCase(),
          chainId: WCHAN_CHAIN_ID,
          decimals: WCHAN_DECIMALS,
          balance: wchanResult.balance.toString(),
          balanceFormatted: formatBalance(wchanResult.balance),
          priceUsd: wchanPrice,
          valueUsd,
          logoUrl: LOGO_OVERRIDES[`${WCHAN_CHAIN_ID}:${WCHAN_ADDRESS.toLowerCase()}`],
        };
        tokens.push(wchanToken);
        totalValueUsd += valueUsd;
      }
    }

    // Apply custom logo overrides
    for (const token of tokens) {
      const key = `${token.chainId}:${token.contractAddress.toLowerCase()}`;
      const override = LOGO_OVERRIDES[key];
      if (override) token.logoUrl = override;
    }
    // Sort by USD value descending
    tokens.sort((a, b) => b.valueUsd - a.valueUsd);
    // Sort DeFi positions by value descending
    defiPositions.sort((a, b) => b.valueUsd - a.valueUsd);

    const result: PortfolioResponse = { tokens, defiPositions, totalValueUsd };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (error) {
    console.error("Portfolio API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio data" },
      { status: 500 }
    );
  }
}

// Types
interface PortfolioToken {
  symbol: string;
  name: string;
  contractAddress: string;
  chainId: number;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  priceUsd: number;
  valueUsd: number;
  logoUrl?: string;
}

interface DefiAsset {
  symbol: string;
  name: string;
  contractAddress: string;
  chainId: number;
  balance: string;
  balanceFormatted: string;
  valueUsd: number;
  logoUrl?: string;
}

interface DefiPosition {
  protocol: string;
  protocolLogo?: string;
  chainId: number;
  type: string;
  name: string;
  valueUsd: number;
  siteUrl?: string;
  assets: DefiAsset[];
  rewardAssets: DefiAsset[];
}

interface PortfolioResponse {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
}

// Octav API response types
interface OctavAsset {
  name: string;
  symbol: string;
  balance: string;
  price: string;
  value: string;
  contract?: string;
  decimal?: string;
  imgSmall?: string;
  imgLarge?: string;
}

interface OctavSubPosition {
  name: string;
  value: string;
  siteUrl?: string;
  assets?: OctavAsset[];
  supplyAssets?: OctavAsset[];
  borrowAssets?: OctavAsset[];
  rewardAssets?: OctavAsset[];
}

interface OctavPositionType {
  name: string;
  value: string;
  assets?: OctavAsset[];
  protocolPositions?: OctavSubPosition[];
}

interface OctavChain {
  name: string;
  value: string;
  protocolPositions?: Record<string, OctavPositionType>;
}

interface OctavProtocol {
  name: string;
  value: string;
  imgSmall?: string;
  imgLarge?: string;
  chains?: Record<string, OctavChain>;
}

// Collect wallet assets into a deduped token map (key: symbol+chainId)
function collectAssets(
  assets: OctavAsset[] | undefined,
  chainId: number,
  tokenMap: Map<string, PortfolioToken>
) {
  if (!assets) return;
  for (const asset of assets) {
    const valueUsd = parseFloat(asset.value || "0");
    const balance = parseFloat(asset.balance || "0");
    const priceUsd = parseFloat(asset.price || "0");
    if (balance === 0 && valueUsd === 0) continue;

    const key = `${asset.symbol}-${chainId}`;
    const existing = tokenMap.get(key);
    if (existing) {
      // Aggregate balances for the same token on the same chain
      const existingBal = parseFloat(existing.balance);
      const newBal = existingBal + balance;
      existing.balance = newBal.toString();
      existing.balanceFormatted = formatBalance(newBal);
      existing.valueUsd += valueUsd;
    } else {
      tokenMap.set(key, {
        symbol: asset.symbol || "???",
        name: asset.name || asset.symbol || "Unknown",
        contractAddress:
          !asset.contract || asset.contract === "0x0000000000000000000000000000000000000000"
            ? "native"
            : asset.contract,
        chainId,
        decimals: asset.decimal ? parseInt(asset.decimal, 10) : 18,
        balance: asset.balance || "0",
        balanceFormatted: formatBalance(balance),
        priceUsd,
        valueUsd,
        logoUrl: asset.imgSmall || asset.imgLarge || undefined,
      });
    }
  }
}

// Convert Octav assets to DefiAsset[]
function toDefiAssets(assets: OctavAsset[] | undefined, chainId: number): DefiAsset[] {
  if (!assets) return [];
  const result: DefiAsset[] = [];
  for (const asset of assets) {
    const balance = parseFloat(asset.balance || "0");
    const valueUsd = parseFloat(asset.value || "0");
    if (balance === 0 && valueUsd === 0) continue;
    const contractAddress =
      !asset.contract || asset.contract === "0x0000000000000000000000000000000000000000"
        ? "native"
        : asset.contract;
    let logoUrl = asset.imgSmall || asset.imgLarge || undefined;
    // Filter out Octav placeholder images
    if (logoUrl?.includes("NoImageAvailable")) logoUrl = undefined;
    // Apply logo overrides
    const overrideKey = `${chainId}:${contractAddress.toLowerCase()}`;
    if (LOGO_OVERRIDES[overrideKey]) logoUrl = LOGO_OVERRIDES[overrideKey];
    result.push({
      symbol: asset.symbol || "???",
      name: asset.name || asset.symbol || "Unknown",
      contractAddress,
      chainId,
      balance: asset.balance || "0",
      balanceFormatted: formatBalance(balance),
      valueUsd,
      logoUrl,
    });
  }
  return result;
}

// Map Octav chain names to chain IDs
function getChainIdFromOctav(chain: string): number | null {
  const map: Record<string, number> = {
    ethereum: 1,
    eth: 1,
    base: 8453,
    polygon: 137,
    matic: 137,
    unichain: 130,
  };
  return map[chain?.toLowerCase()] ?? null;
}

function formatBalance(balance: number | string | undefined): string {
  if (!balance) return "0";
  const num = typeof balance === "string" ? parseFloat(balance) : balance;
  if (isNaN(num)) return "0";
  if (num < 0.000001) return "<0.000001";
  if (num < 1) return num.toPrecision(4);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
