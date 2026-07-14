import { DEFAULT_NETWORKS } from "@/constants/networks";
import { normalizeNetworksInfo } from "@/lib/chains";

export const previewNetworks = normalizeNetworksInfo({
  ...DEFAULT_NETWORKS,
});

export const previewNetworkRpcUrls = {
  "8453": [
    DEFAULT_NETWORKS.Base.rpcUrl,
    "https://base-mainnet.g.alchemy.com/v2/demo",
    "https://mainnet.base.org",
  ],
};
