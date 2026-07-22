import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";

export const SHIELDED_ETH_CHAIN_ID = PRIVACY_POOLS_DEPLOYMENT.chainId;
export const SHIELDED_ETH_NETWORK_NAME = PRIVACY_POOLS_DEPLOYMENT.chainName;
export const SHIELDED_ETH_EXPLORER_URL = PRIVACY_POOLS_DEPLOYMENT.explorerBaseUrl;
export const SHIELDED_ETH_IS_TESTNET = PRIVACY_POOLS_DEPLOYMENT.profile === "sepolia";
export const SHIELDED_ETH_LOGO_URL = "/shielded-eth.svg";

export type ShieldedEthAction = "shield" | "unshield" | "activity";
