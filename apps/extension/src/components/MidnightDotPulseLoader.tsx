import type { CSSProperties } from "react";
import "./MidnightDotPulseLoader.css";

interface MidnightDotPulseLoaderProps {
  size?: string;
  color?: string;
}

/** Shared restrained progress mark for Warm Midnight async states. */
export function MidnightDotPulseLoader({
  size = "6px",
  color = "currentColor",
}: MidnightDotPulseLoaderProps) {
  return (
    <span
      className="midnight-dot-pulse-loader"
      style={
        {
          "--midnight-dot-size": size,
          "--midnight-dot-color": color,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="midnight-dot-pulse-loader__dot" />
      <span className="midnight-dot-pulse-loader__dot" />
      <span className="midnight-dot-pulse-loader__dot" />
    </span>
  );
}

export default MidnightDotPulseLoader;
