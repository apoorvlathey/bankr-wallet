import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_CHAIN_IDS } from "./chains";
import { alchemyProvider } from "./providers/alchemy";
import { duneSimProvider } from "./providers/dune";
// Octav is intentionally not in the active chain — re-enable by importing and
// adding `octavProvider` to PROVIDERS below. See ./providers/octav.ts.
// import { octavProvider } from "./providers/octav";
import {
  PortfolioProvider,
  PortfolioResponse,
  PortfolioToken,
  ProviderResult,
  formatBalance,
} from "./providers/types";

/**
 * Provider chain. The route tries each in order and falls back on any error
 * (including 429). Only providers that are `isConfigured()` are attempted.
 *
 * To swap providers: reorder this array, add a new provider, or comment one
 * out. Each provider is a self-contained module under ./providers/.
 */
const PROVIDERS: PortfolioProvider[] = [duneSimProvider, alchemyProvider];

const BASE_RPC_URL =
  process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org";

// WCHAN token on Base — RPC fallback for cases where the active provider
// doesn't surface it.
const WCHAN_ADDRESS = "0xBa5ED0000e1CA9136a695f0a848012A16008B032";
const WCHAN_CHAIN_ID = 8453;
const WCHAN_DECIMALS = 18;

// Custom logo overrides keyed by `${chainId}:${lowercaseAddress}`
const LOGO_OVERRIDES: Record<string, string> = {
  "8453:0xba5ed0000e1ca9136a695f0a848012a16008b032":
    "https://walletchan.com/images/walletchan-icon.png",
};

const BALANCE_OF_SELECTOR = "0x70a08231";

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

    if (!PROVIDERS.some((p) => p.isConfigured())) {
      return NextResponse.json(
        { error: "Portfolio API not configured" },
        { status: 503 }
      );
    }

    const [providerOutcome, wchanResult] = await Promise.all([
      fetchFromProviders(address, SUPPORTED_CHAIN_IDS),
      fetchWchanBalance(address),
    ]);

    const { result: providerResult, source } = providerOutcome;
    const tokens = [...providerResult.tokens];
    const defiPositions = [...providerResult.defiPositions];

    // Inject WCHAN wallet balance from RPC if the active provider didn't return it.
    if (wchanResult && wchanResult.balance > 0) {
      const wchanAddrLower = WCHAN_ADDRESS.toLowerCase();
      const exists = tokens.some(
        (t) =>
          t.chainId === WCHAN_CHAIN_ID &&
          t.contractAddress.toLowerCase() === wchanAddrLower
      );
      if (!exists) {
        const priceFromOthers = lookupWchanPrice(tokens, defiPositions);
        const valueUsd = wchanResult.balance * priceFromOthers;
        tokens.push({
          symbol: "wchan",
          name: "walletchan",
          contractAddress: wchanAddrLower,
          chainId: WCHAN_CHAIN_ID,
          decimals: WCHAN_DECIMALS,
          balance: wchanResult.balance.toString(),
          balanceFormatted: formatBalance(wchanResult.balance),
          priceUsd: priceFromOthers,
          valueUsd,
        });
      }
    }

    // Apply custom logo overrides to both tokens and DeFi assets.
    for (const token of tokens) {
      const key = `${token.chainId}:${token.contractAddress.toLowerCase()}`;
      const override = LOGO_OVERRIDES[key];
      if (override) token.logoUrl = override;
    }
    for (const pos of defiPositions) {
      for (const a of pos.assets) {
        const key = `${a.chainId}:${a.contractAddress.toLowerCase()}`;
        if (LOGO_OVERRIDES[key]) a.logoUrl = LOGO_OVERRIDES[key];
      }
      for (const a of pos.rewardAssets) {
        const key = `${a.chainId}:${a.contractAddress.toLowerCase()}`;
        if (LOGO_OVERRIDES[key]) a.logoUrl = LOGO_OVERRIDES[key];
      }
    }

    tokens.sort((a, b) => b.valueUsd - a.valueUsd);
    defiPositions.sort((a, b) => b.valueUsd - a.valueUsd);

    const totalValueUsd =
      providerResult.totalValueUsd ??
      tokens.reduce((s, t) => s + t.valueUsd, 0) +
        defiPositions.reduce((s, p) => s + p.valueUsd, 0);

    const result: PortfolioResponse = {
      tokens,
      defiPositions,
      totalValueUsd,
      source,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (error) {
    console.error("Portfolio API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch portfolio data: ${message}` },
      { status: 500 }
    );
  }
}

async function fetchFromProviders(
  address: string,
  chainIds: readonly number[]
): Promise<{ result: ProviderResult; source: string }> {
  const errors: string[] = [];
  for (const provider of PROVIDERS) {
    if (!provider.isConfigured()) continue;
    try {
      const result = await provider.fetch(address, chainIds);
      return { result, source: provider.name };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.name}: ${msg}`);
      console.warn(`[portfolio] provider ${provider.name} failed:`, err);
    }
  }
  throw new Error(
    errors.length
      ? `All providers failed (${errors.join("; ")})`
      : "No portfolio providers configured"
  );
}

function lookupWchanPrice(
  tokens: PortfolioToken[],
  defiPositions: PortfolioResponse["defiPositions"]
): number {
  const fromTokens = tokens.find(
    (t) =>
      t.symbol.toLowerCase() === "wchan" &&
      t.chainId === WCHAN_CHAIN_ID &&
      t.priceUsd > 0
  )?.priceUsd;
  if (fromTokens) return fromTokens;

  // Fallback for providers (e.g. Octav) that surface WCHAN inside an LP position.
  for (const pos of defiPositions) {
    for (const asset of pos.assets) {
      if (
        asset.symbol.toLowerCase() === "wchan" &&
        asset.chainId === WCHAN_CHAIN_ID
      ) {
        const bal = parseFloat(asset.balance);
        if (bal > 0) return asset.valueUsd / bal;
      }
    }
  }
  return 0;
}

/** Fetch WCHAN balance from Base RPC via eth_call */
async function fetchWchanBalance(
  address: string
): Promise<{ balance: number; balanceRaw: string } | null> {
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
