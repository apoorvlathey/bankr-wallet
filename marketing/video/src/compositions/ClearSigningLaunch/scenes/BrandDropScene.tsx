import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";
import { tokens } from "../shared/tokens";
import { AnimatedText } from "../shared/AnimatedText";

const { fontFamily } = loadFont();

// Scene 6 — Brand drop. 104 frames / 3.47s. VO 3.20s.
// WalletChan icon springs in, particle burst, headline rises.
// VO: "Now live in WalletChan. Every dapp. Every transaction."
export const BrandDropScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const iconIn = spring({
    frame: frame - 4,
    fps,
    config: { damping: 11, stiffness: 200, mass: 0.5 },
  });

  // Particle burst — fires at frame 8 when icon hits its scale plateau
  const burstFrame = 8;
  const burstT = Math.max(0, (frame - burstFrame) / 30);

  const PARTICLE_COUNT = 26;
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (Math.PI * 2 * i) / PARTICLE_COUNT;
    const speed = 220 + random(`p-${i}`) * 220;
    const eased = 1 - Math.pow(1 - Math.min(1, burstT), 2);
    const x = Math.cos(angle) * speed * eased;
    const y = Math.sin(angle) * speed * eased;
    const opacity = Math.max(0, 1 - burstT);
    const size = 6 + random(`s-${i}`) * 8;
    const useAccent = i % 2 === 0;
    return { x, y, opacity, size, color: useAccent ? tokens.accent : tokens.success };
  });

  const headlineIn = spring({
    frame: frame - 28,
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.7 },
  });

  const subIn = spring({
    frame: frame - 60,
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
        gap: 28,
      }}
    >
      {/* Particle burst */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "38%",
          pointerEvents: "none",
        }}
      >
        {particles.map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: p.color,
              opacity: p.opacity * 0.9,
              transform: `translate(${p.x}px, ${p.y}px)`,
            }}
          />
        ))}
      </div>

      {/* Logo */}
      <div
        style={{
          transform: `scale(${iconIn})`,
          opacity: iconIn,
        }}
      >
        <Img
          src={staticFile("walletchan-icon-nobg.png")}
          style={{
            width: 260,
            height: 260,
            filter: "drop-shadow(0 24px 60px rgba(20,20,40,0.18))",
          }}
        />
      </div>

      {/* Headline */}
      <div
        style={{
          padding: "0 80px",
          textAlign: "center",
          opacity: headlineIn,
          transform: `translateY(${(1 - headlineIn) * 18}px)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 58,
            color: tokens.ink,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          <AnimatedText
            text="Clear signing is live in WalletChan."
            delayFrames={30}
            unit="word"
          />
        </div>
      </div>

      {/* Subline */}
      <div
        style={{
          opacity: subIn,
          transform: `translateY(${(1 - subIn) * 12}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 600,
            fontSize: 26,
            color: tokens.inkMuted,
            letterSpacing: "-0.01em",
          }}
        >
          Every dapp. Every transaction.
        </div>
      </div>
    </AbsoluteFill>
  );
};
