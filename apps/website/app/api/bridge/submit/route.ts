import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || !("quoteId" in body)) {
    return NextResponse.json(
      { error: "Body must include quoteId" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Socket Swap V3 has no submit endpoint; send txData.object directly on-chain",
    },
    { status: 410 },
  );
}
