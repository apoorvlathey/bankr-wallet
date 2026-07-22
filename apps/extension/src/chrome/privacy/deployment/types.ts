import type { Address, Hex } from "viem";

export type PrivacyPoolsContractId =
  | "entrypointProxy"
  | "entrypointImplementation"
  | "ethPool"
  | "withdrawalVerifier"
  | "ragequitVerifier";

export interface PrivacyPoolsContractPin {
  readonly address: Address;
  readonly runtimeByteLength: number;
  readonly runtimeBytecodeHash: Hex;
}

export interface PrivacyPoolsRelayerPin {
  readonly name: string;
  readonly url: `https://${string}`;
  readonly signerPolicy: "pinned" | "fee-recipient";
  readonly signerAddress?: Address;
}

export interface PrivacyPoolsDeployment {
  readonly version: 1;
  readonly profile: "sepolia" | "mainnet";
  readonly chainName: "Sepolia" | "Ethereum";
  readonly explorerBaseUrl: `https://${string}`;
  readonly source: Readonly<{
    repository: "0xbow-io/privacy-pools-website";
    commit: string;
    path: "src/config/chainData.ts";
  }>;
  readonly chainId: 1 | 11_155_111;
  readonly chainIdHex: Hex;
  readonly nativeAsset: Address;
  readonly scope: bigint;
  readonly deploymentBlock: bigint;
  readonly observedAt: Readonly<{
    blockNumber: bigint;
    blockHash: Hex;
    date: string;
  }>;
  readonly eip1967ImplementationSlot: Hex;
  readonly assetConfig: Readonly<{
    minimumDepositAmount: bigint;
    vettingFeeBPS: bigint;
    maxRelayFeeBPS: bigint;
  }>;
  readonly services: Readonly<{
    aspBaseUrl: `https://${string}`;
    relayers: readonly Readonly<PrivacyPoolsRelayerPin>[];
  }>;
  readonly contracts: Readonly<
    Record<PrivacyPoolsContractId, Readonly<PrivacyPoolsContractPin>>
  >;
}

export interface PrivacyPoolsReleasePolicy {
  readonly mode: "sepolia-local-beta" | "mainnet-production";
  readonly deploymentProfile: PrivacyPoolsDeployment["profile"];
  readonly readiness: "enabled";
  readonly quotes: "enabled";
  readonly operationPreparation: "enabled";
  readonly mutations: "enabled";
  readonly bankrMutations: "blocked" | "enabled";
}

export function privacyPoolsContractPin(
  address: Address,
  runtimeByteLength: number,
  runtimeBytecodeHash: Hex,
): Readonly<PrivacyPoolsContractPin> {
  return Object.freeze({ address, runtimeByteLength, runtimeBytecodeHash });
}
