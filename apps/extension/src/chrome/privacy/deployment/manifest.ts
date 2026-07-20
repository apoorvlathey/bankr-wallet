import type { Address, Hex } from "viem";

export type PrivacyPoolsContractId =
  | "entrypointProxy"
  | "entrypointImplementation"
  | "ethPool"
  | "withdrawalVerifier"
  | "ragequitVerifier";

export interface PrivacyPoolsContractPin {
  address: Address;
  runtimeByteLength: number;
  runtimeBytecodeHash: Hex;
}

function contractPin(
  address: Address,
  runtimeByteLength: number,
  runtimeBytecodeHash: Hex,
): Readonly<PrivacyPoolsContractPin> {
  return Object.freeze({ address, runtimeByteLength, runtimeBytecodeHash });
}

/**
 * Exact Sepolia ETH deployment published by the official Privacy Pools app.
 * Mainnet and ERC-20 pools are deliberately absent from this release.
 */
export const PRIVACY_POOLS_SEPOLIA_DEPLOYMENT = Object.freeze({
  version: 1 as const,
  source: Object.freeze({
    repository: "0xbow-io/privacy-pools-website",
    commit: "461867adb439f25f1cc809ee0187357916b90ef6",
    path: "src/config/chainData.ts",
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
    date: "2026-07-19" as const,
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
        name: "Testnet Relay" as const,
        url: "https://testnet-relayer.privacypools.com" as const,
        signerPolicy: "pinned" as const,
        // Official Sepolia postman used by the 0xbow relayer. Independently
        // published by ethereum/kohaku at commit 9ba476d.
        signerAddress: "0x696FE46495688fC9e99BAd2dAF2133B33de364eA" as Address,
      }),
      Object.freeze({
        name: "Freedom Relay" as const,
        url: "https://fastrelay.xyz" as const,
        // This relayer signs quotes with the same account that receives its
        // fee. The signed withdrawal data and /details response must agree.
        signerPolicy: "fee-recipient" as const,
      }),
    ]),
  }),
  contracts: Object.freeze({
    entrypointProxy: contractPin(
      "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
      122,
      "0xf15a07c54ab3420101c38795fc919a27ffb05f1a0049070ba3b8f10bae32af97",
    ),
    entrypointImplementation: contractPin(
      "0x457f219308fd4f06ffb39dc7b532a51b1580f58b",
      13_490,
      "0x912bb4cd8b30434861eb5b3dfed3a38fe4cfc6004f2321994073ec0288d29efe",
    ),
    ethPool: contractPin(
      "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
      7_378,
      "0xd01724d2a831dc90c77eb5f9efacdf4d1642e8fb2722bf580ca0872c8c12e6d7",
    ),
    withdrawalVerifier: contractPin(
      "0x822f33Ed5Ac1d33ceed4EEC60A99b06e5053A00a",
      1_947,
      "0x54515096fff858166d381897047ecf92c8b6a595c01416cafa7b9b608670ab67",
    ),
    ragequitVerifier: contractPin(
      "0xb4b9cE9aEbD6A2C82A7ba5B64E33Cc7Fb6eC1b60",
      1_582,
      "0x1045f87f241bb626b24e0156a478cc0a1d018ad7850c728fd93f10c4b03b27cd",
    ),
  } satisfies Record<PrivacyPoolsContractId, Readonly<PrivacyPoolsContractPin>>),
});

/**
 * A release-state enum avoids a security-disabling boolean or environment
 * override. Local operation preparation may persist encrypted recovery state,
 * while every onchain Privacy Pools mutation remains blocked.
 */
export const PRIVACY_POOLS_RELEASE_POLICY = Object.freeze({
  mode: "sepolia-local-beta" as const,
  readiness: "enabled" as const,
  quotes: "enabled" as const,
  operationPreparation: "enabled" as const,
  // Sepolia deposits are enabled only for WalletChan-controlled local
  // private-key and seed-phrase signers. Mainnet is absent from this manifest,
  // and Bankr's documented raw-submit chains do not include Sepolia.
  mutations: "sepolia-enabled" as "blocked" | "sepolia-enabled",
});
