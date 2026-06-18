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

/** Socket V3 expects the universal mixed-case native sentinel for quotes. */
function normalizeForSocket(addr: string): string {
  const lower = addr.toLowerCase();
  if (lower === ZERO_ADDRESS || lower === UNIVERSAL_NATIVE.toLowerCase()) {
    return UNIVERSAL_NATIVE;
  }
  if (lower === BUNGEE_NATIVE_TOKEN) return UNIVERSAL_NATIVE;
  return addr;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function routeName(route: Record<string, unknown>): string | undefined {
  const details = asObject(route.routeDetails);
  const bridgeDetails = asObject(details?.bridgeDetails);
  const dexDetails = asObject(details?.dexDetails);
  const bridgeProtocol = asObject(bridgeDetails?.protocol);
  const dexProtocol = asObject(dexDetails?.protocol);

  return (
    getString(bridgeProtocol?.displayName) ??
    getString(bridgeProtocol?.name) ??
    getString(dexProtocol?.displayName) ??
    getString(dexProtocol?.name) ??
    getString(details?.name)
  );
}

function routeLogo(route: Record<string, unknown>): string | undefined {
  const details = asObject(route.routeDetails);
  const bridgeDetails = asObject(details?.bridgeDetails);
  const dexDetails = asObject(details?.dexDetails);
  const bridgeProtocol = asObject(bridgeDetails?.protocol);
  const dexProtocol = asObject(dexDetails?.protocol);

  return (
    getString(bridgeProtocol?.icon) ??
    getString(bridgeProtocol?.logoURI) ??
    getString(dexProtocol?.icon) ??
    getString(dexProtocol?.logoURI) ??
    getString(details?.logoURI)
  );
}

function normalizeSocketQuote(data: unknown, isPremiumFee: boolean, feeBps: string) {
  const root = asObject(data);
  const result = asObject(root?.result);
  const routes = Array.isArray(result?.routes) ? result.routes : [];
  const manualRoutes = routes.flatMap((rawRoute) => {
    const route = asObject(rawRoute) ?? {};
    const approval = asObject(route.approval);
    const txData = asObject(route.txData);
    const txObject = asObject(txData?.object);
    const gasFee = asObject(route.gasFee);

    if (!asObject(route.output) || !txObject) return [];

    return [{
      output: route.output,
      quoteId: getString(route.quoteId) ?? "",
      quoteExpiry: getNumber(route.expiresAt),
      expiresAt: getNumber(route.expiresAt),
      gasFee: gasFee
        ? {
            ...gasFee,
            feesInUsd:
              getNumber(gasFee.feesInUsd) ?? getNumber(gasFee.feeInUsd),
          }
        : undefined,
      routeDetails: {
        name: routeName(route) ?? "Socket",
        logoURI: routeLogo(route),
      },
      estimatedTime: getNumber(route.estimatedTime),
      approvalData: approval
        ? {
            amount: getString(approval.amount) ?? "0",
            tokenAddress: getString(approval.tokenAddress) ?? "",
            spenderAddress: getString(approval.spenderAddress) ?? "",
            userAddress: getString(approval.userAddress) ?? "",
          }
        : null,
      txData: txObject
        ? {
            to: getString(txObject.to) ?? "",
            data: getString(txObject.data) ?? "0x",
            value: getString(txObject.value) ?? "0",
            chainId:
              typeof txObject.chainId === "number"
                ? txObject.chainId
                : Number(txObject.chainId ?? result?.originChainId ?? 0),
          }
        : undefined,
      socketRoute: route,
    }];
  });

  return {
    ...(root ?? {}),
    success: root?.success ?? true,
    result: {
      ...(result ?? {}),
      input: result?.input,
      manualRoutes,
      autoRoute: null,
      quoteId: manualRoutes[0]?.quoteId,
      quoteExpiry: manualRoutes[0]?.quoteExpiry,
      routes,
    },
    isPremiumFee,
    feeBps,
  };
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
    userOps: "tx",
    userAddress,
    receiverAddress,
    originChainId,
    destinationChainId,
    inputToken: normalizeForSocket(inputToken),
    outputToken: normalizeForSocket(outputToken),
    inputAmount,
    slippage,
  });

  if (FEE_RECIPIENT) {
    params.set("feeBps", feeBps);
    params.set("feeTakerAddress", FEE_RECIPIENT);
  }

  try {
    const response = await fetch(
      `${BUNGEE_API_URL}/v3/swap/quote?${params.toString()}`,
      {
        headers: bungeeHeaders(),
        signal: AbortSignal.timeout(20_000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: 502 });
    }

    return NextResponse.json(normalizeSocketQuote(data, isPremiumFee, feeBps));
  } catch (error) {
    console.error("Socket quote API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Socket quote" },
      { status: 500 },
    );
  }
}
