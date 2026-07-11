import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
} from "@walletchan/shared/contracts";

/**
 * Canonical USDC contracts on WalletChan's built-in mainnets. Circle-issued
 * native contracts are preferred; where Circle has not issued native USDC,
 * the chain's established canonical USDC.e bridge representation is used.
 *
 * Source: https://developers.circle.com/stablecoins/usdc-contract-addresses
 * Sources:
 * - https://developers.circle.com/stablecoins/usdc-contract-addresses
 * - Chain-native token registries already used by WalletChan's 0x integration
 *
 * Verified against each configured chain RPC on 2026-07-11: deployed bytecode,
 * a USDC/USDC.e symbol, and 6 decimals. Chains without a verified canonical
 * representation are intentionally absent so similarly named assets never merge.
 */
export const CANONICAL_USDC_BY_CHAIN_ID: ReadonlyMap<number, string> = new Map([
  [1, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
  [10, "0x0b2c639c533813f4aa9d7837caf62653d097ff85"],
  [130, "0x078d782b760474a361dda0af3839290b0ef57ad6"],
  [137, "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"],
  [143, "0x754704bc059f8c67012fed69bc8a327a5aafb603"],
  [146, "0x29219dd400f2bf60e5a23d13be72b486d4038894"],
  [324, "0x1d17cbcf0d6d143135ae902365d2e5e2a16538d4"],
  [480, "0x79a02482a880bce3f13e09da970dc34db4cd24d1"],
  [999, "0xb88339cb7199b77e23db6e890353e22632ba630f"],
  [2741, "0x84a71ccd554cc1b02749b35d22f684cc8ec987e1"],
  [5000, "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9"],
  [BASE_CHAIN_ID, BASE_USDC_ADDRESS.toLowerCase()],
  [34443, "0xd988097fb8612cc24eec14542bc03424c656005f"],
  [42161, "0xaf88d065e77c8cc2239327c5edb3a432268e5831"],
  [43114, "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"],
  [57073, "0x2d270e6886d130d724215a266106e6832161eaed"],
  [59144, "0x176211869ca2b568f2a7d4ee941e073a821ee1ff"],
  [80094, "0x549943e04f40284185054145c6e4e9568c1d3241"],
  [534352, "0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4"],
]);

/**
 * Official Tether/USDT0 contracts that overlap with WalletChan's built-in
 * mainnets. Ethereum, Avalanche, Polygon, Arbitrum, and ZKsync use their
 * established USDT representations; newer networks use the official USDT0
 * token backed by the Ethereum supply.
 *
 * Sources:
 * - https://tether.to/en/supported-protocols/
 * - https://docs.usdt0.to/technical-documentation/deployments
 *
 * Verified against each configured chain RPC on 2026-07-11: expected chain ID,
 * deployed bytecode, a USDT/USDT0 symbol, and 6 decimals. Chains without an
 * official or chain-canonical representation are intentionally absent.
 */
export const CANONICAL_USDT_BY_CHAIN_ID: ReadonlyMap<number, string> = new Map([
  [1, "0xdac17f958d2ee523a2206206994597c13d831ec7"],
  [10, "0x01bff41798a0bcf287b996046ca68b395dbc1071"],
  [130, "0x9151434b16b9763660705744891fa906f660ecc5"],
  [137, "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"],
  [143, "0xe7cd86e13ac4309349f30b3435a9d337750fc82d"],
  [324, "0x493257fd37edb34451f62edf8d2a0c418852ba4c"],
  [999, "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb"],
  [4217, "0x20c00000000000000000000014f22ca97301eb73"],
  [4326, "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb"],
  [5000, "0x779ded0c9e1022225f8e0630b35a9b54be713736"],
  [9745, "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb"],
  [42161, "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"],
  [43114, "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7"],
  [57073, "0x0200c29006150606b650577bbe7b6248f58470c1"],
  [80094, "0x779ded0c9e1022225f8e0630b35a9b54be713736"],
]);
