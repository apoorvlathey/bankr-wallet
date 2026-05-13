import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";
import { tokens } from "../shared/tokens";
import { AnimatedText } from "../shared/AnimatedText";

const { fontFamily } = loadFont();

// Scene 2 — Stakes. 112 frames / 3.73s. VO 3.39s.
// Stat stack: Bybit $1.5B → Radiant $50M → "Billions, lost to blind signing"
// VO: "Bybit. Radiant. Billions, lost to blind signing."
export const StakesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stats = [
    { label: "Bybit", value: "$1.5B", delay: 0 },
    { label: "Radiant Capital", value: "$50M", delay: 18 },
  ];

  const summaryProgress = spring({
    frame: frame - 50,
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.7 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.bgBright,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontFamily,
          fontWeight: 600,
          fontSize: 22,
          color: tokens.inkMuted,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateRight: "clamp",
          }),
        }}
      >
        Drained by blind signing
      </div>

      {/* Stat rows */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          width: 720,
        }}
      >
        {stats.map((s, i) => {
          const p = spring({
            frame: frame - s.delay,
            fps,
            config: { damping: 18, stiffness: 160, mass: 0.6 },
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "22px 36px",
                backgroundColor: tokens.bgPanel,
                borderRadius: 18,
                boxShadow: tokens.shadowSoft,
                border: "1px solid rgba(20,20,40,0.05)",
                opacity: p,
                transform: `translateY(${(1 - p) * 24}px)`,
              }}
            >
              <span
                style={{
                  fontFamily,
                  fontWeight: 700,
                  fontSize: 38,
                  color: tokens.ink,
                  letterSpacing: "-0.02em",
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  fontFamily,
                  fontWeight: 900,
                  fontSize: 64,
                  color: tokens.danger,
                  letterSpacing: "-0.04em",
                }}
              >
                {s.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div
        style={{
          marginTop: 28,
          opacity: summaryProgress,
          transform: `translateY(${(1 - summaryProgress) * 18}px)`,
          textAlign: "center",
          padding: "0 80px",
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 52,
            color: tokens.ink,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          <AnimatedText
            text="Billions, lost to blind signing."
            delayFrames={52}
            unit="word"
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
