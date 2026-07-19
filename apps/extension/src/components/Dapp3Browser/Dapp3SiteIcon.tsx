import { useEffect, useState } from "react";
import {
  INERT_IMAGE_SRC,
  useCachedAvatarSrc,
} from "@/hooks/useCachedAvatarSrc";

interface Dapp3SiteIconProps {
  src?: string | null;
  fallbackSrc?: string | null;
  label: string;
}

export default function Dapp3SiteIcon({
  src,
  fallbackSrc,
  label,
}: Dapp3SiteIconProps) {
  const [failed, setFailed] = useState(false);
  const safeSrc = useCachedAvatarSrc(src, "ens-cache-browser-image");
  const safeFallbackSrc = useCachedAvatarSrc(
    fallbackSrc,
    "ens-cache-browser-image",
  );
  const resolvedSrc =
    safeSrc && safeSrc !== INERT_IMAGE_SRC && !failed
      ? safeSrc
      : safeFallbackSrc && safeFallbackSrc !== INERT_IMAGE_SRC
        ? safeFallbackSrc
        : null;
  const showImage = !!resolvedSrc;

  useEffect(() => setFailed(false), [safeSrc, safeFallbackSrc]);

  return (
    <span
      className={`site-icon${showImage ? " site-icon--image" : ""}`}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          className="site-favicon"
          src={resolvedSrc}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="site-letter">
          {label.slice(0, 1).toUpperCase() || "@"}
        </span>
      )}
    </span>
  );
}
