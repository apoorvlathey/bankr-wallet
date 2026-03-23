import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WalletChan/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(5000),
    });

    const html = await res.text();

    // Extract title
    const titleMatch =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/) ??
      html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:title"/) ??
      html.match(/<title[^>]*>([^<]*)<\/title>/);
    const title = titleMatch?.[1]?.trim() || null;

    // Extract description
    const descMatch =
      html.match(
        /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/)  ??
      html.match(
        /<meta[^>]+content="([^"]*)"[^>]+property="og:description"/) ??
      html.match(
        /<meta[^>]+name="description"[^>]+content="([^"]*)"/) ??
      html.match(
        /<meta[^>]+content="([^"]*)"[^>]+name="description"/);
    const description = descMatch?.[1]?.trim() || null;

    return NextResponse.json(
      { title, description },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return NextResponse.json({ title: null, description: null });
  }
}
