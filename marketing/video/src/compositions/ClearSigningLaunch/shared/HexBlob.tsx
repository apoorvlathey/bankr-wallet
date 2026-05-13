import React from "react";

// Render a block of pseudo-calldata that LOOKS authentic without being
// a real selector. Lines are deterministic so identical instances render
// identically (no flicker across frames).

const HEX_CHARS = "0123456789abcdef";

function det(seed: number, len: number) {
  let s = "";
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    s += HEX_CHARS[seed % 16];
  }
  return s;
}

interface Props {
  seed?: number;
  lines?: number;
  charsPerLine?: number;
  fontSize?: number;
  color?: string;
  style?: React.CSSProperties;
}

export const HexBlob: React.FC<Props> = ({
  seed = 7,
  lines = 16,
  charsPerLine = 42,
  fontSize = 13,
  color = "#6E6E80",
  style,
}) => {
  const rows = React.useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < lines; i++) {
      out.push(det(seed + i * 9301, charsPerLine));
    }
    return out;
  }, [seed, lines, charsPerLine]);

  return (
    <div
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize,
        lineHeight: 1.45,
        color,
        wordBreak: "break-all",
        ...style,
      }}
    >
      {rows.map((r, i) => (
        <div key={i}>{r}</div>
      ))}
    </div>
  );
};
