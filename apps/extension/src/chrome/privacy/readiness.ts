import { verifyPrivacyPoolsDeployment } from "./deployment/health";
import { runPrivacyProverFixedSelfTest } from "./prover/coordinator";

/** Network identity must pass before the expensive packaged proof self-test. */
export async function runPrivacyShieldReadinessCheck(): Promise<void> {
  await verifyPrivacyPoolsDeployment();
  await runPrivacyProverFixedSelfTest();
}
