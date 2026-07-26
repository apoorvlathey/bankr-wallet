import type {
  RenderedField,
  TokenMetadataHint,
} from "@/lib/clearSigning/applyFormat";
import { runtimeTokenMetadataKey } from "@/lib/clearSigning/applyFormat";
import type { TokenDisplayMetadata } from "@/lib/tokenMetadataClient";

export interface RuntimeTokenReference {
  chainId: number;
  tokenAddress: string;
}

export function collectRuntimeTokenReferences(
  fields: RenderedField[],
  fallbackChainId: number,
): RuntimeTokenReference[] {
  const references = new Map<string, RuntimeTokenReference>();

  const visit = (items: RenderedField[]) => {
    for (const field of items) {
      for (const value of field.values) {
        if (
          value.kind !== "tokenAmount" ||
          value.native ||
          !value.tokenAddress ||
          !/^0x[a-fA-F0-9]{40}$/.test(value.tokenAddress)
        ) {
          continue;
        }
        const reference = {
          chainId: value.chainId ?? fallbackChainId,
          tokenAddress: value.tokenAddress,
        };
        references.set(
          runtimeTokenMetadataKey(
            reference.chainId,
            reference.tokenAddress,
          ),
          reference,
        );
      }
      for (const group of field.groups ?? []) visit(group);
    }
  };

  visit(fields);
  return [...references.values()];
}

export function toRuntimeTokenMetadataHint(
  metadata: TokenDisplayMetadata | null,
): TokenMetadataHint | null {
  if (
    !metadata?.symbol ||
    typeof metadata.decimals !== "number" ||
    !Number.isInteger(metadata.decimals) ||
    metadata.decimals < 0 ||
    metadata.decimals > 255
  ) {
    return null;
  }
  return {
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    logoUrl: metadata.logoUrl,
  };
}
