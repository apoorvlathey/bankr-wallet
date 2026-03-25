import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  const outfitBold = await fetch(
    "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf",
  ).then((res) => res.arrayBuffer());

  const outfitBlack = await fetch(
    "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4ZmyC4E.ttf",
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background:
          "linear-gradient(135deg, #0a1628 0%, #0e2a4a 40%, #132e50 60%, #091a30 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle grid pattern overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(16,64,192,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,64,192,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Right panel — dark blue accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 380,
          background:
            "linear-gradient(180deg, #0a1628 0%, #1040C0 50%, #0a1628 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* WalletChan icon */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://walletchan.com/images/walletchan-icon-nobg.png"
          width={220}
          height={220}
          alt=""
          style={{ opacity: 0.95 }}
        />
        {/* URL below logo */}
        <div
          style={{
            fontSize: 18,
            fontFamily: "Outfit",
            fontWeight: 700,
            color: "rgba(255,255,255,0.4)",
            marginTop: 16,
            letterSpacing: "0.02em",
          }}
        >
          os.walletchan.com
        </div>

        {/* Decorative shapes */}
        <div
          style={{
            position: "absolute",
            top: 50,
            right: 50,
            width: 40,
            height: 40,
            backgroundColor: "#F0C020",
            opacity: 0.3,
            transform: "rotate(45deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 40,
            width: 30,
            height: 30,
            borderRadius: "50%",
            backgroundColor: "#D02020",
            opacity: 0.4,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 160,
            left: 60,
            width: 20,
            height: 20,
            backgroundColor: "#FFFFFF",
            opacity: 0.15,
          }}
        />
      </div>

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
            marginBottom: 24,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://walletchan.com/images/walletchan-icon-nobg.png"
            width={44}
            height={44}
            alt=""
          />
          <span
            style={{
              fontSize: 22,
              fontFamily: "Outfit",
              fontWeight: 700,
              color: "rgba(255,255,255,0.6)",
              letterSpacing: "0.08em",
            }}
          >
            WALLETCHAN
          </span>
        </div>

        {/* Thin accent line */}
        <div
          style={{
            width: 60,
            height: 3,
            backgroundColor: "#F0C020",
            marginBottom: 28,
          }}
        />

        {/* OS heading */}
        <div
          style={{
            fontSize: 100,
            fontFamily: "Outfit",
            fontWeight: 900,
            color: "#FFFFFF",
            letterSpacing: "-0.04em",
            lineHeight: 0.9,
            marginBottom: 8,
          }}
        >
          WalletChan
        </div>
        <div
          style={{
            fontSize: 100,
            fontFamily: "Outfit",
            fontWeight: 900,
            color: "#F0C020",
            letterSpacing: "-0.04em",
            lineHeight: 0.9,
            marginBottom: 24,
          }}
        >
          OS
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 26,
            fontFamily: "Outfit",
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          Your Web3 Operating System
        </div>
      </div>

      {/* Small yellow circle decoration */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 70,
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: "#F0C020",
          opacity: 0.3,
        }}
      />
    </div>,
    {
      width: 1200,
      height: 630,
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
    },
  );
}
