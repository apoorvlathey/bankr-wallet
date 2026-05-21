import { NextRequest, NextResponse } from "next/server";
import { BUNGEE_API_URL, bungeeHeaders } from "../bungee";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get("quoteId");

  if (!quoteId) {
    return NextResponse.json(
      { error: "Missing required parameter: quoteId" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `${BUNGEE_API_URL}/api/v1/bungee/build-tx?quoteId=${encodeURIComponent(quoteId)}`,
      {
        headers: bungeeHeaders(),
        signal: AbortSignal.timeout(20_000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Bungee build-tx API error:", error);
    return NextResponse.json(
      { error: "Failed to build Bungee transaction" },
      { status: 500 },
    );
  }
}
