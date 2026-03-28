import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  detectWchanSwap,
  fetchWchanQuote,
  compareBestRoute,
} from "../wchanRoute";

const ZEROX_API_KEY = process.env.ZEROX_API_KEY ?? "";
const ZEROX_BASE_URL = "https://api.0x.org";
const DEFAULT_CHAIN_ID = "8453"; // Base

const FEE_RECIPIENT = process.env.SWAP_FEE_RECIPIENT ?? "";
const FEE_BPS = "90"; // 0.9%

const SUPPORTED_CHAIN_IDS = new Set([
  "1", "42161", "8453", "56", "137", "130",
]);

const NATIVE_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ---------------------------------------------------------------------------
// 0x price fetch helper
// ---------------------------------------------------------------------------

async function fetch0xPrice(
  chainId: string,
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  taker?: string,
  slippageBps?: string,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const params = new URLSearchParams({ chainId, sellToken, buyToken, sellAmount });

  if (FEE_RECIPIENT) {
    params.set("swapFeeRecipient", FEE_RECIPIENT);
    params.set("swapFeeBps", FEE_BPS);
    params.set("swapFeeToken", sellToken);
  }
  if (taker) params.set("taker", taker);
  if (slippageBps) params.set("slippageBps", slippageBps);

  const response = await fetch(
    `${ZEROX_BASE_URL}/swap/allowance-holder/price?${params.toString()}`,
    { headers: { "0x-api-key": ZEROX_API_KEY, "0x-version": "v2" } },
  );

  const data = await response.json();
  return { ok: response.ok, data };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const sellToken = searchParams.get("sellToken");
  const buyToken = searchParams.get("buyToken");
  const sellAmount = searchParams.get("sellAmount");
  const taker = searchParams.get("taker");

  // Validate required params
  if (!sellToken || !buyToken || !sellAmount) {
    return NextResponse.json(
      { error: "Missing required parameters: sellToken, buyToken, sellAmount" },
      { status: 400 },
    );
  }

  if (
    sellToken.toLowerCase() !== NATIVE_PLACEHOLDER.toLowerCase() &&
    !isAddress(sellToken)
  ) {
    return NextResponse.json(
      { error: "Invalid sellToken address" },
      { status: 400 },
    );
  }
  if (
    buyToken.toLowerCase() !== NATIVE_PLACEHOLDER.toLowerCase() &&
    !isAddress(buyToken)
  ) {
    return NextResponse.json(
      { error: "Invalid buyToken address" },
      { status: 400 },
    );
  }

  if (!/^\d+$/.test(sellAmount) || sellAmount === "0") {
    return NextResponse.json(
      { error: "sellAmount must be a positive integer" },
      { status: 400 },
    );
  }

  if (!ZEROX_API_KEY) {
    return NextResponse.json(
      { error: "0x API key not configured" },
      { status: 500 },
    );
  }

  const chainIdParam = searchParams.get("chainId") ?? DEFAULT_CHAIN_ID;
  if (!SUPPORTED_CHAIN_IDS.has(chainIdParam)) {
    return NextResponse.json(
      { error: `Unsupported chainId: ${chainIdParam}` },
      { status: 400 },
    );
  }

  const slippageBps = searchParams.get("slippageBps") ?? undefined;
  const slippageBpsNum = slippageBps && /^\d+$/.test(slippageBps) ? Number(slippageBps) : 100;

  // -----------------------------------------------------------------------
  // WCHAN custom routing: compare 0x vs Uniswap V4
  // -----------------------------------------------------------------------
  const wchanCheck = detectWchanSwap(chainIdParam, sellToken, buyToken);

  if (wchanCheck.isWchan) {
    try {
      const [zeroXResult, wchanResult] = await Promise.allSettled([
        fetch0xPrice(chainIdParam, sellToken, buyToken, sellAmount, taker ?? undefined, slippageBps),
        fetchWchanQuote(wchanCheck.direction, sellAmount),
      ]);

      const zeroXRes =
        zeroXResult.status === "fulfilled" ? zeroXResult.value : null;
      const wchanQuote =
        wchanResult.status === "fulfilled" ? wchanResult.value : null;

      if (wchanResult.status === "rejected") {
        console.warn("[wchanRoute] Custom quote failed:", wchanResult.reason);
      }

      const best = compareBestRoute(
        zeroXRes?.data ?? null,
        zeroXRes?.ok ?? false,
        wchanQuote,
        sellToken,
        buyToken,
        sellAmount,
        slippageBpsNum,
        taker ?? undefined,
        false, // no transaction for price endpoint
      );

      if (best) {
        return NextResponse.json(best.data);
      }

      // Both failed — return 0x error if we have it
      if (zeroXRes) {
        return NextResponse.json(zeroXRes.data, { status: 502 });
      }
      return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
    } catch (error) {
      console.error("WCHAN price routing error:", error);
      return NextResponse.json(
        { error: "Failed to fetch price" },
        { status: 500 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Standard 0x-only flow
  // -----------------------------------------------------------------------
  try {
    const result = await fetch0xPrice(
      chainIdParam,
      sellToken,
      buyToken,
      sellAmount,
      taker ?? undefined,
      slippageBps,
    );

    if (!result.ok) {
      return NextResponse.json(result.data, { status: 502 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("0x price API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch price" },
      { status: 500 },
    );
  }
}
