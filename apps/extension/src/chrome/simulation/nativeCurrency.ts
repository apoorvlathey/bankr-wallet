import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import {
  ETH_NATIVE_ASSET_LOGO_URL,
  getNativeAssetLogoUrl,
  getStoredResolvedChainById,
} from "@/lib/chains";

export interface NativeCurrencyMetadata {
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
}

const NATIVE_CURRENCY: Record<number, NativeCurrencyMetadata> = {};
for (const chain of CHAIN_REGISTRY) {
  NATIVE_CURRENCY[chain.chainId] = {
    symbol: chain.nativeCurrency.symbol,
    name: chain.nativeCurrency.name,
    decimals: chain.nativeCurrency.decimals,
    // ETH-native chains show the asset logo rather than the chain badge.
    icon: getNativeAssetLogoUrl(chain.nativeCurrency.symbol, chain.icon),
  };
}

/**
 * Synchronous built-in native currency lookup. Unknown chains retain the
 * historical generic ETH fallback used by synchronous UI consumers.
 */
export function getNativeCurrency(chainId: number): NativeCurrencyMetadata {
  return (
    NATIVE_CURRENCY[chainId] ?? {
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      icon: ETH_NATIVE_ASSET_LOGO_URL,
    }
  );
}

/** Resolve user-added chain metadata before falling back to generic ETH. */
export async function resolveNativeCurrency(
  chainId: number,
): Promise<NativeCurrencyMetadata> {
  const builtIn = NATIVE_CURRENCY[chainId];
  if (builtIn) return builtIn;

  const resolvedChain = await getStoredResolvedChainById(chainId).catch(
    () => undefined,
  );
  if (resolvedChain) {
    return {
      symbol: resolvedChain.nativeCurrency.symbol,
      name: resolvedChain.nativeCurrency.name,
      decimals: resolvedChain.nativeCurrency.decimals,
      icon: getNativeAssetLogoUrl(
        resolvedChain.nativeCurrency.symbol,
        resolvedChain.icon,
      ),
    };
  }

  return getNativeCurrency(chainId);
}
