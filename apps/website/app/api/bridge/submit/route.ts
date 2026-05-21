import { NextRequest, NextResponse } from "next/server";
import { BUNGEE_API_URL, bungeeHeaders } from "../bungee";

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

  if (
    typeof body !== "object" ||
    body === null ||
    !("quoteId" in body) ||
    !("userSignature" in body)
  ) {
    return NextResponse.json(
      { error: "Body must include quoteId, requestType, request, userSignature" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${BUNGEE_API_URL}/api/v1/bungee/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...bungeeHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Bungee submit API error:", error);
    return NextResponse.json(
      { error: "Failed to submit bridge request" },
      { status: 500 },
    );
  }
}
