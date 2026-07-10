import type { CSSProperties } from "react";
import type { UnlockMascotState } from "./unlockMascotState";
import "./UnlockMascot.css";

interface UnlockMascotProps {
  state: UnlockMascotState;
}

interface LayerProps {
  className: string;
  src: string;
  style?: CSSProperties;
}

type SparkleStyle = CSSProperties & {
  "--unlock-sparkle-delay": string;
  "--unlock-sparkle-x": string;
  "--unlock-sparkle-y": string;
};

const ASSET_ROOT = "mascot";

const successSparkles: Array<{ src: string; style: SparkleStyle }> = [
  { src: "01", style: { "--unlock-sparkle-delay": "0ms", "--unlock-sparkle-x": "0px", "--unlock-sparkle-y": "-8px" } },
  { src: "02", style: { "--unlock-sparkle-delay": "20ms", "--unlock-sparkle-x": "-7px", "--unlock-sparkle-y": "-5px" } },
  { src: "03", style: { "--unlock-sparkle-delay": "35ms", "--unlock-sparkle-x": "7px", "--unlock-sparkle-y": "-6px" } },
  { src: "04", style: { "--unlock-sparkle-delay": "50ms", "--unlock-sparkle-x": "8px", "--unlock-sparkle-y": "0px" } },
  { src: "05", style: { "--unlock-sparkle-delay": "65ms", "--unlock-sparkle-x": "-8px", "--unlock-sparkle-y": "1px" } },
  { src: "06", style: { "--unlock-sparkle-delay": "80ms", "--unlock-sparkle-x": "7px", "--unlock-sparkle-y": "6px" } },
  { src: "07", style: { "--unlock-sparkle-delay": "95ms", "--unlock-sparkle-x": "-6px", "--unlock-sparkle-y": "6px" } },
  { src: "08", style: { "--unlock-sparkle-delay": "110ms", "--unlock-sparkle-x": "-3px", "--unlock-sparkle-y": "8px" } },
  { src: "09", style: { "--unlock-sparkle-delay": "125ms", "--unlock-sparkle-x": "4px", "--unlock-sparkle-y": "8px" } },
];

function Layer({ className, src, style }: LayerProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`unlock-mascot-layer ${className}`}
      draggable={false}
      src={`${ASSET_ROOT}/${src}`}
      style={style}
    />
  );
}

/**
 * Decorative, presentation-only unlock mascot.
 *
 * Authentication state owns this component; the mascot never starts,
 * retries, cancels, or delays password/passkey operations.
 */
export default function UnlockMascot({ state }: UnlockMascotProps) {
  return (
    <div
      aria-hidden="true"
      className={`unlock-mascot-art unlock-mascot-art--${state}`}
      data-state={state}
      key={state}
    >
      <div className="unlock-mascot-character">
        <Layer className="unlock-mascot-base" src="face-base-neutral-clean.png" />
        <Layer className="unlock-mascot-eye unlock-mascot-eye--left-open" src="eye-left-open.png" />
        <Layer className="unlock-mascot-eye unlock-mascot-eye--right-open" src="eye-right-open.png" />
        <Layer className="unlock-mascot-eye unlock-mascot-eye--left-closed" src="eye-left-closed.png" />
        <Layer className="unlock-mascot-eye unlock-mascot-eye--right-closed" src="eye-right-closed.png" />
        <Layer className="unlock-mascot-mouth unlock-mascot-mouth--idle" src="mouth-idle-approved.png" />
        <Layer className="unlock-mascot-mouth unlock-mascot-mouth--invalid" src="mouth-concerned-approved.png" />
        <Layer className="unlock-mascot-mouth unlock-mascot-mouth--sleep" src="mouth-sleep-final.png" />
        <Layer className="unlock-mascot-mouth unlock-mascot-mouth--success" src="mouth-success-extracted.png" />
      </div>

      <div className="unlock-mascot-effects">
        <Layer className="unlock-mascot-effect unlock-mascot-effect--manpu" src="effect-anger-manpu-approved.png" />
        {successSparkles.map((sparkle) => (
          <Layer
            className="unlock-mascot-effect unlock-mascot-effect--success-sparkle"
            key={sparkle.src}
            src={`effect-success-sparkle-${sparkle.src}.png`}
            style={sparkle.style}
          />
        ))}
        <Layer className="unlock-mascot-effect unlock-mascot-effect--sleep-z unlock-mascot-effect--sleep-z-small" src="effect-sleep-z-small.png" />
        <Layer className="unlock-mascot-effect unlock-mascot-effect--sleep-z unlock-mascot-effect--sleep-z-medium" src="effect-sleep-z-medium.png" />
        <Layer className="unlock-mascot-effect unlock-mascot-effect--sleep-z unlock-mascot-effect--sleep-z-large" src="effect-sleep-z-large.png" />
      </div>
    </div>
  );
}
