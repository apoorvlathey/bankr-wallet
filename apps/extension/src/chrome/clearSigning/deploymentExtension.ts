import type {
  DescriptorKind,
  Erc7730Descriptor,
} from "@/lib/clearSigning/types";

/** Clone and bind an implementation descriptor to the queried proxy address. */
export function extendDescriptorDeployments(
  descriptor: Erc7730Descriptor,
  kind: DescriptorKind,
  chainId: number,
  proxyAddress: string,
): Erc7730Descriptor {
  const cloned = JSON.parse(JSON.stringify(descriptor)) as Erc7730Descriptor;
  cloned.context = cloned.context || {};
  const context =
    kind === "calldata"
      ? (cloned.context.contract = cloned.context.contract || {})
      : (cloned.context.eip712 = cloned.context.eip712 || {});
  const deployments = (context.deployments = context.deployments || []);
  if (
    !deployments.some(
      (deployment) =>
        deployment.chainId === chainId &&
        deployment.address?.toLowerCase() === proxyAddress.toLowerCase(),
    )
  ) {
    deployments.push({ chainId, address: proxyAddress });
  }
  return cloned;
}
