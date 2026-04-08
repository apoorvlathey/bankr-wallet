import { ImageResponse } from "next/og";

export const runtime = "edge";

const outfitBoldPromise = fetch(
  new URL("../_fonts/outfit-bold.ttf", import.meta.url)
).then((res) => res.arrayBuffer());

const outfitBlackPromise = fetch(
  new URL("../_fonts/outfit-black.ttf", import.meta.url)
).then((res) => res.arrayBuffer());

const SIZE = 1080;

const COLORS = {
  black: "#121212",
  red: "#D02020",
  blue: "#1040C0",
  yellow: "#F0C020",
  white: "#FFFFFF",
  lightGray: "#F5F5F5",
  midGray: "#E0E0E0",
  textGray: "#888888",
};

type RowData = {
  label: string;
  simulateV1: { text: string; status: "ok" | "warn" | "miss"; sub?: string };
  balanceDiff: { text: string; status: "ok" | "warn" | "miss"; sub?: string };
  highlight?: boolean;
};

const rows: RowData[] = [
  {
    label: "Standard ERC-20",
    simulateV1: { status: "ok", text: "Correct" },
    balanceDiff: { status: "ok", text: "Correct" },
  },
  {
    label: "Native ETH",
    simulateV1: { status: "ok", text: "Correct", sub: "traceTransfers" },
    balanceDiff: { status: "ok", text: "Correct" },
  },
  {
    label: "Fee-on-transfer",
    simulateV1: { status: "warn", text: "Impl. dependent" },
    balanceDiff: { status: "ok", text: "Always correct" },
  },
  {
    label: "Rebasing tokens",
    simulateV1: { status: "miss", text: "Missed" },
    balanceDiff: { status: "ok", text: "Caught" },
    highlight: true,
  },
  {
    label: "RPC calls",
    simulateV1: { status: "ok", text: "1" },
    balanceDiff: { status: "warn", text: "2" },
  },
  {
    label: "Multi-tx",
    simulateV1: { status: "ok", text: "Native" },
    balanceDiff: { status: "warn", text: "Custom contract" },
  },
  {
    label: "Chain support",
    simulateV1: { status: "warn", text: "Geth 1.14.9+", sub: "Sep 2024" },
    balanceDiff: { status: "ok", text: "Any Berlin+ chain", sub: "Apr 2021" },
  },
];

function StatusDot({ status }: { status: "ok" | "warn" | "miss" }) {
  const bg =
    status === "ok"
      ? COLORS.blue
      : status === "miss"
        ? COLORS.red
        : COLORS.yellow;

  return (
    <div
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        backgroundColor: bg,
        marginRight: 10,
        flexShrink: 0,
      }}
    />
  );
}

function Cell({
  data,
}: {
  data: { text: string; status: "ok" | "warn" | "miss"; sub?: string };
}) {
  const textColor =
    data.status === "ok"
      ? COLORS.blue
      : data.status === "miss"
        ? COLORS.red
        : COLORS.black;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: "0 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusDot status={data.status} />
        <span
          style={{
            fontSize: 20,
            fontFamily: "Outfit",
            fontWeight: 700,
            color: textColor,
          }}
        >
          {data.text}
        </span>
      </div>
      {data.sub && (
        <span
          style={{
            fontSize: 14,
            fontFamily: "Outfit",
            fontWeight: 700,
            color: COLORS.textGray,
            marginTop: 2,
          }}
        >
          {data.sub}
        </span>
      )}
    </div>
  );
}

export async function GET() {
  const [outfitBold, outfitBlack] = await Promise.all([
    outfitBoldPromise,
    outfitBlackPromise,
  ]);

  const ROW_HEIGHT = 82;
  const HEADER_HEIGHT = 84;
  const LABEL_WIDTH = 260;
  const TABLE_PADDING = 40;

  return new ImageResponse(
    (
      <div
        style={{
          width: SIZE,
          height: SIZE,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: COLORS.white,
          position: "relative",
          fontFamily: "Outfit",
        }}
      >
        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 16,
            }}
          >
            <span
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: COLORS.black,
                letterSpacing: "-0.03em",
              }}
            >
              Log Parsing
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: COLORS.textGray,
              }}
            >
              vs
            </span>
            <span
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: COLORS.blue,
                letterSpacing: "-0.03em",
              }}
            >
              Balance Diffing
            </span>
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.textGray,
              marginTop: 8,
            }}
          >
            Which approach gives you accurate asset changes?
          </span>
        </div>

        {/* Table */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            margin: `16px ${TABLE_PADDING}px 0`,
            border: `3px solid ${COLORS.black}`,
            boxShadow: `5px 5px 0px 0px ${COLORS.black}`,
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              height: HEADER_HEIGHT,
              backgroundColor: COLORS.lightGray,
              borderBottom: `2px solid ${COLORS.black}`,
            }}
          >
            {/* Empty label cell */}
            <div
              style={{
                display: "flex",
                width: LABEL_WIDTH,
                borderRight: `2px solid ${COLORS.midGray}`,
              }}
            />
            {/* simulateV1 header */}
            <div
              style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderRight: `2px solid ${COLORS.midGray}`,
              }}
            >
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: COLORS.black,
                }}
              >
                eth_simulateV1
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.textGray,
                  marginTop: 2,
                }}
              >
                parse event logs
              </span>
            </div>
            {/* balanceOf header */}
            <div
              style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: COLORS.black,
                }}
              >
                balanceOf diffing
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.textGray,
                  marginTop: 2,
                }}
              >
                snapshot before &amp; after
              </span>
            </div>
          </div>

          {/* Data rows */}
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                height: ROW_HEIGHT,
                backgroundColor: row.highlight
                  ? "rgba(208, 32, 32, 0.1)"
                  : i % 2 === 0
                    ? COLORS.white
                    : COLORS.lightGray,
                borderBottom:
                  i < rows.length - 1
                    ? `1px solid ${COLORS.midGray}`
                    : "none",
              }}
            >
              {/* Row label */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: LABEL_WIDTH,
                  paddingLeft: 24,
                  borderRight: `2px solid ${COLORS.midGray}`,
                }}
              >
                <span
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    color: COLORS.black,
                  }}
                >
                  {row.label}
                </span>
              </div>
              {/* simulateV1 cell */}
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRight: `2px solid ${COLORS.midGray}`,
                }}
              >
                <Cell data={row.simulateV1} />
              </div>
              {/* balanceOf cell */}
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Cell data={row.balanceDiff} />
              </div>
            </div>
          ))}
        </div>

        {/* Bottom label */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 28,
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: COLORS.black,
            }}
          >
            Neither is strictly better — they solve different problems
          </span>
          <div
            style={{
              width: 200,
              height: 4,
              backgroundColor: COLORS.yellow,
              marginTop: 10,
            }}
          />
        </div>

        {/* Bauhaus accents */}
        {/* Yellow circle — top left */}
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 42,
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: COLORS.yellow,
          }}
        />
        {/* Blue triangle — top right */}
        <div
          style={{
            position: "absolute",
            top: 44,
            right: 44,
            width: 0,
            height: 0,
            borderLeft: "14px solid transparent",
            borderRight: "14px solid transparent",
            borderBottom: `24px solid ${COLORS.blue}`,
          }}
        />
        {/* Red square — bottom left */}
        <div
          style={{
            position: "absolute",
            bottom: 38,
            left: 44,
            width: 16,
            height: 16,
            backgroundColor: COLORS.red,
          }}
        />

        {/* walletchan.com watermark + logo */}
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://walletchan.com/images/walletchan-icon-nobg.png"
            width={36}
            height={36}
            alt=""
          />
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.textGray,
            }}
          >
            walletchan.com
          </span>
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
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
