import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";
import { captionsBySceneId } from "../captions.generated";
import { tokens } from "./tokens";

const { fontFamily } = loadFont();

interface Props {
  sceneId: number;
}

// TikTok-style word-at-a-time caption overlay positioned at lower-middle.
// Reads timings from captions.generated.ts (emitted by the TTS script).
// Each word pops in with a spring, snap-cuts to the next.
//
// Visual: bold uppercase white with thick dark stroke so it reads on both
// bright and dark backgrounds. The current word also briefly tints in the
// accent violet for the first ~120ms after appearing.
export const Captions: React.FC<Props> = ({ sceneId }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const words = captionsBySceneId[sceneId] || [];

  if (words.length === 0) return null;

  const TAIL = 0.08; // seconds — keep word on screen briefly after end

  // Locate the word that should be visible right now.
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    const start = words[i].start;
    const nextStart =
      i + 1 < words.length ? words[i + 1].start : Number.POSITIVE_INFINITY;
    const end = Math.min(words[i].end + TAIL, nextStart);
    if (t >= start && t < end) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return null;

  const word = words[idx];
  const wordFrame = (t - word.start) * fps;

  // Spring pop-in for each word.
  const pop = spring({
    frame: wordFrame,
    fps,
    config: { damping: 14, stiffness: 280, mass: 0.5 },
  });
  const scale = 0.75 + pop * 0.3;

  // Accent flash for the first ~120ms.
  const accentT = Math.max(0, Math.min(1, (wordFrame / fps) / 0.12));
  const fillColor = accentT < 1 ? tokens.accent : "#FFFFFF";

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 130,
        textAlign: "center",
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      <span
        style={{
          display: "inline-block",
          fontFamily,
          fontWeight: 900,
          fontSize: 64,
          color: fillColor,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          WebkitTextStroke: "3px #15151E",
          textShadow: "0 6px 18px rgba(0,0,0,0.45)",
          transform: `scale(${scale})`,
          transition: "color 60ms linear",
          paintOrder: "stroke fill",
        }}
      >
        {word.word}
      </span>
    </div>
  );
};
