import {
  PRIVACY_POOLS_DEPLOYMENT,
  PRIVACY_POOLS_RELEASE_POLICY,
} from "./manifest";
import { WALLETCHAN_API_BASE } from "../../../constants/externalUrls";
import {
  getPrivacyShieldActivityState,
  getShieldOperationProgress,
} from "../../../lib/privacyShieldLifecycle";

const confirmationProgress = getShieldOperationProgress(
  "submitted",
  PRIVACY_POOLS_DEPLOYMENT.chainName,
);
const confirmationActivity = getPrivacyShieldActivityState(
  "submitted",
  PRIVACY_POOLS_DEPLOYMENT.chainName,
);

export const PRIVACY_POOLS_PROFILE_PROBE = Object.freeze({
  walletchanApiBase: WALLETCHAN_API_BASE,
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
  confirmationLabel: confirmationProgress?.label,
  confirmationDescription: confirmationProgress?.description,
  confirmationContext: confirmationActivity.context,
});
