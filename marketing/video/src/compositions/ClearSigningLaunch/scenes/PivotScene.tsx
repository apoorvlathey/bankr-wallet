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

// Scene 3 — Pivot. 95 frames / 3.17s. VO 2.88s.
// A horizontal divider line draws across the canvas, headline springs in.
// VO: "What if your wallet just told you what you're about to do?"
export const PivotScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lineProgress = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 120, mass: 0.8 },
  });

  const accentDot = spring({
    frame: frame - 8,
    fps,
    config: { damping: 14, stiffness: 200, mass: 0.5 },
  });

  // Headline appears AFTER the line draws — line is the visual focus first.
  const HEADLINE_DELAY = 22;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.bgBright,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Draw-in horizontal line */}
      <div
        style={{
          width: 800,
          height: 4,
          backgroundColor: tokens.ink,
          transform: `scaleX(${lineProgress})`,
          transformOrigin: "left center",
          marginBottom: 60,
          position: "relative",
        }}
      >
        {/* Accent dot riding the end of the line */}
        <div
          style={{
            position: "absolute",
            right: -10,
            top: -10,
            width: 24,
            height: 24,
            borderRadius: "50%",
            backgroundColor: tokens.accent,
            opacity: accentDot,
            transform: `scale(${accentDot})`,
            boxShadow: `0 0 30px ${tokens.accentGlow}`,
          }}
        />
      </div>

      {/* Headline */}
      <div
        style={{
          padding: "0 80px",
          textAlign: "center",
          maxWidth: 920,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 64,
            color: tokens.ink,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            opacity: interpolate(frame, [HEADLINE_DELAY, HEADLINE_DELAY + 6], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          <AnimatedText
            text="What if your wallet just told you what it does?"
            delayFrames={HEADLINE_DELAY}
            staggerFrames={3}
            unit="word"
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
