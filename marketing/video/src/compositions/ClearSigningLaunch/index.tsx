import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";
import { TIMING, TOTAL_FRAMES, tokens } from "./shared/tokens";
import { Captions } from "./shared/Captions";
import { ThumbnailScene } from "./scenes/ThumbnailScene";
import { HookScene } from "./scenes/HookScene";
import { StakesScene } from "./scenes/StakesScene";
import { PivotScene } from "./scenes/PivotScene";
import { RevealScene } from "./scenes/RevealScene";
import { StandardScene } from "./scenes/StandardScene";
import { BrandDropScene } from "./scenes/BrandDropScene";
import { CTAScene } from "./scenes/CTAScene";

const { fontFamily } = loadFont();

// Set this to the voice folder produced by `pnpm tts` (default "brian").
// If files don't exist yet the <Audio> calls below will simply not play —
// you can render the visual track first and add VO later.
const VOICE = "brian";

const VO = (id: number) => staticFile(`vo/${VOICE}/scene${id}.mp3`);

const Watermark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - 5,
    fps,
    config: { damping: 14, stiffness: 150, mass: 0.6 },
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 28,
        right: 32,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 14px 6px 8px",
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.92)",
        boxShadow: "0 4px 14px rgba(20,20,40,0.10)",
        opacity: progress * 0.95,
        transform: `translateY(${(1 - progress) * 8}px)`,
        zIndex: 100,
        pointerEvents: "none",
      }}
    >
      <Img
        src={staticFile("walletchan-icon-nobg.png")}
        style={{ width: 28, height: 28 }}
      />
      <span
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 17,
          color: tokens.ink,
          letterSpacing: "-0.01em",
        }}
      >
        WalletChan
      </span>
    </div>
  );
};

export const ClearSigningLaunch: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.bgBright, fontFamily }}>
      {/* Scenes — each Sequence resets useCurrentFrame to 0 at its start. */}
      <Sequence
        from={TIMING.THUMBNAIL.start}
        durationInFrames={TIMING.THUMBNAIL.duration}
      >
        <ThumbnailScene />
      </Sequence>

      <Sequence
        from={TIMING.HOOK.start}
        durationInFrames={TIMING.HOOK.duration}
      >
        <HookScene />
        <Audio src={VO(1)} />
        <Captions sceneId={1} />
      </Sequence>

      <Sequence
        from={TIMING.STAKES.start}
        durationInFrames={TIMING.STAKES.duration}
      >
        <StakesScene />
        <Audio src={VO(2)} />
        {/* Captions disabled — visual headline carries the message. */}
      </Sequence>

      <Sequence
        from={TIMING.PIVOT.start}
        durationInFrames={TIMING.PIVOT.duration}
      >
        <PivotScene />
        <Audio src={VO(3)} />
        {/* Captions disabled — visual headline carries the message. */}
      </Sequence>

      <Sequence
        from={TIMING.REVEAL.start}
        durationInFrames={TIMING.REVEAL.duration}
      >
        <RevealScene />
        <Audio src={VO(4)} />
        <Captions sceneId={4} />
      </Sequence>

      <Sequence
        from={TIMING.STANDARD.start}
        durationInFrames={TIMING.STANDARD.duration}
      >
        <StandardScene />
        <Audio src={VO(5)} />
        <Captions sceneId={5} />
      </Sequence>

      <Sequence
        from={TIMING.BRAND.start}
        durationInFrames={TIMING.BRAND.duration}
      >
        <BrandDropScene />
        <Audio src={VO(6)} />
        <Captions sceneId={6} />
      </Sequence>

      <Sequence from={TIMING.CTA.start} durationInFrames={TIMING.CTA.duration}>
        <CTAScene />
        <Audio src={VO(7)} />
        {/* Captions disabled — 'Finally readable.' headline carries the message. */}
      </Sequence>

      {/* Watermark — appears from the Hook scene onwards. */}
      <Sequence
        from={TIMING.HOOK.start + 15}
        durationInFrames={TOTAL_FRAMES - TIMING.HOOK.start - 15}
      >
        <Watermark />
      </Sequence>
    </AbsoluteFill>
  );
};
