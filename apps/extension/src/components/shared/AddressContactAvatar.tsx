import { Image } from "@chakra-ui/react";
import { blo } from "blo";
import SafeImage from "@/components/SafeImage";

export function AddressContactAvatar({
  address,
  avatar,
  fallbackSrc,
  size = 32,
}: {
  address: string;
  avatar: string | null | undefined;
  fallbackSrc?: string;
  size?: number;
}) {
  const fallback = (
    <Image
      src={fallbackSrc || blo(address as `0x${string}`)}
      alt=""
      boxSize={`${size}px`}
      minW={`${size}px`}
      borderRadius="full"
    />
  );

  if (!avatar) return fallback;
  return (
    <SafeImage
      src={avatar}
      fallback={fallback}
      alt=""
      boxSize={`${size}px`}
      minW={`${size}px`}
      borderRadius="full"
      objectFit="cover"
    />
  );
}
