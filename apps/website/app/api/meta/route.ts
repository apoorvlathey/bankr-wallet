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

    // Extract favicon
    const origin = new URL(url).origin;
    // Try: og:image, apple-touch-icon, shortcut icon, icon link, then /favicon.ico
    const ogImageMatch =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/) ??
      html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:image"/);
    const appleTouchMatch = html.match(
      /<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]*)"/
    ) ?? html.match(
      /<link[^>]+href="([^"]*)"[^>]+rel="apple-touch-icon"/
    );
    const iconLinkMatch =
      html.match(/<link[^>]+rel="(?:shortcut )?icon"[^>]+href="([^"]*)"/) ??
      html.match(/<link[^>]+href="([^"]*)"[^>]+rel="(?:shortcut )?icon"/);

    let favicon: string | null = null;
    const rawFavicon = appleTouchMatch?.[1] ?? iconLinkMatch?.[1] ?? ogImageMatch?.[1] ?? null;
    if (rawFavicon) {
      try {
        favicon = new URL(rawFavicon, origin).href;
      } catch {
        favicon = rawFavicon;
      }
    }

    return NextResponse.json(
      { title, description, favicon },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return NextResponse.json({ title: null, description: null, favicon: null });
  }
}
