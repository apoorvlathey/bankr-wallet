import { NextRequest, NextResponse } from "next/server";
import { isOfficialWalletChanHostMention } from "../../lib/siteRouting";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    // HEAD request to check response headers without downloading body
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WalletChan/1.0)",
      },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });

    const xFrameOptions = res.headers.get("x-frame-options")?.toLowerCase() ?? "";
    const csp = res.headers.get("content-security-policy")?.toLowerCase() ?? "";

    // X-Frame-Options: DENY or SAMEORIGIN blocks embedding
    const xfoBlocked = xFrameOptions === "deny" || xFrameOptions === "sameorigin";

    // CSP frame-ancestors: check if it restricts to self/specific domains only
    let cspBlocked = false;
    const frameAncestorsMatch = csp.match(/frame-ancestors\s+([^;]+)/);
    if (frameAncestorsMatch) {
      const value = frameAncestorsMatch[1].trim();
      // 'none' blocks all embedding
      if (value === "'none'") {
        cspBlocked = true;
      }
      // 'self' without wildcard blocks cross-origin embedding
      else if (value.includes("'self'") && !value.includes("*")) {
        cspBlocked = true;
      }
      // If it lists specific domains but no wildcard, likely blocked for us
      else if (
        !value.includes("*") &&
        !isOfficialWalletChanHostMention(value)
      ) {
        cspBlocked = true;
      }
    }

    return NextResponse.json(
      { blocked: xfoBlocked || cspBlocked },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    // If we can't reach the site, don't block — let the iframe try
    return NextResponse.json({ blocked: false });
  }
}
