import { ImageResponse } from "next/og";

export const runtime = "edge";

// Resolve at module level so the bundler inlines the font data
const outfitBoldPromise = fetch(
  new URL("../_fonts/outfit-bold.ttf", import.meta.url)
).then((res) => res.arrayBuffer());

const outfitBlackPromise = fetch(
  new URL("../_fonts/outfit-black.ttf", import.meta.url)
).then((res) => res.arrayBuffer());

export async function GET() {
  const [outfitBold, outfitBlack] = await Promise.all([
    outfitBoldPromise,
    outfitBlackPromise,
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#F0C020",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Full black frame border */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "6px solid #121212",
          }}
        />

        {/* Right panel — blue color block */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            backgroundColor: "#1040C0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* WalletChan icon — large and prominent */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://walletchan.com/images/walletchan-icon-nobg.png"
            width={240}
            height={240}
            alt=""
            style={{ opacity: 0.95 }}
          />

          {/* Red square accent */}
          <div
            style={{
              position: "absolute",
              bottom: 50,
              left: 40,
              width: 40,
              height: 40,
              backgroundColor: "#D02020",
            }}
          />
          {/* Yellow triangle accent */}
          <div
            style={{
              position: "absolute",
              top: 45,
              right: 45,
              width: 0,
              height: 0,
              borderLeft: "28px solid transparent",
              borderRight: "28px solid transparent",
              borderBottom: "48px solid #F0C020",
            }}
          />
          {/* Small white rotated square */}
          <div
            style={{
              position: "absolute",
              top: 170,
              left: 55,
              width: 22,
              height: 22,
              backgroundColor: "#FFFFFF",
              opacity: 0.35,
              transform: "rotate(45deg)",
            }}
          />
        </div>

        {/* Divider line between content and right panel */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 380,
            bottom: 0,
            width: 6,
            backgroundColor: "#121212",
          }}
        />

        {/* Main content — left side */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "50px 70px",
            width: 820,
            height: "100%",
          }}
        >
          {/* WalletChan branding */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 20,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://walletchan.com/images/walletchan-icon-nobg.png"
              width={52}
              height={52}
              alt=""
            />
            <span
              style={{
                fontSize: 26,
                fontFamily: "Outfit",
                fontWeight: 700,
                color: "#121212",
                letterSpacing: "-0.02em",
              }}
            >
              WALLETCHAN
            </span>
          </div>

          {/* Thick divider line */}
          <div
            style={{
              width: 100,
              height: 6,
              backgroundColor: "#121212",
              marginBottom: 24,
            }}
          />

          {/* Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: "#FFFFFF",
              border: "3px solid #121212",
              padding: "6px 16px",
              boxShadow: "3px 3px 0px 0px #121212",
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontFamily: "Outfit",
                fontWeight: 700,
                color: "#121212",
                letterSpacing: "0.08em",
              }}
            >
              WALLET NOW SUPPORTS
            </span>
          </div>

          {/* BNB CHAIN heading with icon */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 4,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cryptologos.cc/logos/bnb-bnb-logo.svg?v=040"
              width={100}
              height={100}
              alt=""
            />
            <span
              style={{
                fontSize: 108,
                fontFamily: "Outfit",
                fontWeight: 900,
                color: "#121212",
                letterSpacing: "-0.04em",
                lineHeight: 0.95,
              }}
            >
              BNB CHAIN
            </span>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 24,
              fontFamily: "Outfit",
              fontWeight: 700,
              color: "#121212",
              opacity: 0.55,
              marginTop: 20,
            }}
          >
            Swap, send, and browse dapps on BNB Chain
          </div>
        </div>

        {/* walletchan.com URL — bottom right on blue panel */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 30,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontFamily: "Outfit",
              fontWeight: 700,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.02em",
            }}
          >
            walletchan.com
          </span>
        </div>

        {/* Small red circle decoration on yellow side */}
        <div
          style={{
            position: "absolute",
            bottom: 35,
            left: 70,
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: "#D02020",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 675,
      fonts: [
        {
          name: "Outfit",
          data: outfitBold,
          weight: 700,
          style: "normal" as const,
        },
        {
          name: "Outfit",
          data: outfitBlack,
          weight: 900,
          style: "normal" as const,
        },
      ],
    }
  );
}
