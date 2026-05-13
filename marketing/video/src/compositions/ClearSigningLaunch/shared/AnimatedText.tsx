import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

// Lightweight per-char/word stagger-blur in the spirit of remotion-bits'
// AnimatedText. Local impl avoids pulling in the package; same API surface.

type Unit = "char" | "word";

interface Props {
  text: string;
  unit?: Unit;
  delayFrames?: number; // global delay before first unit starts
  staggerFrames?: number; // frames between successive units
  blur?: boolean; // animate blur from ~10px → 0
  style?: React.CSSProperties;
  className?: string;
}

export const AnimatedText: React.FC<Props> = ({
  text,
  unit = "word",
  delayFrames = 0,
  staggerFrames = 2,
  blur = true,
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const units = unit === "char" ? text.split("") : text.split(" ");

  return (
    <span style={{ display: "inline-block", ...style }} className={className}>
      {units.map((u, i) => {
        const p = spring({
          frame: frame - delayFrames - i * staggerFrames,
          fps,
          config: { damping: 18, stiffness: 140, mass: 0.6 },
        });
        const translateY = (1 - p) * 18;
        const blurPx = blur ? (1 - p) * 10 : 0;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${translateY}px)`,
              filter: `blur(${blurPx}px)`,
              whiteSpace: "pre",
            }}
          >
            {u}
            {unit === "word" && i < units.length - 1 ? " " : ""}
          </span>
        );
      })}
    </span>
  );
};
