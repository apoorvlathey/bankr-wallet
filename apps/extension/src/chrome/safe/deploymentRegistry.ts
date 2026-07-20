import {
  getCompatibilityFallbackHandlerDeployments,
  getMultiSendDeployments,
  getSafeL2SingletonDeployments,
  getSafeSingletonDeployments,
  type SingletonDeploymentV2,
} from "@safe-global/safe-deployments";
import type { SafeAddress, SafeSupportedVersion } from "./types";

/**
 * Runtime hashes produced by the canonical released SafeProxy factories.
 *
 * These are deliberately pinned alongside the supported Safe versions. They
 * were derived by creating an empty proxy through each pinned factory on an
 * Ethereum fork, then hashing the deployed runtime. Verifying only slot 0 and
 * the singleton would allow an arbitrary forwarding contract to impersonate a
 * Safe during import.
 */
const SAFE_PROXY_RUNTIME_HASHES: Record<SafeSupportedVersion, `0x${string}`> = {
  "1.3.0": "0xb89c1b3bdf2cf8827818646bce9a8f6e372885f8c55e5c07acbd307cb133b000",
  "1.4.1": "0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c",
  "1.5.0": "0x4e381985ca68b3e5d27b4425fa581c19cf33146d3f887a3cfca96f55528ea46f",
};

export const SAFE_SUPPORTED_VERSIONS: readonly SafeSupportedVersion[] = [
  "1.3.0",
  "1.4.1",
  "1.5.0",
];

export interface SafeDeploymentIdentity {
  address: SafeAddress;
  codeHash: `0x${string}`;
  contractName: string;
  version: SafeSupportedVersion;
  deploymentKind: "singleton" | "l2Singleton";
}

function addressesForNetwork(
  deployment: SingletonDeploymentV2 | undefined,
  chainId: number,
): string[] {
  const configured = deployment?.networkAddresses[String(chainId)];
  if (!configured) return [];
  return Array.isArray(configured) ? configured : [configured];
}

function identitiesForDeployment(
  deployment: SingletonDeploymentV2 | undefined,
  chainId: number,
  version: SafeSupportedVersion,
  deploymentKind: SafeDeploymentIdentity["deploymentKind"],
): SafeDeploymentIdentity[] {
  if (!deployment?.released || deployment.version !== version) return [];

  return addressesForNetwork(deployment, chainId).flatMap((address) => {
    const normalized = address.toLowerCase();
    const matched = Object.values(deployment.deployments).find(
      (candidate) => candidate?.address.toLowerCase() === normalized,
    );
    if (!matched) return [];
    return [{
      address: address as SafeAddress,
      codeHash: matched.codeHash as `0x${string}`,
      contractName: deployment.contractName,
      version,
      deploymentKind,
    }];
  });
}

function globalIdentitiesForDeployment(
  deployment: SingletonDeploymentV2 | undefined,
  version: SafeSupportedVersion,
  deploymentKind: SafeDeploymentIdentity["deploymentKind"],
): SafeDeploymentIdentity[] {
  if (!deployment?.released || deployment.version !== version) return [];
  const byAddress = new Map<string, SafeDeploymentIdentity>();
  for (const candidate of Object.values(deployment.deployments)) {
    if (!candidate) continue;
    byAddress.set(candidate.address.toLowerCase(), {
      address: candidate.address as SafeAddress,
      codeHash: candidate.codeHash as `0x${string}`,
      contractName: deployment.contractName,
      version,
      deploymentKind,
    });
  }
  return [...byAddress.values()];
}

export function getSafeSingletonAllowlist(
  chainId: number,
): SafeDeploymentIdentity[] {
  const byAddress = new Map<string, SafeDeploymentIdentity>();

  for (const version of SAFE_SUPPORTED_VERSIONS) {
    const networkCandidates = [
      ...identitiesForDeployment(
        getSafeSingletonDeployments({
          version,
          released: true,
          network: String(chainId),
        }),
        chainId,
        version,
        "singleton",
      ),
      ...identitiesForDeployment(
        getSafeL2SingletonDeployments({
          version,
          released: true,
          network: String(chainId),
        }),
        chainId,
        version,
        "l2Singleton",
      ),
    ];
    const candidates = networkCandidates.length > 0
      ? networkCandidates
      : [
          ...globalIdentitiesForDeployment(
            getSafeSingletonDeployments({ version, released: true }),
            version,
            "singleton",
          ),
          ...globalIdentitiesForDeployment(
            getSafeL2SingletonDeployments({ version, released: true }),
            version,
            "l2Singleton",
          ),
        ];
    for (const candidate of candidates) {
      byAddress.set(candidate.address.toLowerCase(), candidate);
    }
  }

  return [...byAddress.values()];
}

export function resolveSafeSingleton(
  chainId: number,
  singleton: string,
): SafeDeploymentIdentity | null {
  const normalized = singleton.toLowerCase();
  return (
    getSafeSingletonAllowlist(chainId).find(
      (candidate) => candidate.address.toLowerCase() === normalized,
    ) ?? null
  );
}

export function getCanonicalMultiSendAddress(
  chainId: number,
  version: SafeSupportedVersion,
): SafeAddress | null {
  const deployment = getMultiSendDeployments({
    version,
    released: true,
    network: String(chainId),
  });
  const addresses = addressesForNetwork(deployment, chainId);
  if (addresses.length === 1) return addresses[0] as SafeAddress;
  if (!deployment?.released) return null;

  const counts = new Map<string, { address: SafeAddress; count: number }>();
  for (const configured of Object.values(deployment.networkAddresses)) {
    for (const address of Array.isArray(configured) ? configured : [configured]) {
      const key = address.toLowerCase();
      const current = counts.get(key);
      counts.set(key, {
        address: address as SafeAddress,
        count: (current?.count ?? 0) + 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.address ?? null;
}

export function getCanonicalFallbackHandlerAddresses(
  chainId: number,
  version: SafeSupportedVersion,
): SafeAddress[] {
  const deployment = getCompatibilityFallbackHandlerDeployments({
    version,
    released: true,
    network: String(chainId),
  });
  const networkAddresses = addressesForNetwork(deployment, chainId);
  const addresses = networkAddresses.length > 0
    ? networkAddresses
    : deployment?.released
      ? Object.values(deployment.deployments).flatMap((candidate) =>
          candidate ? [candidate.address] : [],
        )
      : [];
  return addresses.map(
    (address) => address.toLowerCase() as SafeAddress,
  );
}

export function isCanonicalFallbackHandler(
  chainId: number,
  version: SafeSupportedVersion,
  address: string,
): boolean {
  const normalized = address.toLowerCase();
  return getCanonicalFallbackHandlerAddresses(chainId, version).some(
    (candidate) => candidate === normalized,
  );
}

export function isCanonicalSafeProxyRuntime(
  chainId: number,
  version: SafeSupportedVersion,
  runtimeHash: string,
): boolean {
  // zkSync Era uses a non-EVM deployment/runtime format and needs a separate
  // reviewed fixture before it can be enabled by this EVM-only implementation.
  if (chainId === 324) return false;
  return SAFE_PROXY_RUNTIME_HASHES[version] === runtimeHash.toLowerCase();
}
