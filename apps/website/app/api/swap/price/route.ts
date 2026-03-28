import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

const ZEROX_API_KEY = process.env.ZEROX_API_KEY ?? "";
const ZEROX_BASE_URL = "https://api.0x.org";
const DEFAULT_CHAIN_ID = "8453"; // Base

const FEE_RECIPIENT = process.env.SWAP_FEE_RECIPIENT ?? "";
const FEE_BPS = "90"; // 0.9%
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const SUPPORTED_CHAIN_IDS = new Set([
  "1", "42161", "8453", "56", "137", "130",
]);

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
      { status: 400 }
    );
  }

  // Validate addresses (allow native token placeholder)
  const nativePlaceholder = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  if (
    sellToken.toLowerCase() !== nativePlaceholder.toLowerCase() &&
    !isAddress(sellToken)
  ) {
    return NextResponse.json(
      { error: "Invalid sellToken address" },
      { status: 400 }
    );
  }
  if (
    buyToken.toLowerCase() !== nativePlaceholder.toLowerCase() &&
    !isAddress(buyToken)
  ) {
    return NextResponse.json(
      { error: "Invalid buyToken address" },
      { status: 400 }
    );
  }

  // Validate sellAmount is a positive number
  if (!/^\d+$/.test(sellAmount) || sellAmount === "0") {
    return NextResponse.json(
      { error: "sellAmount must be a positive integer" },
      { status: 400 }
    );
  }

  if (!ZEROX_API_KEY) {
    return NextResponse.json(
      { error: "0x API key not configured" },
      { status: 500 }
    );
  }

  // Chain ID (optional, defaults to Base for backwards compatibility)
  const chainIdParam = searchParams.get("chainId") ?? DEFAULT_CHAIN_ID;
  if (!SUPPORTED_CHAIN_IDS.has(chainIdParam)) {
    return NextResponse.json(
      { error: `Unsupported chainId: ${chainIdParam}` },
      { status: 400 },
    );
  }

  // Build 0x API URL with fee params injected server-side
  const params = new URLSearchParams({
    chainId: chainIdParam,
    sellToken,
    buyToken,
    sellAmount,
  });

  // Fee always collected in ETH (sellToken) — hardcoded server-side
  if (FEE_RECIPIENT) {
    params.set("swapFeeRecipient", FEE_RECIPIENT);
    params.set("swapFeeBps", FEE_BPS);
    params.set("swapFeeToken", NATIVE_TOKEN);
  }

  if (taker) {
    params.set("taker", taker);
  }

  // Slippage tolerance
  const slippageBps = searchParams.get("slippageBps");
  if (slippageBps && /^\d+$/.test(slippageBps)) {
    params.set("slippageBps", slippageBps);
  }

  try {
    const response = await fetch(
      `${ZEROX_BASE_URL}/swap/allowance-holder/price?${params.toString()}`,
      {
        headers: {
          "0x-api-key": ZEROX_API_KEY,
          "0x-version": "v2",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("0x price API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch price" },
      { status: 500 }
    );
  }
}
