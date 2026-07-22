import { getStoredRpcUrl } from "@/lib/chains";
import { KNOWN_CHAINS } from "@/constants/knownChains.generated";
import { readPrivacyPoolsSnapshot } from "./client";
import { PRIVACY_POOLS_DEPLOYMENT } from "./manifest";
import {
  assertPrivacyPoolsSnapshot,
  PrivacyDeploymentVerificationError,
} from "./validation";

/** Resolve the active profile RPC through WalletChan's existing network policy. */
export async function resolvePrivacyPoolsRpcUrl(): Promise<string> {
  let rpcUrl: string | undefined;
  try {
    rpcUrl = await getStoredRpcUrl(PRIVACY_POOLS_DEPLOYMENT.chainId);
  } catch {
    throw new PrivacyDeploymentVerificationError("rpc-unavailable");
  }
  rpcUrl ??=
    KNOWN_CHAINS[PRIVACY_POOLS_DEPLOYMENT.chainId]?.defaultRpc;
  if (!rpcUrl) {
    throw new PrivacyDeploymentVerificationError("rpc-unavailable");
  }
  return rpcUrl;
}

/** Verify the configured RPC against WalletChan's exact active release pins. */
export async function verifyPrivacyPoolsDeployment(): Promise<void> {
  const rpcUrl = await resolvePrivacyPoolsRpcUrl();

  let snapshot;
  try {
    snapshot = await readPrivacyPoolsSnapshot(rpcUrl);
  } catch {
    throw new PrivacyDeploymentVerificationError("rpc-unavailable");
  }
  assertPrivacyPoolsSnapshot(snapshot);
}
