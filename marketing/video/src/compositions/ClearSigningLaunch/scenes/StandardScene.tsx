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

// Scene 5 — Standard / credibility. 105 frames / 3.5s. VO 3.16s.
// Three pill rows stagger in. Backers text-only (no logos).
// VO: "Backed by the Ethereum Foundation and the wider ecosystem."
export const StandardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introFade = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  const pills = [
    { icon: "○", label: "Open standard", delay: 4 },
    { icon: "◇", label: "Mirrorable registry", delay: 16 },
    { icon: "✓", label: "Auditor attestations (ERC-8176)", delay: 28 },
  ];

  const backersIn = spring({
    frame: frame - 60,
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.7 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.bgBright,
        opacity: introFade,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 600,
          fontSize: 22,
          color: tokens.inkMuted,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        An open Ethereum standard
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          width: 760,
        }}
      >
        {pills.map((p, i) => {
          const prog = spring({
            frame: frame - p.delay,
            fps,
            config: { damping: 18, stiffness: 160, mass: 0.6 },
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "20px 28px",
                backgroundColor: tokens.bgPanel,
                borderRadius: 999,
                boxShadow: tokens.shadowSoft,
                border: "1px solid rgba(20,20,40,0.05)",
                opacity: prog,
                transform: `translateX(${(1 - prog) * -30}px)`,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  backgroundColor: tokens.accentSoft,
                  color: tokens.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily,
                  fontWeight: 800,
                  fontSize: 22,
                }}
              >
                {p.icon}
              </div>
              <span
                style={{
                  fontFamily,
                  fontWeight: 700,
                  fontSize: 30,
                  color: tokens.ink,
                  letterSpacing: "-0.02em",
                }}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Backers */}
      <div
        style={{
          marginTop: 12,
          opacity: backersIn,
          transform: `translateY(${(1 - backersIn) * 14}px)`,
          textAlign: "center",
          padding: "0 80px",
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 600,
            fontSize: 26,
            color: tokens.inkMuted,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}
        >
          <AnimatedText
            text="Backed by the Ethereum Foundation and the wider ecosystem."
            delayFrames={62}
            staggerFrames={2}
            unit="word"
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
