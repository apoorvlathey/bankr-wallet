import type { ReactElement } from "react";
import { Image, type ImageProps } from "@chakra-ui/react";

import {
  INERT_IMAGE_SRC,
  useCachedAvatarSrc,
} from "@/hooks/useCachedAvatarSrc";

export interface SafeImageProps
  extends Omit<ImageProps, "src" | "fallbackSrc" | "fallback"> {
  src?: string | null;
  fallbackSrc?: string | null;
  fallback?: ReactElement;
}

/**
 * The only general-purpose image primitive for metadata-controlled sources.
 * Remote URLs stay inert until the background worker has fetched, decoded and
 * re-encoded them as bounded raster bytes. Unsafe schemes and SVG/data markup
 * never reach the DOM.
 */
export default function SafeImage({
  src,
  fallbackSrc,
  fallback,
  ...imageProps
}: SafeImageProps) {
  const safePrimary = useCachedAvatarSrc(src);
  const safeFallback = useCachedAvatarSrc(fallbackSrc);
  const resolved =
    safePrimary && safePrimary !== INERT_IMAGE_SRC
      ? safePrimary
      : safeFallback && safeFallback !== INERT_IMAGE_SRC
        ? safeFallback
        : null;

  if (!resolved && fallback) return fallback;

  return (
    <Image
      {...imageProps}
      src={resolved || INERT_IMAGE_SRC}
      fallback={fallback}
    />
  );
}
