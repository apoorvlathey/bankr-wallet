import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { resolveFeeBps } from "../../swap/feeResolver";
import { BUNGEE_API_URL, bungeeHeaders } from "../bungee";

/** Bungee whitelists fee recipients per affiliate, so this is decoupled from
 *  SWAP_FEE_RECIPIENT (which the 0x integration uses). If unset, no
 *  integrator fee is attached and the upstream "not whitelisted" error is
 *  avoided. */
const FEE_RECIPIENT = process.env.BUNGEE_FEE_RECIPIENT ?? "";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BUNGEE_NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const UNIVERSAL_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Bungee expects all-lowercase eeee...eeee for native tokens. */
function normalizeForBungee(addr: string): string {
  const lower = addr.toLowerCase();
  if (lower === ZERO_ADDRESS || lower === UNIVERSAL_NATIVE.toLowerCase()) {
    return BUNGEE_NATIVE_TOKEN;
  }
  return addr;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const userAddress = searchParams.get("userAddress");
  const receiverAddress = searchParams.get("receiverAddress") ?? userAddress;
  const originChainId = searchParams.get("originChainId");
  const destinationChainId = searchParams.get("destinationChainId");
  const inputToken = searchParams.get("inputToken");
  const outputToken = searchParams.get("outputToken");
  const inputAmount = searchParams.get("inputAmount");
  const slippage = searchParams.get("slippage") ?? "0.5";

  if (
    !userAddress ||
    !receiverAddress ||
    !originChainId ||
    !destinationChainId ||
    !inputToken ||
    !outputToken ||
    !inputAmount
  ) {
    return NextResponse.json(
      {
        error:
          "Missing required parameters: userAddress, originChainId, destinationChainId, inputToken, outputToken, inputAmount",
      },
      { status: 400 },
    );
  }

  if (!isAddress(userAddress) || !isAddress(receiverAddress)) {
    return NextResponse.json(
      { error: "Invalid userAddress or receiverAddress" },
      { status: 400 },
    );
  }

  if (!/^\d+$/.test(originChainId) || !/^\d+$/.test(destinationChainId)) {
    return NextResponse.json(
      { error: "Chain IDs must be positive integers" },
      { status: 400 },
    );
  }

  if (!/^\d+$/.test(inputAmount) || inputAmount === "0") {
    return NextResponse.json(
      { error: "inputAmount must be a positive integer" },
      { status: 400 },
    );
  }

  const { feeBps, isPremiumFee } = await resolveFeeBps(userAddress);

  const params = new URLSearchParams({
    userAddress,
    receiverAddress,
    originChainId,
    destinationChainId,
    inputToken: normalizeForBungee(inputToken),
    outputToken: normalizeForBungee(outputToken),
    inputAmount,
    slippage,
    enableManual: "true",
  });

  if (FEE_RECIPIENT) {
    params.set("feeBps", feeBps);
    params.set("feeTakerAddress", FEE_RECIPIENT);
  }

  try {
    const response = await fetch(
      `${BUNGEE_API_URL}/api/v1/bungee/quote?${params.toString()}`,
      {
        headers: bungeeHeaders(),
        signal: AbortSignal.timeout(20_000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: 502 });
    }

    return NextResponse.json({ ...data, isPremiumFee, feeBps });
  } catch (error) {
    console.error("Bungee quote API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Bungee quote" },
      { status: 500 },
    );
  }
}
