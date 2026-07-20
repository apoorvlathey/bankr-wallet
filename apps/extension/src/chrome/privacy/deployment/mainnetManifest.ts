import type { Address, Hex } from "viem";

import {
  privacyPoolsContractPin,
  type PrivacyPoolsDeployment,
  type PrivacyPoolsReleasePolicy,
} from "./types";

/**
 * Ethereum mainnet ETH deployment from the official app config, strengthened
 * with bytecode and live EIP-1967 implementation pins observed on 2026-07-20.
 */
export const PRIVACY_POOLS_MAINNET_DEPLOYMENT = Object.freeze({
  version: 1 as const,
  profile: "mainnet" as const,
  chainName: "Ethereum" as const,
  explorerBaseUrl: "https://etherscan.io" as const,
  source: Object.freeze({
    repository: "0xbow-io/privacy-pools-website" as const,
    commit: "461867adb439f25f1cc809ee0187357916b90ef6",
    path: "src/config/chainData.ts" as const,
  }),
  chainId: 1,
  chainIdHex: "0x1" as Hex,
  nativeAsset: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address,
  scope:
    4_916_574_638_117_198_869_413_701_114_161_172_350_986_437_430_914_933_850_166_949_084_132_905_299_523n,
  deploymentBlock: 22_153_707n,
  observedAt: Object.freeze({
    blockNumber: 25_573_384n,
    blockHash:
      "0x0533bd1be8dfa610a1497bd174b640164b3aad03f9e86ad8a245505bc900de1c" as Hex,
    date: "2026-07-20",
  }),
  eip1967ImplementationSlot:
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex,
  assetConfig: Object.freeze({
    minimumDepositAmount: 10_000_000_000_000_000n,
    vettingFeeBPS: 50n,
    maxRelayFeeBPS: 1_000n,
  }),
  services: Object.freeze({
    aspBaseUrl: "https://api.0xbow.io" as const,
    relayers: Object.freeze([
      Object.freeze({
        name: "Fast Relay",
        url: "https://fastrelay.xyz" as const,
        signerPolicy: "fee-recipient" as const,
      }),
      Object.freeze({
        name: "Cloaked Relay",
        url: "https://api.clkd.xyz" as const,
        signerPolicy: "pinned" as const,
        signerAddress: "0x3A27cfd1BB78Ff6Fd356Eaa59c2f6232FfC6554a" as Address,
      }),
    ]),
  }),
  contracts: Object.freeze({
    entrypointProxy: privacyPoolsContractPin(
      "0x6818809EefCe719E480a7526D76bD3e561526b46",
      122,
      "0xf15a07c54ab3420101c38795fc919a27ffb05f1a0049070ba3b8f10bae32af97",
    ),
    entrypointImplementation: privacyPoolsContractPin(
      "0x15e355024de1CDc74ADdea7EBDf98418Ba5B1a2c",
      13_490,
      "0xfb5c2ac0d0556e489bce13315892302150e6f682e6cab57e317ab1a4945af5e6",
    ),
    ethPool: privacyPoolsContractPin(
      "0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB",
      7_378,
      "0xd7f3f10491a60c3295019ec7f7bfc4e70290d2bbc5278245b12dda8e93b066de",
    ),
    withdrawalVerifier: privacyPoolsContractPin(
      "0x022891F938Ae7fDC8Ab9Ead0FBf50aBA8C897D6d",
      1_947,
      "0x54515096fff858166d381897047ecf92c8b6a595c01416cafa7b9b608670ab67",
    ),
    ragequitVerifier: privacyPoolsContractPin(
      "0xa45ACa8604a73D80C551fAad6355A5c3A5565eC6",
      1_582,
      "0x1045f87f241bb626b24e0156a478cc0a1d018ad7850c728fd93f10c4b03b27cd",
    ),
  }),
} satisfies PrivacyPoolsDeployment);

export const PRIVACY_POOLS_MAINNET_RELEASE_POLICY = Object.freeze({
  mode: "mainnet-production" as const,
  deploymentProfile: "mainnet" as const,
  readiness: "enabled" as const,
  quotes: "enabled" as const,
  operationPreparation: "enabled" as const,
  mutations: "enabled" as const,
  bankrMutations: "enabled" as const,
} satisfies PrivacyPoolsReleasePolicy);
