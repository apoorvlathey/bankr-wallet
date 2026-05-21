import { NextRequest, NextResponse } from "next/server";
import { BUNGEE_API_URL, bungeeHeaders } from "../bungee";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestHash = searchParams.get("requestHash");
  const txHash = searchParams.get("txHash");

  if (!requestHash && !txHash) {
    return NextResponse.json(
      { error: "Missing requestHash or txHash" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  if (requestHash) params.set("requestHash", requestHash);
  if (txHash) params.set("txHash", txHash);

  try {
    const response = await fetch(
      `${BUNGEE_API_URL}/api/v1/bungee/status?${params.toString()}`,
      {
        headers: bungeeHeaders(),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Bungee status API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bridge status" },
      { status: 500 },
    );
  }
}
