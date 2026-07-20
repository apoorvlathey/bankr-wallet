import {
  PRIVACY_POOLS_MAINNET_DEPLOYMENT,
  PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
} from "./mainnetManifest";
import {
  PRIVACY_POOLS_SEPOLIA_DEPLOYMENT,
  PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY,
} from "./sepoliaManifest";

export type {
  PrivacyPoolsContractId,
  PrivacyPoolsContractPin,
  PrivacyPoolsDeployment,
  PrivacyPoolsReleasePolicy,
  PrivacyPoolsRelayerPin,
} from "./types";
export {
  PRIVACY_POOLS_MAINNET_DEPLOYMENT,
  PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
} from "./mainnetManifest";
export {
  PRIVACY_POOLS_SEPOLIA_DEPLOYMENT,
  PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY,
} from "./sepoliaManifest";

/** `dev:extension` remains on Sepolia; every normal Vite build selects mainnet. */
const IS_PRODUCTION_EXTENSION_BUILD = import.meta.env?.MODE === "production";

export const PRIVACY_POOLS_DEPLOYMENT = IS_PRODUCTION_EXTENSION_BUILD
  ? PRIVACY_POOLS_MAINNET_DEPLOYMENT
  : PRIVACY_POOLS_SEPOLIA_DEPLOYMENT;

export const PRIVACY_POOLS_RELEASE_POLICY = IS_PRODUCTION_EXTENSION_BUILD
  ? PRIVACY_POOLS_MAINNET_RELEASE_POLICY
  : PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY;
