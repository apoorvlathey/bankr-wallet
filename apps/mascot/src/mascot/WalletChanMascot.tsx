import type { CSSProperties } from "react";
import baseFaceUrl from "../../art/working/face-base-neutral-clean.png?url";
import leftEyeClosedUrl from "../../art/working/eye-left-closed.png?url";
import leftEyeOpenUrl from "../../art/working/eye-left-open.png?url";
import rightEyeClosedUrl from "../../art/working/eye-right-closed.png?url";
import rightEyeOpenUrl from "../../art/working/eye-right-open.png?url";
import angerManpuUrl from "../../art/working/effect-anger-manpu-approved.png?url";
import sleepZLargeUrl from "../../art/working/effect-sleep-z-large.png?url";
import sleepZMediumUrl from "../../art/working/effect-sleep-z-medium.png?url";
import sleepZSmallUrl from "../../art/working/effect-sleep-z-small.png?url";
import successSparkle01Url from "../../art/working/effect-success-sparkle-01.png?url";
import successSparkle02Url from "../../art/working/effect-success-sparkle-02.png?url";
import successSparkle03Url from "../../art/working/effect-success-sparkle-03.png?url";
import successSparkle04Url from "../../art/working/effect-success-sparkle-04.png?url";
import successSparkle05Url from "../../art/working/effect-success-sparkle-05.png?url";
import successSparkle06Url from "../../art/working/effect-success-sparkle-06.png?url";
import successSparkle07Url from "../../art/working/effect-success-sparkle-07.png?url";
import successSparkle08Url from "../../art/working/effect-success-sparkle-08.png?url";
import successSparkle09Url from "../../art/working/effect-success-sparkle-09.png?url";
import concernedMouthUrl from "../../art/working/mouth-concerned-approved.png?url";
import idleMouthUrl from "../../art/working/mouth-idle-approved.png?url";
import sleepMouthUrl from "../../art/working/mouth-sleep-final.png?url";
import successMouthUrl from "../../art/working/mouth-success-extracted.png?url";
import type { MascotState } from "./types";
import "./walletChanMascot.css";

interface WalletChanMascotProps {
  state: MascotState;
  className?: string;
  label?: string;
  replayKey?: number;
}

type MascotStyle = CSSProperties & {
  "--mascot-intensity": number;
  "--mascot-gaze-x": number;
  "--mascot-gaze-y": number;
};

interface ArtLayerProps {
  className: string;
  src: string;
  style?: CSSProperties;
}

function ArtLayer({ className, src, style }: ArtLayerProps) {
  return <img aria-hidden="true" className={`mascot-art-layer ${className}`} src={src} alt="" draggable={false} style={style} />;
}

type SparkleStyle = CSSProperties & {
  "--sparkle-delay": string;
  "--sparkle-x": string;
  "--sparkle-y": string;
};

const successSparkles: Array<{ src: string; style: SparkleStyle }> = [
  { src: successSparkle01Url, style: { "--sparkle-delay": "0ms", "--sparkle-x": "0px", "--sparkle-y": "-14px" } },
  { src: successSparkle02Url, style: { "--sparkle-delay": "70ms", "--sparkle-x": "-12px", "--sparkle-y": "-8px" } },
  { src: successSparkle03Url, style: { "--sparkle-delay": "110ms", "--sparkle-x": "12px", "--sparkle-y": "-10px" } },
  { src: successSparkle04Url, style: { "--sparkle-delay": "150ms", "--sparkle-x": "14px", "--sparkle-y": "0px" } },
  { src: successSparkle05Url, style: { "--sparkle-delay": "180ms", "--sparkle-x": "-14px", "--sparkle-y": "2px" } },
  { src: successSparkle06Url, style: { "--sparkle-delay": "210ms", "--sparkle-x": "12px", "--sparkle-y": "10px" } },
  { src: successSparkle07Url, style: { "--sparkle-delay": "250ms", "--sparkle-x": "-10px", "--sparkle-y": "10px" } },
  { src: successSparkle08Url, style: { "--sparkle-delay": "290ms", "--sparkle-x": "-5px", "--sparkle-y": "14px" } },
  { src: successSparkle09Url, style: { "--sparkle-delay": "330ms", "--sparkle-x": "6px", "--sparkle-y": "14px" } },
];

/**
 * Fidelity-first raster puppet made from the approved WalletChan artwork.
 *
 * Every expression part keeps the canonical 1024px transparent canvas. This
 * lets the browser and the eventual Rive rig swap layers without recalculating
 * offsets, cropping the character, or redrawing the pixel texture.
 */
export function WalletChanMascot({
  state,
  className = "",
  label = "WalletChan mascot",
  replayKey = 0,
}: WalletChanMascotProps) {
  const style: MascotStyle = {
    "--mascot-intensity": state.intensity,
    "--mascot-gaze-x": state.gazeX,
    "--mascot-gaze-y": state.gazeY,
  };

  return (
    <div
      className={`walletchan-mascot walletchan-mascot--${state.name} ${
        state.reducedMotion ? "walletchan-mascot--reduced" : ""
      } ${className}`}
      style={style}
      role="img"
      aria-label={`${label}: ${state.name}`}
      data-state={state.name}
      data-action={state.action}
      key={`${state.name}-${replayKey}`}
    >
      <div className="mascot-character-root" data-rive-layer="character-root">
        <ArtLayer className="mascot-face-base" src={baseFaceUrl} />

        <div className="mascot-expression-layer" data-rive-layer="eyes">
          <ArtLayer className="mascot-eye mascot-eye--left-open" src={leftEyeOpenUrl} />
          <ArtLayer className="mascot-eye mascot-eye--right-open" src={rightEyeOpenUrl} />
          <ArtLayer className="mascot-eye mascot-eye--left-closed" src={leftEyeClosedUrl} />
          <ArtLayer className="mascot-eye mascot-eye--right-closed" src={rightEyeClosedUrl} />
        </div>

        <div className="mascot-expression-layer" data-rive-layer="mouths">
          <ArtLayer className="mascot-mouth mascot-mouth--idle" src={idleMouthUrl} />
          <ArtLayer className="mascot-mouth mascot-mouth--concerned" src={concernedMouthUrl} />
          <ArtLayer className="mascot-mouth mascot-mouth--sleep" src={sleepMouthUrl} />
          <ArtLayer className="mascot-mouth mascot-mouth--success" src={successMouthUrl} />
        </div>
      </div>

      <div className="mascot-effect-layer" data-rive-layer="effects-front">
        <ArtLayer className="mascot-effect mascot-effect--anger-manpu" src={angerManpuUrl} />
        {successSparkles.map((sparkle, index) => (
          <ArtLayer
            className="mascot-effect mascot-effect--success-sparkle"
            key={index}
            src={sparkle.src}
            style={sparkle.style}
          />
        ))}
        <ArtLayer className="mascot-effect mascot-effect--sleep-z mascot-effect--sleep-z-small" src={sleepZSmallUrl} />
        <ArtLayer className="mascot-effect mascot-effect--sleep-z mascot-effect--sleep-z-medium" src={sleepZMediumUrl} />
        <ArtLayer className="mascot-effect mascot-effect--sleep-z mascot-effect--sleep-z-large" src={sleepZLargeUrl} />
      </div>
    </div>
  );
}
