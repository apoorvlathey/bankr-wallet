import {
  getShieldOperationProgress as getShieldOperationProgressForNetwork,
  SHIELD_PROGRESS_STEPS,
  type PrivacyShieldLifecycleState,
  type ShieldOperationProgressState,
} from "@/lib/privacyShieldLifecycle";
import { SHIELDED_ETH_NETWORK_NAME } from "./shieldedAsset";

export { SHIELD_PROGRESS_STEPS, type ShieldOperationProgressState };

export function getShieldOperationProgress(
  state: PrivacyShieldLifecycleState,
): ShieldOperationProgressState | null {
  return getShieldOperationProgressForNetwork(state, SHIELDED_ETH_NETWORK_NAME);
}
