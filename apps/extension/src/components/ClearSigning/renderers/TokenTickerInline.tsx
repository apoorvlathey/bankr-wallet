import { HStack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import TokenLogo from "@/components/TokenLogo";
import type { TokenMetadataHint } from "@/lib/clearSigning/applyFormat";
import {
  getCachedTokenMetadataSync,
  resolveTokenMetadataClient,
} from "@/lib/tokenMetadataClient";

import {
  toTokenInfo,
  type TokenInfo,
} from "../formatters/valueFormatters";
import { AddressInline } from "./AddressInline";

export function TokenTickerInline({
  tokenAddress,
  chainId,
  metadataHint,
}: {
  tokenAddress: string;
  chainId: number;
  metadataHint?: TokenMetadataHint;
}) {
  const initialInfo = metadataHint
    ? toTokenInfo(metadataHint)
    : toTokenInfo(getCachedTokenMetadataSync(chainId, tokenAddress));
  const [info, setInfo] = useState<TokenInfo | null>(() => initialInfo);

  useEffect(() => {
    let cancelled = false;
    const cached =
      metadataHint ?? getCachedTokenMetadataSync(chainId, tokenAddress);
    setInfo(toTokenInfo(cached));
    resolveTokenMetadataClient(chainId, tokenAddress).then((metadata) => {
      if (!cancelled) setInfo(toTokenInfo(metadata));
    });
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, chainId, metadataHint]);

  if (!info) {
    return <AddressInline address={tokenAddress} chainId={chainId} />;
  }

  return (
    <HStack spacing={1.5} justify="flex-end" align="center">
      <TokenLogo
        logoUrl={info.logoUrl}
        symbol={info.symbol}
        alt={info.symbol}
        size="16px"
      />
      <Text fontSize="xs" color="fg.primary" fontWeight="700">
        {info.symbol}
      </Text>
    </HStack>
  );
}
