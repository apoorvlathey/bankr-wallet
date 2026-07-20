import { getStoredRpcUrl } from "@/lib/chains";
import { KNOWN_CHAINS } from "@/constants/knownChains.generated";
import { readPrivacyPoolsSepoliaSnapshot } from "./client";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "./manifest";
import {
  assertPrivacyPoolsSepoliaSnapshot,
  PrivacyDeploymentVerificationError,
} from "./validation";

/** Resolve the one Sepolia RPC selected by WalletChan's existing network policy. */
export async function resolvePrivacyPoolsSepoliaRpcUrl(): Promise<string> {
  let rpcUrl: string | undefined;
  try {
    rpcUrl = await getStoredRpcUrl(PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.chainId);
  } catch {
    throw new PrivacyDeploymentVerificationError("rpc-unavailable");
  }
  rpcUrl ??=
    KNOWN_CHAINS[PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.chainId]?.defaultRpc;
  if (!rpcUrl) {
    throw new PrivacyDeploymentVerificationError("rpc-unavailable");
  }
  return rpcUrl;
}

/** Verify the configured Sepolia RPC against WalletChan's exact release pins. */
export async function verifyPrivacyPoolsSepoliaDeployment(): Promise<void> {
  const rpcUrl = await resolvePrivacyPoolsSepoliaRpcUrl();

  let snapshot;
  try {
    snapshot = await readPrivacyPoolsSepoliaSnapshot(rpcUrl);
  } catch {
    throw new PrivacyDeploymentVerificationError("rpc-unavailable");
  }
  assertPrivacyPoolsSepoliaSnapshot(snapshot);
}
