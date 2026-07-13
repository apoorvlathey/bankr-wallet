// Exact Swap API support from the "Swap and Gasless APIs" table. Do not infer
// support from the separate Cross-Chain API table on the same page.
// https://docs.0x.org/docs/introduction/supported-chains
export const ZEROX_SWAP_SUPPORTED_CHAIN_IDS = new Set([
  "1",      // Ethereum
  "10",     // Optimism
  "56",     // BSC
  "130",    // Unichain
  "137",    // Polygon
  "143",    // Monad
  "146",    // Sonic
  "480",    // World Chain
  "999",    // HyperEVM
  "2741",   // Abstract
  "4217",   // Tempo
  "4663",   // Robinhood Chain
  "5000",   // Mantle
  "8453",   // Base
  "9745",   // Plasma
  "42161",  // Arbitrum
  "43114",  // Avalanche
  "57073",  // Ink
  "59144",  // Linea
  "80094",  // Berachain
  "534352", // Scroll
]);
