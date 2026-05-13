import React from "react";
import { Img, staticFile } from "remotion";

interface Props {
  src: string; // relative to public/, e.g. "screenshots/clearsigning-before.png"
  glow: "danger" | "success";
  width: number;
  style?: React.CSSProperties;
}

// Wraps a real screenshot in a colored glow border. Aspect ratio comes
// from the image itself (height auto). Used by Thumbnail + Reveal scenes
// once the user drops PNG captures into public/screenshots/.
export const ScreenshotFrame: React.FC<Props> = ({
  src,
  glow,
  width,
  style,
}) => {
  const borderColor = glow === "danger" ? "#FF4D5E" : "#4ADE80";
  const glowCss =
    glow === "danger"
      ? "0 0 80px rgba(255,77,94,0.55), 0 24px 60px rgba(20,20,40,0.18)"
      : "0 0 80px rgba(74,222,128,0.55), 0 24px 60px rgba(20,20,40,0.18)";

  return (
    <div
      style={{
        width,
        borderRadius: 28,
        overflow: "hidden",
        border: `3px solid ${borderColor}`,
        boxShadow: glowCss,
        backgroundColor: "#0E0E13",
        ...style,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
        }}
      />
    </div>
  );
};
