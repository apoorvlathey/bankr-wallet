import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { WCHAN_VAULT_INDEXER_API_URL } from "../../constants";

/** 20 million sWCHAN (18 decimals) */
const PREMIUM_THRESHOLD = 20_000_000n * 10n ** 18n;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "Valid address required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `${WCHAN_VAULT_INDEXER_API_URL}/balances/${address.toLowerCase()}`,
      { next: { revalidate: 60 } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { isPremium: false, balance: "0" },
        {
          headers: { "Cache-Control": "public, max-age=60" },
        }
      );
    }

    const data = await res.json();
    const balance = BigInt(data.shares);

    return NextResponse.json(
      {
        isPremium: balance >= PREMIUM_THRESHOLD,
        balance: balance.toString(),
      },
      {
        headers: { "Cache-Control": "public, max-age=60" },
      }
    );
  } catch {
    return NextResponse.json(
      { isPremium: false, balance: "0" },
      { status: 502 }
    );
  }
}
