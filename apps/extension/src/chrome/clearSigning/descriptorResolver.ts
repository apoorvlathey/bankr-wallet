import { resolveProxyImplementation } from "../network/proxyResolver";
import { fetchClearSigningDescriptor } from "./descriptorClient";
import { extendDescriptorDeployments } from "./deploymentExtension";
import type { DescriptorLookup } from "./types";
import type { Erc7730Descriptor } from "@/lib/clearSigning/types";

export interface DescriptorResolutionDependencies {
  fetchDescriptor: (
    lookup: DescriptorLookup,
  ) => Promise<Erc7730Descriptor | null>;
  resolveProxy: (
    chainId: number,
    address: string,
  ) => Promise<{ implementation: string; kind: string } | null>;
}

const DEFAULT_DEPENDENCIES: DescriptorResolutionDependencies = {
  fetchDescriptor: fetchClearSigningDescriptor,
  resolveProxy: resolveProxyImplementation,
};

/** Remote direct lookup followed by configured-RPC proxy fallback. */
export async function resolveRemoteDescriptor(
  lookup: DescriptorLookup,
  dependencies: DescriptorResolutionDependencies = DEFAULT_DEPENDENCIES,
): Promise<Erc7730Descriptor | null> {
  const tag = `[clear-signing/bg] ${lookup.kind} ${lookup.chainId}:${lookup.address}`;
  let descriptor = await dependencies.fetchDescriptor(lookup);
  console.log(`${tag} direct fetch: ${descriptor ? "matched" : "404"}`);
  if (descriptor) return descriptor;

  try {
    console.log(`${tag} attempting proxy resolution…`);
    const proxy = await dependencies.resolveProxy(
      lookup.chainId,
      lookup.address,
    );
    if (!proxy) {
      console.log(`${tag} ✗ not a recognized proxy`);
      return null;
    }
    console.log(
      `${tag} ✓ ${proxy.kind} proxy → impl ${proxy.implementation}`,
    );
    const implementationDescriptor = await dependencies.fetchDescriptor({
      ...lookup,
      address: proxy.implementation,
    });
    if (!implementationDescriptor) {
      console.log(
        `${tag} ✗ impl ${proxy.implementation} has no descriptor either`,
      );
      return null;
    }
    console.log(`${tag} ✓ impl descriptor fetched — extending deployments`);
    descriptor = extendDescriptorDeployments(
      implementationDescriptor,
      lookup.kind,
      lookup.chainId,
      lookup.address,
    );
  } catch (error) {
    console.warn(`${tag} proxy fallback failed:`, error);
  }
  return descriptor;
}
