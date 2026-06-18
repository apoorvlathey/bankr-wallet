import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get("quoteId");

  if (!quoteId) {
    return NextResponse.json(
      { error: "Missing required parameter: quoteId" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Socket Swap V3 returns executable txData in /api/bridge/quote; build-tx is no longer used",
    },
    { status: 410 },
  );
}
