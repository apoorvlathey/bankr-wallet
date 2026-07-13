import { Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import {
  formatGweiTokenFallback,
  resolveGweiNameForTokenId,
} from "@/lib/clearSigning/gnsNameResolver";

export function GweiNameInline({
  tokenId,
  chainId,
}: {
  tokenId: string;
  chainId: number;
}) {
  const { networksInfo } = useNetworks();
  const rpcUrl = useMemo(
    () => getResolvedChainById(chainId, networksInfo)?.rpcUrl,
    [chainId, networksInfo],
  );
  const [name, setName] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setName(null);
    setResolved(false);

    resolveGweiNameForTokenId({ chainId, rpcUrl, tokenId }).then((next) => {
      if (cancelled) return;
      setName(next);
      setResolved(true);
    });

    return () => {
      cancelled = true;
    };
  }, [chainId, rpcUrl, tokenId]);

  if (name) {
    return (
      <Text
        fontSize="xs"
        color="fg.primary"
        fontWeight="800"
        wordBreak="break-word"
      >
        {name}
      </Text>
    );
  }

  return (
    <Text
      fontSize="xs"
      fontFamily="mono"
      color={resolved ? "fg.secondary" : "fg.muted"}
      fontWeight="600"
      wordBreak="break-all"
    >
      {formatGweiTokenFallback(tokenId)}
    </Text>
  );
}
