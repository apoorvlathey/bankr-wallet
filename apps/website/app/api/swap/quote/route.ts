import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  detectWchanSwap,
  fetchWchanQuote,
  compareBestRoute,
} from "../wchanRoute";
import { resolveFeeBps } from "../feeResolver";
import { resolveSwapFeeToken } from "../preferredFeeTokens";

const ZEROX_API_KEY = process.env.ZEROX_API_KEY ?? "";
const ZEROX_BASE_URL = "https://api.0x.org";
const DEFAULT_CHAIN_ID = "8453"; // Base

const FEE_RECIPIENT = process.env.SWAP_FEE_RECIPIENT ?? "";

// https://docs.0x.org/docs/introduction/supported-chains
const SUPPORTED_CHAIN_IDS = new Set([
  "1",      // Ethereum
  "10",     // Optimism
  "56",     // BSC
  "130",    // Unichain
  "137",    // Polygon
  "143",    // Monad
  "146",    // Sonic
  "480",    // World Chain
  "999",    // HyperEVM
  "2741",   // Abstract
  "4217",   // Tempo
  "4663",   // Robinhood Chain
  "5000",   // Mantle
  "8453",   // Base
  "9745",   // Plasma
  "34443",  // Mode
  "42161",  // Arbitrum
  "43114",  // Avalanche
  "57073",  // Ink
  "59144",  // Linea
  "80094",  // Berachain
  "81457",  // Blast
  "534352", // Scroll
]);

const NATIVE_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** 0x expects `0xEeee...EEeE` for native ETH. Some clients send the zero
 *  address as a "native" sentinel — coerce so quotes don't fail. */
function normalizeNativeAddress(addr: string): string {
  return addr.toLowerCase() === ZERO_ADDRESS ? NATIVE_PLACEHOLDER : addr;
}

// ---------------------------------------------------------------------------
// 0x quote fetch helper
// ---------------------------------------------------------------------------

async function fetch0xQuote(
  chainId: string,
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  taker: string,
  feeBps: string,
  feeToken: string,
  slippageBps?: string,
  recipient?: string,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const params = new URLSearchParams({ chainId, sellToken, buyToken, sellAmount, taker });

  if (FEE_RECIPIENT) {
    params.set("swapFeeRecipient", FEE_RECIPIENT);
    params.set("swapFeeBps", feeBps);
    params.set("swapFeeToken", feeToken);
  }
  if (slippageBps) params.set("slippageBps", slippageBps);
  // Optional alternate recipient for the bought tokens. 0x defaults to
  // `taker` when omitted. Not supported by 0x on wrap/unwrap routes — we
  // pass it through unconditionally and let 0x surface the error.
  if (recipient) params.set("recipient", recipient);

  const response = await fetch(
    `${ZEROX_BASE_URL}/swap/allowance-holder/quote?${params.toString()}`,
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

  const sellTokenRaw = searchParams.get("sellToken");
  const buyTokenRaw = searchParams.get("buyToken");
  const sellAmount = searchParams.get("sellAmount");
  const taker = searchParams.get("taker");

  // Validate required params
  if (!sellTokenRaw || !buyTokenRaw || !sellAmount || !taker) {
    return NextResponse.json(
      {
        error:
          "Missing required parameters: sellToken, buyToken, sellAmount, taker",
      },
      { status: 400 },
    );
  }

  const sellToken = normalizeNativeAddress(sellTokenRaw);
  const buyToken = normalizeNativeAddress(buyTokenRaw);

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
  if (!isAddress(taker)) {
    return NextResponse.json(
      { error: "Invalid taker address" },
      { status: 400 },
    );
  }

  // Optional explicit recipient for the bought tokens. Validated here so an
  // invalid value fails fast (vs surfacing as a 0x 400 downstream).
  const recipientRaw = searchParams.get("recipient");
  const recipient = recipientRaw ?? undefined;
  if (recipient && !isAddress(recipient)) {
    return NextResponse.json(
      { error: "Invalid recipient address" },
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

  // Resolve fee tier and preferred fee token
  const { feeBps, isPremiumFee } = await resolveFeeBps(taker);
  const feeToken = resolveSwapFeeToken(chainIdParam, sellToken, buyToken);

  // -----------------------------------------------------------------------
  // WCHAN custom routing: compare 0x vs Uniswap V4.
  // Skip the comparison when an explicit recipient is set — the WCHAN/V4
  // route doesn't honor it, and silently sending the bought tokens to the
  // taker instead would be worse than a slightly worse price via 0x.
  // -----------------------------------------------------------------------
  const wchanCheck = detectWchanSwap(chainIdParam, sellToken, buyToken);

  if (wchanCheck.isWchan && !recipient) {
    try {
      const [zeroXResult, wchanResult] = await Promise.allSettled([
        fetch0xQuote(chainIdParam, sellToken, buyToken, sellAmount, taker, feeBps, feeToken, slippageBps),
        fetchWchanQuote(wchanCheck.direction, sellAmount),
      ]);

      const zeroXRes =
        zeroXResult.status === "fulfilled" ? zeroXResult.value : null;
      const wchanQuote =
        wchanResult.status === "fulfilled" ? wchanResult.value : null;

      if (wchanResult.status === "rejected") {
        console.warn("[wchanRoute] Custom quote failed:", wchanResult.reason);
      }

      const best = await compareBestRoute(
        zeroXRes?.data ?? null,
        zeroXRes?.ok ?? false,
        wchanQuote,
        sellToken,
        buyToken,
        sellAmount,
        slippageBpsNum,
        taker,
        true, // include transaction data for quote endpoint
      );

      if (best) {
        return NextResponse.json({ ...best.data, isPremiumFee });
      }

      if (zeroXRes) {
        return NextResponse.json(zeroXRes.data, { status: 502 });
      }
      return NextResponse.json({ error: "Failed to fetch quote" }, { status: 500 });
    } catch (error) {
      console.error("WCHAN quote routing error:", error);
      return NextResponse.json(
        { error: "Failed to fetch quote" },
        { status: 500 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Standard 0x-only flow
  // -----------------------------------------------------------------------
  try {
    const result = await fetch0xQuote(
      chainIdParam,
      sellToken,
      buyToken,
      sellAmount,
      taker,
      feeBps,
      feeToken,
      slippageBps,
      recipient,
    );

    if (!result.ok) {
      return NextResponse.json(result.data, { status: 502 });
    }

    return NextResponse.json({ ...result.data, isPremiumFee });
  } catch (error) {
    console.error("0x quote API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch quote" },
      { status: 500 },
    );
  }
}
