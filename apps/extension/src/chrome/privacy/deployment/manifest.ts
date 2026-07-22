import {
  PRIVACY_POOLS_MAINNET_DEPLOYMENT,
  PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
} from "./mainnetManifest";
import {
  PRIVACY_POOLS_SEPOLIA_DEPLOYMENT,
  PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY,
} from "./sepoliaManifest";

declare const __WALLETCHAN_PRIVACY_POOLS_PROFILE__:
  | "mainnet"
  | "sepolia";

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

/**
 * Mainnet is the default for every extension build. Sepolia is an explicit,
 * compile-time-only profile selected by the dedicated package scripts. Direct
 * non-Vite imports retain Sepolia for the existing isolated test fixtures.
 */
const IS_SEPOLIA_EXTENSION_BUILD =
  typeof __WALLETCHAN_PRIVACY_POOLS_PROFILE__ === "undefined" ||
  __WALLETCHAN_PRIVACY_POOLS_PROFILE__ === "sepolia";

export const PRIVACY_POOLS_DEPLOYMENT = IS_SEPOLIA_EXTENSION_BUILD
  ? PRIVACY_POOLS_SEPOLIA_DEPLOYMENT
  : PRIVACY_POOLS_MAINNET_DEPLOYMENT;

export const PRIVACY_POOLS_RELEASE_POLICY = IS_SEPOLIA_EXTENSION_BUILD
  ? PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY
  : PRIVACY_POOLS_MAINNET_RELEASE_POLICY;
