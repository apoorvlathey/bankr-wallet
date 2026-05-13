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
import { HexBlob } from "../shared/HexBlob";

const { fontFamily } = loadFont();

// Scene 1 — Hook. 136 frames / 4.53s. VO 4.18s.
// Three floating "approve this?" cards drift up the canvas. Headline above.
// VO: "Every day, millions of people sign transactions they can't actually read."
export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Crossfade in from the dark thumbnail behind
  const introFade = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  const cards = [
    { seed: 21, x: -180, baseY: 720, delay: 0, rot: -3 },
    { seed: 47, x: 60, baseY: 760, delay: 10, rot: 2 },
    { seed: 83, x: -90, baseY: 800, delay: 22, rot: -1 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.bgBright,
        opacity: introFade,
      }}
    >
      {/* Headline */}
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 0,
          right: 0,
          padding: "0 80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 70,
            color: tokens.ink,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
          }}
        >
          <AnimatedText text="Approve this?" delayFrames={6} unit="word" />
        </div>
      </div>

      {/* Floating cards */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {cards.map((c, i) => {
          const p = spring({
            frame: frame - c.delay,
            fps,
            config: { damping: 20, stiffness: 120, mass: 0.9 },
          });
          // Drift upward over the scene's lifetime
          const drift = interpolate(frame - c.delay, [0, 136], [0, -240], {
            extrapolateRight: "clamp",
            extrapolateLeft: "clamp",
          });
          const opacity = interpolate(
            frame,
            [c.delay, c.delay + 10, 124, 136],
            [0, 1, 1, 0],
            { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
          );
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: c.baseY + drift - 200,
                left: 540 + c.x,
                transform: `scale(${0.92 + p * 0.08}) rotate(${c.rot}deg)`,
                opacity,
              }}
            >
              <Card seed={c.seed} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Card: React.FC<{ seed: number }> = ({ seed }) => {
  return (
    <div
      style={{
        width: 360,
        borderRadius: 20,
        backgroundColor: tokens.bgPanel,
        boxShadow: tokens.shadowSoft,
        padding: 22,
        border: "1px solid rgba(20,20,40,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 18,
          color: tokens.inkMuted,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Transaction Request
      </div>
      <div
        style={{
          backgroundColor: "#F2F1EC",
          borderRadius: 12,
          padding: 14,
          maxHeight: 160,
          overflow: "hidden",
        }}
      >
        <HexBlob
          seed={seed}
          lines={9}
          charsPerLine={28}
          fontSize={12}
          color="#7A7A85"
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            padding: "10px 0",
            borderRadius: 10,
            backgroundColor: "#F2F1EC",
            color: tokens.inkMuted,
            fontFamily,
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Reject
        </div>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            padding: "10px 0",
            borderRadius: 10,
            backgroundColor: tokens.ink,
            color: tokens.inkOnDark,
            fontFamily,
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          Confirm
        </div>
      </div>
    </div>
  );
};
