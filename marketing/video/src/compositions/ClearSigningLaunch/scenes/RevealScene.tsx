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

// Scene 4 — Reveal centerpiece. 228 frames / 7.6s. VO 7.15s.
//
// Layout: a single screenshot at center stage at any moment, so the user
// can actually read it. BEFORE is shown first, transitions via a violet
// flash + shockwave + scale crossfade into AFTER, which is then held with
// the ERC-7730 badge + "Human-readable, by default." caption.
//
// VO timing (Brian @ 30fps):
//   "That's clear signing."                      ~0–36f
//   "An open Ethereum standard, ERC 77 30,"      ~36–140f
//   "turning hex into plain English."            ~140–215f
//
// Transition lands ON "ERC seventy seven thirty" — the moment of clarity.

const TRANSITION_START = 65; // before begins anticipation pulse
const TRANSITION_FLASH = 75; // peak white flash + before swaps to after
const AFTER_SETTLE = 80; // after starts its spring-in
const BADGE_IN = 120;

const SCREENSHOT_WIDTH = 720;

export const RevealScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introFade = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  // BEFORE — slides in early, pulses up at transition, fades to flash
  const beforeIn = spring({
    frame: frame - 6,
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.7 },
  });
  const beforeOut = interpolate(
    frame,
    [TRANSITION_START + 4, TRANSITION_FLASH],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const beforeAnticipationScale = interpolate(
    frame,
    [TRANSITION_START - 10, TRANSITION_START + 4, TRANSITION_FLASH],
    [1, 1.05, 1.18],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const beforeGlowBuild = interpolate(
    frame,
    [TRANSITION_START - 5, TRANSITION_FLASH],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Flash — peaks at TRANSITION_FLASH
  const flashOpacity = interpolate(
    frame,
    [TRANSITION_FLASH - 3, TRANSITION_FLASH, TRANSITION_FLASH + 6],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Shockwave ring — grows out from center
  const shock = interpolate(
    frame,
    [TRANSITION_FLASH, TRANSITION_FLASH + 24],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const shockDiameter = shock * 1700;
  const shockOpacity = interpolate(shock, [0, 0.15, 1], [0, 1, 0]);
  const shockBorderWidth = interpolate(shock, [0, 1], [10, 1]);

  // AFTER — spring-in starting at TRANSITION_FLASH, then idle drift
  const afterIn = spring({
    frame: frame - AFTER_SETTLE,
    fps,
    config: { damping: 14, stiffness: 160, mass: 0.7 },
  });
  const afterIdleDrift = interpolate(
    frame - AFTER_SETTLE,
    [0, 100],
    [0, -6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Labels crossfade at the flash
  const beforeLabelOpacity = interpolate(
    frame,
    [TRANSITION_START + 2, TRANSITION_FLASH],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const afterLabelOpacity = interpolate(
    frame,
    [TRANSITION_FLASH, TRANSITION_FLASH + 10],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Bottom UI
  const badgeProgress = spring({
    frame: frame - BADGE_IN,
    fps,
    config: { damping: 16, stiffness: 160, mass: 0.6 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.bgDark,
        opacity: introFade,
      }}
    >
      {/* Background radial glow that pulses harder during transition */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at center, rgba(91,91,242,${0.05 + beforeGlowBuild * 0.18}) 0%, rgba(10,10,15,0) 55%)`,
          pointerEvents: "none",
        }}
      />

      {/* Eyebrow label — single position, crossfaded */}
      <div
        style={{
          position: "absolute",
          top: 70,
          left: 0,
          right: 0,
          textAlign: "center",
          height: 40,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            fontFamily,
            fontWeight: 800,
            fontSize: 30,
            color: tokens.danger,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            opacity: beforeLabelOpacity,
          }}
        >
          Before
        </span>
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            fontFamily,
            fontWeight: 800,
            fontSize: 30,
            color: tokens.success,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            opacity: afterLabelOpacity,
          }}
        >
          After
        </span>
      </div>

      {/* Centered screenshot stage */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* BEFORE — fades out at flash */}
        <div
          style={{
            position: "absolute",
            opacity: beforeIn * beforeOut,
            transform: `scale(${beforeAnticipationScale * (0.92 + beforeIn * 0.08)})`,
            filter: `drop-shadow(0 0 ${beforeGlowBuild * 80}px rgba(255,77,94,0.6))`,
          }}
        >
          <ScreenshotFrame
            src="screenshots/clearsigning-before.png"
            glow="danger"
            width={SCREENSHOT_WIDTH}
          />
        </div>

        {/* AFTER — springs in from flash */}
        <div
          style={{
            position: "absolute",
            opacity: afterIn,
            transform: `scale(${0.55 + afterIn * 0.45}) translateY(${afterIdleDrift}px)`,
          }}
        >
          <ScreenshotFrame
            src="screenshots/clearsigning-after.png"
            glow="success"
            width={SCREENSHOT_WIDTH}
          />
        </div>
      </div>

      {/* Shockwave ring — expands from the moment of flash */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: shockDiameter,
          height: shockDiameter,
          transform: "translate(-50%, -50%)",
          border: `${shockBorderWidth}px solid ${tokens.accent}`,
          borderRadius: "50%",
          opacity: shockOpacity,
          boxShadow: `0 0 60px ${tokens.accentGlow}`,
          pointerEvents: "none",
        }}
      />

      {/* Pure white/violet flash — quick, peaks at TRANSITION_FLASH */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#FFFFFF",
          opacity: flashOpacity,
          pointerEvents: "none",
        }}
      />

      {/* ERC-7730 badge — sits just below the screenshot, ABOVE the
          caption zone (bottom: ~130). The "Human-readable, by default."
          headline is now delivered by the TikTok-style word captions
          driven by the VO transcript. */}
      <div
        style={{
          position: "absolute",
          bottom: 260,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            opacity: badgeProgress,
            transform: `scale(${0.85 + badgeProgress * 0.15})`,
            backgroundColor: tokens.accent,
            color: "#FFFFFF",
            padding: "10px 22px",
            borderRadius: 999,
            fontFamily,
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "0.02em",
            boxShadow: `0 12px 30px ${tokens.accentGlow}`,
          }}
        >
          ERC-7730
        </div>
      </div>
    </AbsoluteFill>
  );
};
