/**
 * Preferred fee tokens per chain — blue-chip / stable tokens we prefer
 * to collect swap fees in (to reduce exposure to volatile memecoins).
 *
 * When either the sellToken or buyToken is in this set, we tell the 0x API
 * to collect the fee in that token. Higher priority = more preferred.
 *
 * If neither side is preferred, we fall back to sellToken (the default).
 */

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// Priority: higher number = more preferred as fee token
// Stablecoins > native ETH/WETH > other blue chips
interface PreferredToken {
  priority: number;
}

// Per-chain preferred token maps (all addresses lowercased)
const PREFERRED_BY_CHAIN: Record<string, Record<string, PreferredToken>> = {
  // Ethereum
  "1": {
    [NATIVE]: { priority: 10 },                                       // ETH
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { priority: 10 },  // WETH
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { priority: 20 },  // USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7": { priority: 20 },  // USDT
    "0x6b175474e89094c44da98b954eedeac495271d0f": { priority: 15 },  // DAI
  },
  // Optimism
  "10": {
    [NATIVE]: { priority: 10 },
    "0x4200000000000000000000000000000000000006": { priority: 10 },  // WETH
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85": { priority: 20 },  // USDC
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58": { priority: 20 },  // USDT
  },
  // BSC
  "56": {
    [NATIVE]: { priority: 10 },                                       // BNB
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { priority: 10 },  // WBNB
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { priority: 20 },  // USDC
    "0x55d398326f99059ff775485246999027b3197955": { priority: 20 },  // USDT
  },
  // Unichain
  "130": {
    [NATIVE]: { priority: 10 },
    "0x4200000000000000000000000000000000000006": { priority: 10 },  // WETH
    "0x078d782b760474a361dda0af3839290b0ef57ad6": { priority: 20 },  // USDC
  },
  // Polygon
  "137": {
    [NATIVE]: { priority: 10 },                                       // POL
    "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": { priority: 10 },  // WPOL
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { priority: 20 },  // USDC
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": { priority: 20 },  // USDT
  },
  // Sonic
  "146": {
    [NATIVE]: { priority: 10 },                                       // S
    "0x29219dd400f2bf60e5a23d13be72b486d4038894": { priority: 20 },  // USDC.e
  },
  // World Chain
  "480": {
    [NATIVE]: { priority: 10 },
    "0x4200000000000000000000000000000000000006": { priority: 10 },  // WETH
    "0x79a02482a880bce3f13e09da970dc34db4cd24d1": { priority: 20 },  // USDC.e
  },
  // Abstract
  "2741": {
    [NATIVE]: { priority: 10 },
    "0x3439153eb7af838ad19d56e1571fbd09333c2809": { priority: 10 },  // WETH
    "0x84a71ccd554cc1b02749b35d22f684cc8ec987e1": { priority: 20 },  // USDC.e
  },
  // Mantle
  "5000": {
    [NATIVE]: { priority: 10 },                                       // MNT
    "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9": { priority: 20 },  // USDC
    "0x201eba5cc46d216ce6dc03f6a759e8e766e956ae": { priority: 20 },  // USDT
  },
  // Base
  "8453": {
    [NATIVE]: { priority: 10 },
    "0x4200000000000000000000000000000000000006": { priority: 10 },  // WETH
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { priority: 20 },  // USDC
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": { priority: 15 },  // USDT
  },
  // Mode
  "34443": {
    [NATIVE]: { priority: 10 },
    "0x4200000000000000000000000000000000000006": { priority: 10 },  // WETH
    "0xd988097fb8612cc24eec14542bc03424c656005f": { priority: 20 },  // USDC
  },
  // Arbitrum
  "42161": {
    [NATIVE]: { priority: 10 },
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { priority: 10 },  // WETH
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { priority: 20 },  // USDC
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { priority: 20 },  // USDT
  },
  // Avalanche
  "43114": {
    [NATIVE]: { priority: 10 },                                       // AVAX
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": { priority: 20 },  // USDC
    "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7": { priority: 20 },  // USDT
  },
  // Ink
  "57073": {
    [NATIVE]: { priority: 10 },
    "0xf1815bd50389c46847f0bda824ec8da914045d14": { priority: 20 },  // USDC
  },
  // Linea
  "59144": {
    [NATIVE]: { priority: 10 },
    "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f": { priority: 10 },  // WETH
    "0x176211869ca2b568f2a7d4ee941e073a821ee1ff": { priority: 20 },  // USDC.e
  },
  // Berachain
  "80094": {
    [NATIVE]: { priority: 10 },                                       // BERA
    "0x549943e04f40284185054145c6e4e9568c1d3241": { priority: 20 },  // USDC
  },
  // Blast
  "81457": {
    [NATIVE]: { priority: 10 },
    "0x4300000000000000000000000000000000000004": { priority: 10 },  // WETH
    "0x4300000000000000000000000000000000000003": { priority: 20 },  // USDB
  },
  // Scroll
  "534352": {
    [NATIVE]: { priority: 10 },
    "0x5300000000000000000000000000000000000004": { priority: 10 },  // WETH
    "0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4": { priority: 20 },  // USDC
  },
};

/**
 * Given a swap's chain, sellToken, and buyToken, return which token
 * the fee should be collected in. Prefers stablecoins > ETH/WETH > sellToken.
 */
export function resolveSwapFeeToken(
  chainId: string,
  sellToken: string,
  buyToken: string,
): string {
  const preferred = PREFERRED_BY_CHAIN[chainId];
  if (!preferred) return sellToken;

  const sellLower = sellToken.toLowerCase();
  const buyLower = buyToken.toLowerCase();

  const sellPriority = preferred[sellLower]?.priority ?? 0;
  const buyPriority = preferred[buyLower]?.priority ?? 0;

  // Neither is preferred — default to sellToken
  if (sellPriority === 0 && buyPriority === 0) return sellToken;

  // Pick whichever has higher priority; tie goes to sellToken
  return buyPriority > sellPriority ? buyToken : sellToken;
}
