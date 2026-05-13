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

const { fontFamily } = loadFont();

// Scene 7 — CTA. 52 frames / 1.73s. VO 1.21s.
// "Finally readable." headline + URL pill. Watermark already onscreen.
// VO: "Finally readable."
export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineIn = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 180, mass: 0.6 },
  });

  const urlIn = spring({
    frame: frame - 14,
    fps,
    config: { damping: 18, stiffness: 160, mass: 0.7 },
  });

  const learnIn = interpolate(frame, [28, 42], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.bgBright,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
      }}
    >
      {/* Big headline */}
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 110,
          color: tokens.ink,
          letterSpacing: "-0.04em",
          opacity: headlineIn,
          transform: `scale(${0.92 + headlineIn * 0.08})`,
          lineHeight: 1,
        }}
      >
        Finally readable.
      </div>

      {/* URL pill */}
      <div
        style={{
          backgroundColor: tokens.ink,
          color: tokens.inkOnDark,
          padding: "20px 40px",
          borderRadius: 999,
          fontFamily,
          fontWeight: 800,
          fontSize: 38,
          letterSpacing: "-0.01em",
          opacity: urlIn,
          transform: `scale(${0.9 + urlIn * 0.1})`,
          boxShadow: tokens.shadowMd,
        }}
      >
        walletchan.com
      </div>

      {/* Tiny learn-more link */}
      <div
        style={{
          fontFamily,
          fontWeight: 600,
          fontSize: 18,
          color: tokens.inkMuted,
          opacity: learnIn,
          letterSpacing: "0.02em",
        }}
      >
        Learn more → clearsigning.org
      </div>
    </AbsoluteFill>
  );
};
