/** Stable facade for transactional fresh-wallet initialization. */

export {
  ONBOARDING_INITIALIZATION_KEY,
  isOnboardingInitializationOwner,
} from "./onboarding/state";
export {
  beginOnboardingInitialization,
  completeOnboardingInitialization,
  getOnboardingInitializationStatus,
  rollbackOnboardingInitialization,
} from "./onboarding/lifecycle";
export { initializeOnboardingCredential } from "./onboarding/credential";
