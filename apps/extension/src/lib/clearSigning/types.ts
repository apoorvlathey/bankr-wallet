/**
 * ERC-7730 descriptor types — the subset we render in v1.
 * Spec: https://github.com/ethereum/clear-signing-erc7730-registry/tree/master/specs
 */

export interface Erc7730Deployment {
  chainId: number;
  address: string;
}

export interface Erc7730Context {
  contract?: {
    deployments?: Erc7730Deployment[];
  };
  eip712?: {
    domain?: { name?: string; version?: string };
    deployments?: Erc7730Deployment[];
    schemas?: Array<{ primaryType: string; types?: Record<string, unknown> }>;
  };
}

export interface Erc7730Metadata {
  owner?: string;
  contractName?: string;
  info?: {
    deploymentDate?: string;
    url?: string;
    description?: string;
  };
}

export type Erc7730FieldVisible = "always" | "never" | undefined;

export interface Erc7730Field {
  $ref?: string;
  path?: string;
  label?: string;
  format?: string;
  params?: Record<string, unknown>;
  visible?: Erc7730FieldVisible;
  fields?: Erc7730Field[];
}

export interface Erc7730Format {
  $id?: string;
  intent?: string;
  fields?: Erc7730Field[];
  required?: string[];
  excluded?: string[];
}

export interface Erc7730Descriptor {
  $schema?: string;
  context?: Erc7730Context;
  metadata?: Erc7730Metadata;
  display?: {
    definitions?: Record<string, Erc7730Field>;
    formats?: Record<string, Erc7730Format>;
  };
}

export type DescriptorKind = "calldata" | "eip712";

export interface ResolvedDescriptor {
  descriptor: Erc7730Descriptor;
  kind: DescriptorKind;
  sourcePath?: string;
}
