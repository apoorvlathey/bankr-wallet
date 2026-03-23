"use client";

import { Box, Image } from "@chakra-ui/react";
import { CHAIN_ICONS, getChainColor } from "../data/dapps";

interface ChainIconProps {
  chainId: number;
  size?: string;
}

/** Renders an SVG icon for known chains, or a colored geometric dot for others */
export function ChainIcon({ chainId, size = "10px" }: ChainIconProps) {
  const iconSrc = CHAIN_ICONS[chainId];

  if (iconSrc) {
    return (
      <Image
        src={iconSrc}
        alt=""
        w={size}
        h={size}
        flexShrink={0}
        borderRadius="full"
      />
    );
  }

  return (
    <Box
      w={size}
      h={size}
      bg={getChainColor(chainId)}
      borderRadius={chainId % 2 === 0 ? "full" : "0"}
      border="1px solid"
      borderColor="gray.400"
      flexShrink={0}
    />
  );
}
