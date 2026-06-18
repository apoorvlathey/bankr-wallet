import { NextRequest, NextResponse } from "next/server";
import { BUNGEE_API_URL, bungeeHeaders } from "../bungee";

function socketStatusToBungeeCode(status: unknown): number {
  switch (status) {
    case "COMPLETED":
      return 3;
    case "EXPIRED":
      return 5;
    case "FAILED":
      return 6;
    case "REFUNDED":
      return 7;
    case "IN_PROGRESS":
      return 2;
    case "PENDING":
    default:
      return 0;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeSocketStatus(data: unknown) {
  const root = asObject(data);
  const result = asObject(root?.result);
  if (!result) return data;

  const origin = asObject(result.origin);
  const destination = asObject(result.destination);
  const routeDetails = asObject(result.routeDetails);
  const refund = asObject(result.refund);
  const code = socketStatusToBungeeCode(result.status ?? result.statusCode);

  return {
    ...(root ?? {}),
    success: root?.success ?? true,
    result: [
      {
        hash: getString(result.quoteId),
        quoteId: getString(result.quoteId),
        status: getString(result.status),
        statusCode: getString(result.statusCode),
        bungeeStatusCode: code,
        originData: {
          txHash: getString(origin?.txHash),
          originChainId:
            typeof origin?.chainId === "number"
              ? origin.chainId
              : Number(origin?.chainId ?? 0) || undefined,
          status: getString(origin?.status),
          userAddress: getString(origin?.userAddress),
          timestamp:
            typeof origin?.timestamp === "number"
              ? origin.timestamp
              : undefined,
        },
        destinationData: {
          txHash: getString(destination?.txHash),
          destinationChainId:
            typeof destination?.chainId === "number"
              ? destination.chainId
              : Number(destination?.chainId ?? 0) || undefined,
          receiverAddress: getString(destination?.receiverAddress),
          status: getString(destination?.status),
          timestamp:
            typeof destination?.timestamp === "number"
              ? destination.timestamp
              : undefined,
        },
        refund: refund
          ? {
              txHash: getString(refund.txHash),
              chainId:
                typeof refund.chainId === "number"
                  ? refund.chainId
                  : Number(refund.chainId ?? 0) || undefined,
              originChainId:
                typeof refund.originChainId === "number"
                  ? refund.originChainId
                  : Number(refund.originChainId ?? 0) || undefined,
            }
          : null,
        routeDetails: {
          name: getString(routeDetails?.name),
          logoURI: getString(routeDetails?.logoURI),
        },
        socketStatus: result,
      },
    ],
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestHash = searchParams.get("requestHash");
  const quoteId = searchParams.get("quoteId") ?? requestHash;
  const txHash = searchParams.get("txHash");

  if (!quoteId && !txHash) {
    return NextResponse.json(
      { error: "Missing quoteId/requestHash or txHash" },
      { status: 400 },
    );
  }

  if (!quoteId) {
    return NextResponse.json(
      { error: "Socket V3 status requires quoteId; txHash-only lookup is not supported" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  params.set("quoteId", quoteId);
  params.set("includeQuoteDetails", "true");

  try {
    const response = await fetch(
      `${BUNGEE_API_URL}/v3/swap/status?${params.toString()}`,
      {
        headers: bungeeHeaders(),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: 502 });
    }

    return NextResponse.json(normalizeSocketStatus(data));
  } catch (error) {
    console.error("Socket status API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bridge status" },
      { status: 500 },
    );
  }
}
