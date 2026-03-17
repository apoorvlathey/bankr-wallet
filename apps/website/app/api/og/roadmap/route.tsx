import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  const outfitBold = await fetch(
    "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf"
  ).then((res) => res.arrayBuffer());

  const outfitBlack = await fetch(
    "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4ZmyC4E.ttf"
  ).then((res) => res.arrayBuffer());

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
            width: 340,
            backgroundColor: "#1040C0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* WalletChan icon centered in blue panel */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://walletchan.com/images/walletchan-icon-nobg.png"
            width={200}
            height={200}
            alt=""
            style={{ opacity: 0.9 }}
          />
          {/* Red square accent */}
          <div
            style={{
              position: "absolute",
              bottom: 60,
              left: 40,
              width: 50,
              height: 50,
              backgroundColor: "#D02020",
            }}
          />
          {/* Yellow triangle accent */}
          <div
            style={{
              position: "absolute",
              top: 50,
              right: 50,
              width: 0,
              height: 0,
              borderLeft: "30px solid transparent",
              borderRight: "30px solid transparent",
              borderBottom: "52px solid #F0C020",
            }}
          />
          {/* Small white square */}
          <div
            style={{
              position: "absolute",
              top: 160,
              left: 60,
              width: 24,
              height: 24,
              backgroundColor: "#FFFFFF",
              opacity: 0.4,
              transform: "rotate(45deg)",
            }}
          />
        </div>

        {/* Divider line between content and right panel */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 340,
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
            width: 860,
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
              marginBottom: 28,
            }}
          />

          {/* ROADMAP heading */}
          <div
            style={{
              fontSize: 108,
              fontFamily: "Outfit",
              fontWeight: 900,
              color: "#121212",
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
              marginBottom: 20,
            }}
          >
            ROADMAP
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 26,
              fontFamily: "Outfit",
              fontWeight: 700,
              color: "#121212",
              opacity: 0.65,
              marginBottom: 36,
            }}
          >
            What we&apos;re building and what&apos;s next
          </div>

          {/* Status pills row */}
          <div
            style={{
              display: "flex",
              gap: 12,
            }}
          >
            {[
              { emoji: "\u2705", label: "DONE", bg: "#FFFFFF" },
              { emoji: "\uD83D\uDEA7", label: "IN PROGRESS", bg: "#FFFFFF" },
              { emoji: "\uD83D\uDCCB", label: "PLANNED", bg: "#FFFFFF" },
              { emoji: "\uD83D\uDCA1", label: "IDEA", bg: "#FFFFFF" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: item.bg,
                  border: "3px solid #121212",
                  padding: "6px 14px",
                  boxShadow: "3px 3px 0px 0px #121212",
                }}
              >
                <span style={{ fontSize: 18 }}>{item.emoji}</span>
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: "Outfit",
                    fontWeight: 700,
                    color: "#121212",
                    letterSpacing: "0.06em",
                  }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Small red circle decoration on yellow side */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 70,
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: "#D02020",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Outfit",
          data: outfitBold,
          weight: 700,
          style: "normal",
        },
        {
          name: "Outfit",
          data: outfitBlack,
          weight: 900,
          style: "normal",
        },
      ],
    }
  );
}
