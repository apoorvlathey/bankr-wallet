import {
  PRIVACY_POOLS_DEPLOYMENT,
  PRIVACY_POOLS_RELEASE_POLICY,
} from "./manifest";

export const PRIVACY_POOLS_PROFILE_PROBE = Object.freeze({
  profile: PRIVACY_POOLS_DEPLOYMENT.profile,
  chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
  chainName: PRIVACY_POOLS_DEPLOYMENT.chainName,
  entrypoint: PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
  pool: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
  aspBaseUrl: PRIVACY_POOLS_DEPLOYMENT.services.aspBaseUrl,
  explorerBaseUrl: PRIVACY_POOLS_DEPLOYMENT.explorerBaseUrl,
  minimumDepositAmount:
    PRIVACY_POOLS_DEPLOYMENT.assetConfig.minimumDepositAmount.toString(),
  vettingFeeBPS: PRIVACY_POOLS_DEPLOYMENT.assetConfig.vettingFeeBPS.toString(),
  maxRelayFeeBPS:
    PRIVACY_POOLS_DEPLOYMENT.assetConfig.maxRelayFeeBPS.toString(),
  mode: PRIVACY_POOLS_RELEASE_POLICY.mode,
  bankrMutations: PRIVACY_POOLS_RELEASE_POLICY.bankrMutations,
});
