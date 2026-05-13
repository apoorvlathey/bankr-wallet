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
import { ScreenshotFrame } from "../shared/ScreenshotFrame";

const { fontFamily } = loadFont();

// Scene 0 — Cold open. Black bg, brutalist BEFORE / AFTER reveal.
// Designed so the Twitter poster freeze-frame lands here.
// 45 frames / 1.5s total: ~15f phones snap in, hold ~20f, ~10f wipe out.
export const ThumbnailScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Phones snap in
  const phoneProgress = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 200, mass: 0.7 },
  });

  // Headlines drop in slightly after
  const headlineProgress = spring({
    frame: frame - 4,
    fps,
    config: { damping: 16, stiffness: 180, mass: 0.6 },
  });

  // Outro — quick zoom-burst over last 8 frames
  const outroStart = 37;
  const outroT = Math.max(0, Math.min(1, (frame - outroStart) / 8));
  const outroScale = 1 + outroT * 0.35;
  const outroOpacity = 1 - outroT;

  // Phones drift in from outside
  const leftX = interpolate(phoneProgress, [0, 1], [-120, 0]);
  const rightX = interpolate(phoneProgress, [0, 1], [120, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.bgDark,
        opacity: outroOpacity,
        transform: `scale(${outroScale})`,
      }}
    >
      {/* Subtle red/green ambient glow behind the phones */}
      <div
        style={{
          position: "absolute",
          left: -120,
          top: 120,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,77,94,0.25) 0%, rgba(255,77,94,0) 65%)",
          opacity: phoneProgress,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -120,
          top: 120,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(74,222,128,0.25) 0%, rgba(74,222,128,0) 65%)",
          opacity: phoneProgress,
        }}
      />

      {/* BEFORE / AFTER headlines */}
      <div
        style={{
          position: "absolute",
          top: 90,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-around",
          opacity: headlineProgress,
          transform: `translateY(${(1 - headlineProgress) * -20}px)`,
        }}
      >
        <span
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 96,
            color: tokens.inkOnDark,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
          }}
        >
          Before
        </span>
        <span
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 96,
            color: tokens.inkOnDark,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
          }}
        >
          After
        </span>
      </div>

      {/* Phone row */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 60,
          paddingTop: 60,
        }}
      >
        {/* BEFORE — raw hex screenshot */}
        <div
          style={{
            opacity: phoneProgress,
            transform: `translateX(${leftX}px) rotate(${(1 - phoneProgress) * -4}deg)`,
          }}
        >
          <ScreenshotFrame
            src="screenshots/clearsigning-before.png"
            glow="danger"
            width={400}
          />
        </div>

        {/* AFTER — clear-signed screenshot */}
        <div
          style={{
            opacity: phoneProgress,
            transform: `translateX(${rightX}px) rotate(${(1 - phoneProgress) * 4}deg)`,
          }}
        >
          <ScreenshotFrame
            src="screenshots/clearsigning-after.png"
            glow="success"
            width={400}
          />
        </div>
      </div>

      {/* Vertical divider hairline */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          bottom: "20%",
          left: "50%",
          width: 1,
          backgroundColor: "rgba(255,255,255,0.12)",
          opacity: headlineProgress,
        }}
      />
    </AbsoluteFill>
  );
};
