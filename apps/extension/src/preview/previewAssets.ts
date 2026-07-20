/**
 * Deterministic assets for extension preview scenarios.
 *
 * Preview fixtures should use these semantic paths instead of remote favicon or
 * token-logo services. Every URL points to a file served from the extension's
 * existing `public/` directory, so screenshots do not depend on the network.
 */

export interface PreviewAssetManifest {
  brand: {
    walletChan: string;
    walletChanWhiteBackground: string;
    bankr: string;
  };
  dapps: {
    uniswap: string;
    aave: string;
  };
  tokens: {
    usdc: string;
  };
  chains: {
    ethereum: string;
    base: string;
    arbitrum: string;
    polygon: string;
    unichain: string;
    megaeth: string;
  };
  portfolio: {
    octav: string;
    debank: string;
    zerion: string;
    nansen: string;
    blockscan: string;
  };
}

export const previewAssets = {
  brand: {
    walletChan: "/walletchan-icon.png",
    walletChanWhiteBackground: "/walletchan-icon-white-bg.png",
    bankr: "/bankr-icon.png",
  },
  dapps: {
    uniswap: "/preview-assets/uniswap.svg",
    aave: "/preview-assets/aave.svg",
  },
  tokens: {
    usdc: "/preview-assets/usdc.svg",
  },
  chains: {
    ethereum: "/chainIcons/ethereum.svg",
    base: "/chainIcons/base.svg",
    arbitrum: "/chainIcons/arbitrum.svg",
    polygon: "/chainIcons/polygon.svg",
    unichain: "/chainIcons/unichain.svg",
    megaeth: "/chainIcons/megaeth.svg",
  },
  portfolio: {
    octav: "/octav-icon.png",
    debank: "/debank-icon.ico",
    zerion: "/zerion-icon.png",
    nansen: "/nansen-icon.png",
    blockscan: "/blockscan-icon.png",
  },
} as const satisfies PreviewAssetManifest;

export type PreviewAssets = typeof previewAssets;
