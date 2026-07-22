import type { Address, Hex } from "viem";

import {
  privacyPoolsContractPin,
  type PrivacyPoolsDeployment,
  type PrivacyPoolsReleasePolicy,
} from "./types";

/** Exact Sepolia ETH deployment retained for explicit Sepolia builds. */
export const PRIVACY_POOLS_SEPOLIA_DEPLOYMENT = Object.freeze({
  version: 1 as const,
  profile: "sepolia" as const,
  chainName: "Sepolia" as const,
  explorerBaseUrl: "https://sepolia.etherscan.io" as const,
  source: Object.freeze({
    repository: "0xbow-io/privacy-pools-website" as const,
    commit: "461867adb439f25f1cc809ee0187357916b90ef6",
    path: "src/config/chainData.ts" as const,
  }),
  chainId: 11_155_111,
  chainIdHex: "0xaa36a7" as Hex,
  nativeAsset: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address,
  scope:
    13_541_713_702_858_359_530_363_969_798_588_891_965_037_210_808_099_002_426_745_892_519_913_535_247_342n,
  deploymentBlock: 8_587_019n,
  observedAt: Object.freeze({
    blockNumber: 11_305_183n,
    blockHash:
      "0x6d736a66b56e3aa4deb0ea0304e72d97cb2354562c31858c4fb1ca20ad48b735" as Hex,
    date: "2026-07-19",
  }),
  eip1967ImplementationSlot:
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex,
  assetConfig: Object.freeze({
    minimumDepositAmount: 1_000_000_000_000_000n,
    vettingFeeBPS: 100n,
    maxRelayFeeBPS: 100n,
  }),
  services: Object.freeze({
    aspBaseUrl: "https://dw.0xbow.io" as const,
    relayers: Object.freeze([
      Object.freeze({
        name: "Testnet Relay",
        url: "https://testnet-relayer.privacypools.com" as const,
        signerPolicy: "pinned" as const,
        signerAddress: "0x696FE46495688fC9e99BAd2dAF2133B33de364eA" as Address,
      }),
      Object.freeze({
        name: "Freedom Relay",
        url: "https://fastrelay.xyz" as const,
        signerPolicy: "fee-recipient" as const,
      }),
    ]),
  }),
  contracts: Object.freeze({
    entrypointProxy: privacyPoolsContractPin(
      "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
      122,
      "0xf15a07c54ab3420101c38795fc919a27ffb05f1a0049070ba3b8f10bae32af97",
    ),
    entrypointImplementation: privacyPoolsContractPin(
      "0x457f219308fd4f06ffb39dc7b532a51b1580f58b",
      13_490,
      "0x912bb4cd8b30434861eb5b3dfed3a38fe4cfc6004f2321994073ec0288d29efe",
    ),
    ethPool: privacyPoolsContractPin(
      "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
      7_378,
      "0xd01724d2a831dc90c77eb5f9efacdf4d1642e8fb2722bf580ca0872c8c12e6d7",
    ),
    withdrawalVerifier: privacyPoolsContractPin(
      "0x822f33Ed5Ac1d33ceed4EEC60A99b06e5053A00a",
      1_947,
      "0x54515096fff858166d381897047ecf92c8b6a595c01416cafa7b9b608670ab67",
    ),
    ragequitVerifier: privacyPoolsContractPin(
      "0xb4b9cE9aEbD6A2C82A7ba5B64E33Cc7Fb6eC1b60",
      1_582,
      "0x1045f87f241bb626b24e0156a478cc0a1d018ad7850c728fd93f10c4b03b27cd",
    ),
  }),
} satisfies PrivacyPoolsDeployment);

export const PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY = Object.freeze({
  mode: "sepolia-local-beta" as const,
  deploymentProfile: "sepolia" as const,
  readiness: "enabled" as const,
  quotes: "enabled" as const,
  operationPreparation: "enabled" as const,
  mutations: "enabled" as const,
  bankrMutations: "blocked" as const,
} satisfies PrivacyPoolsReleasePolicy);
