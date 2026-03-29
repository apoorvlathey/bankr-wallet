/**
 * Transaction simulation via eth_createAccessList + eth_call state overrides.
 *
 * Injects TxSimulator.sol bytecode at the user's address to compute
 * ERC-20 and native balance deltas — fully decentralized, no external APIs.
 *
 * Source contract: apps/contracts/src/utils/TxSimulator.sol
 * Regenerate bytecode: cd apps/contracts && forge build, then copy
 * deployedBytecode.object from out/TxSimulator.sol/TxSimulator.json
 */

import {
  createPublicClient,
  http,
  erc20Abi,
  encodeFunctionData,
  decodeFunctionResult,
  formatUnits,
  parseEther,
  type PublicClient,
  type Address,
} from "viem";
import { getRpcUrl } from "./txHandlers";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { getCachedTokenList, fetchTokenPrice } from "./swapApi";
import { fetchPortfolio, type PortfolioToken } from "./portfolioApi";

/** Multicall3 is deployed at the same address on all supported chains */
const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetChange {
  /** Token contract address, or "native" for ETH/BNB/POL */
  address: string;
  /** Token symbol (e.g. "USDC", "ETH") */
  symbol: string;
  /** Token name (e.g. "USD Coin", "Ether") */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Token logo URL (from token list or CoinGecko) */
  logoUrl?: string;
  /** Raw signed delta as string (for sorting / advanced use) */
  rawDelta: string;
  /** Formatted amount string (e.g. "1,500.0", "0.05") — always positive */
  formattedAmount: string;
  /** USD value of the change (null if price unavailable) */
  valueUsd: number | null;
  /** "in" = user receives, "out" = user sends */
  direction: "in" | "out";
}

export interface SimulationResult {
  /** Whether the inner transaction succeeded */
  txSuccess: boolean;
  /** Native currency delta (only if non-zero) */
  nativeChange: AssetChange | null;
  /** ERC-20 token balance changes */
  tokenChanges: AssetChange[];
  /** If simulation itself failed */
  simulationFailed: boolean;
  /** Human-readable error */
  simulationError?: string;
  /** False if metadata (symbol/decimals/price) couldn't be fetched for some tokens */
  metadataComplete: boolean;
}

/** Result of a metadata-only retry */
export interface TokenMetadataResult {
  /** Updated token changes with resolved metadata */
  tokenChanges: AssetChange[];
}

// ---------------------------------------------------------------------------
// Simulator bytecode & ABI
// ---------------------------------------------------------------------------

/** Runtime bytecode of TxSimulator.sol (not creation code). */
const SIMULATOR_BYTECODE: `0x${string}` =
  "0x60806040526004361061002c575f3560e01c8063410bc60a14610037578063887628c81461007657610033565b3661003357005b5f80fd5b348015610042575f80fd5b5061005d60048036038101906100589190610ae8565b6100b5565b60405161006d9493929190610d36565b60405180910390f35b348015610081575f80fd5b5061009c60048036038101906100979190610e39565b61054b565b6040516100ac9493929190610d36565b60405180910390f35b5f806060805f4790505f8787905090505f8167ffffffffffffffff8111156100e0576100df610edc565b5b60405190808252806020026020018201604052801561010e5781602001602082028036833780820191505090505b5090505f5b828110156101755761014b8a8a8381811061013157610130610f09565b5b90506020020160208101906101469190610f36565b61092e565b82828151811061015e5761015d610f09565b5b602002602001018181525050806001019050610113565b50600196505f5b8b8b9050811015610297575f8c8c8381811061019b5761019a610f09565b5b90506020028101906101ad9190610f6d565b5f0160208101906101be9190610f36565b73ffffffffffffffffffffffffffffffffffffffff168d8d848181106101e7576101e6610f09565b5b90506020028101906101f99190610f6d565b602001358e8e858181106102105761020f610f09565b5b90506020028101906102229190610f6d565b80604001906102319190610f94565b60405161023f929190611032565b5f6040518083038185875af1925050503d805f8114610279576040519150601f19603f3d011682016040523d82523d5f602084013e61027e565b606091505b505090508061028b575f98505b5080600101905061017c565b5082476102a49190611077565b95505f808367ffffffffffffffff8111156102c2576102c1610edc565b5b6040519080825280602002602001820160405280156102f05781602001602082028036833780820191505090505b5090505f5b848110156103af575f61032e8d8d8481811061031457610313610f09565b5b90506020020160208101906103299190610f36565b61092e565b905084828151811061034357610342610f09565b5b6020026020010151816103569190611077565b83838151811061036957610368610f09565b5b6020026020010181815250505f83838151811061038957610388610f09565b5b6020026020010151146103a357836103a0906110b7565b93505b508060010190506102f5565b508167ffffffffffffffff8111156103ca576103c9610edc565b5b6040519080825280602002602001820160405280156103f85781602001602082028036833780820191505090505b5096508167ffffffffffffffff81111561041557610414610edc565b5b6040519080825280602002602001820160405280156104435781602001602082028036833780820191505090505b5095505f805b85811015610539575f83828151811061046557610464610f09565b5b60200260200101511461052e578c8c8281811061048557610484610f09565b5b905060200201602081019061049a9190610f36565b8983815181106104ad576104ac610f09565b5b602002602001019073ffffffffffffffffffffffffffffffffffffffff16908173ffffffffffffffffffffffffffffffffffffffff16815250508281815181106104fa576104f9610f09565b5b602002602001015188838151811061051557610514610f09565b5b6020026020010181815250508161052b906110b7565b91505b806001019050610449565b50505050505050945094509450949050565b5f806060805f4790505f8787905090505f8167ffffffffffffffff81111561057657610575610edc565b5b6040519080825280602002602001820160405280156105a45781602001602082028036833780820191505090505b5090505f5b8281101561060b576105e18a8a838181106105c7576105c6610f09565b5b90506020020160208101906105dc9190610f36565b61092e565b8282815181106105f4576105f3610f09565b5b6020026020010181815250508060010190506105a9565b508c73ffffffffffffffffffffffffffffffffffffffff168c8c8c604051610634929190611032565b5f6040518083038185875af1925050503d805f811461066e576040519150601f19603f3d011682016040523d82523d5f602084013e610673565b606091505b50508097505082476106859190611077565b95505f808367ffffffffffffffff8111156106a3576106a2610edc565b5b6040519080825280602002602001820160405280156106d15781602001602082028036833780820191505090505b5090505f5b84811015610790575f61070f8d8d848181106106f5576106f4610f09565b5b905060200201602081019061070a9190610f36565b61092e565b905084828151811061072457610723610f09565b5b6020026020010151816107379190611077565b83838151811061074a57610749610f09565b5b6020026020010181815250505f83838151811061076a57610769610f09565b5b6020026020010151146107845783610781906110b7565b93505b508060010190506106d6565b508167ffffffffffffffff8111156107ab576107aa610edc565b5b6040519080825280602002602001820160405280156107d95781602001602082028036833780820191505090505b5096508167ffffffffffffffff8111156107f6576107f5610edc565b5b6040519080825280602002602001820160405280156108245781602001602082028036833780820191505090505b5095505f805b8581101561091a575f83828151811061084657610845610f09565b5b60200260200101511461090f578c8c8281811061086657610865610f09565b5b905060200201602081019061087b9190610f36565b89838151811061088e5761088d610f09565b5b602002602001019073ffffffffffffffffffffffffffffffffffffffff16908173ffffffffffffffffffffffffffffffffffffffff16815250508281815181106108db576108da610f09565b5b60200260200101518883815181106108f6576108f5610f09565b5b6020026020010181815250508161090c906110b7565b91505b80600101905061082a565b505050505050509650965096509692505050565b5f805f8373ffffffffffffffffffffffffffffffffffffffff166370a082313060405160240161095e919061110d565b6040516020818303038152906040529060e01b6020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516109ac919061116e565b5f60405180830381855afa9150503d805f81146109e4576040519150601f19603f3d011682016040523d82523d5f602084013e6109e9565b606091505b50915091508180156109fd57506020815110155b15610a1f5780806020019051810190610a169190611198565b92505050610a25565b5f925050505b919050565b5f80fd5b5f80fd5b5f80fd5b5f80fd5b5f80fd5b5f8083601f840112610a5357610a52610a32565b5b8235905067ffffffffffffffff811115610a7057610a6f610a36565b5b602083019150836020820283011115610a8c57610a8b610a3a565b5b9250929050565b5f8083601f840112610aa857610aa7610a32565b5b8235905067ffffffffffffffff811115610ac557610ac4610a36565b5b602083019150836020820283011115610ae157610ae0610a3a565b5b9250929050565b5f805f8060408587031215610b0057610aff610a2a565b5b5f85013567ffffffffffffffff811115610b1d57610b1c610a2e565b5b610b2987828801610a3e565b9450945050602085013567ffffffffffffffff811115610b4c57610b4b610a2e565b5b610b5887828801610a93565b925092505092959194509250565b5f8115159050919050565b610b7a81610b66565b82525050565b5f819050919050565b610b9281610b80565b82525050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610bea82610bc1565b9050919050565b610bfa81610be0565b82525050565b5f610c0b8383610bf1565b60208301905092915050565b5f602082019050919050565b5f610c2d82610b98565b610c378185610ba2565b9350610c4283610bb2565b805f5b83811015610c72578151610c598882610c00565b9750610c6483610c17565b925050600181019050610c45565b5085935050505092915050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b610cb181610b80565b82525050565b5f610cc28383610ca8565b60208301905092915050565b5f602082019050919050565b5f610ce482610c7f565b610cee8185610c89565b9350610cf983610c99565b805f5b83811015610d29578151610d108882610cb7565b9750610d1b83610cce565b925050600181019050610cfc565b5085935050505092915050565b5f608082019050610d495f830187610b71565b610d566020830186610b89565b8181036040830152610d688185610c23565b90508181036060830152610d7c8184610cda565b905095945050505050565b610d9081610be0565b8114610d9a575f80fd5b50565b5f81359050610dab81610d87565b92915050565b5f819050919050565b610dc381610db1565b8114610dcd575f80fd5b50565b5f81359050610dde81610dba565b92915050565b5f8083601f840112610df957610df8610a32565b5b8235905067ffffffffffffffff811115610e1657610e15610a36565b5b602083019150836001820283011115610e3257610e31610a3a565b5b9250929050565b5f805f805f8060808789031215610e5357610e52610a2a565b5b5f610e6089828a01610d9d565b9650506020610e7189828a01610dd0565b955050604087013567ffffffffffffffff811115610e9257610e91610a2e565b5b610e9e89828a01610de4565b9450945050606087013567ffffffffffffffff811115610ec157610ec0610a2e565b5b610ecd89828a01610a93565b92509250509295509295509295565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b5f60208284031215610f4b57610f4a610a2a565b5b5f610f5884828501610d9d565b91505092915050565b5f80fd5b5f80fd5b5f80fd5b5f82356001606003833603038112610f8857610f87610f61565b5b80830191505092915050565b5f8083356001602003843603038112610fb057610faf610f61565b5b80840192508235915067ffffffffffffffff821115610fd257610fd1610f65565b5b602083019250600182023603831315610fee57610fed610f69565b5b509250929050565b5f81905092915050565b828183375f83830152505050565b5f6110198385610ff6565b9350611026838584611000565b82840190509392505050565b5f61103e82848661100e565b91508190509392505050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f61108182610b80565b915061108c83610b80565b925082820390508181125f8412168282135f8512151617156110b1576110b061104a565b5b92915050565b5f6110c182610db1565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036110f3576110f261104a565b5b600182019050919050565b61110781610be0565b82525050565b5f6020820190506111205f8301846110fe565b92915050565b5f81519050919050565b8281835e5f83830152505050565b5f61114882611126565b6111528185610ff6565b9350611162818560208601611130565b80840191505092915050565b5f611179828461113e565b915081905092915050565b5f8151905061119281610dba565b92915050565b5f602082840312156111ad576111ac610a2a565b5b5f6111ba84828501611184565b9150509291505056fea2646970667358221220c63a1945e851cf1f7fb417be21820b41a0c567d025d82fda2c4ef2fafae3da9a64736f6c634300081a0033";

/** ABI for the simulate() function only. */
const SIMULATOR_ABI = [
  {
    type: "function" as const,
    name: "simulate" as const,
    inputs: [
      { name: "to", type: "address" as const },
      { name: "value", type: "uint256" as const },
      { name: "data", type: "bytes" as const },
      { name: "candidates", type: "address[]" as const },
    ],
    outputs: [
      { name: "success", type: "bool" as const },
      { name: "ethDelta", type: "int256" as const },
      { name: "tokens", type: "address[]" as const },
      { name: "deltas", type: "int256[]" as const },
    ],
    stateMutability: "nonpayable" as const,
  },
] as const;

/** ABI for the simulateBatch() function. */
const BATCH_SIMULATOR_ABI = [
  {
    type: "function" as const,
    name: "simulateBatch" as const,
    inputs: [
      {
        name: "calls",
        type: "tuple[]" as const,
        components: [
          { name: "to", type: "address" as const },
          { name: "value", type: "uint256" as const },
          { name: "data", type: "bytes" as const },
        ],
      },
      { name: "candidates", type: "address[]" as const },
    ],
    outputs: [
      { name: "allSuccess", type: "bool" as const },
      { name: "ethDelta", type: "int256" as const },
      { name: "tokens", type: "address[]" as const },
      { name: "deltas", type: "int256[]" as const },
    ],
    stateMutability: "nonpayable" as const,
  },
] as const;

// ---------------------------------------------------------------------------
// Client cache (separate from gasEstimation to keep modules independent)
// ---------------------------------------------------------------------------

const RPC_TIMEOUT = 10_000;
const clientCache = new Map<number, PublicClient>();

async function getClient(chainId: number): Promise<PublicClient | null> {
  let client = clientCache.get(chainId);
  if (client) return client;

  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;

  client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 1 }),
  });
  clientCache.set(chainId, client);
  return client;
}

// ---------------------------------------------------------------------------
// Native currency + known token logos
// ---------------------------------------------------------------------------

const NATIVE_CURRENCY: Record<
  number,
  { symbol: string; name: string; decimals: number; icon: string }
> = {};
for (const c of CHAIN_REGISTRY) {
  NATIVE_CURRENCY[c.chainId] = {
    symbol: c.nativeCurrency.symbol,
    name: c.nativeCurrency.name,
    decimals: c.nativeCurrency.decimals,
    // Use ETH icon for chains whose native currency is ETH (e.g. Base, Arbitrum),
    // otherwise use the chain icon (e.g. Polygon → POL, BNB Chain → BNB)
    icon: c.nativeCurrency.symbol === "ETH" ? "/chainIcons/ethereum.svg" : c.icon,
  };
}

function getNativeCurrency(chainId: number) {
  return (
    NATIVE_CURRENCY[chainId] ?? {
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      icon: "/chainIcons/ethereum.svg",
    }
  );
}

/** Hardcoded logos for tokens not in the swap token list */
export const KNOWN_TOKEN_LOGOS: Record<string, string> = {
  // WCHAN on Base
  "0xba5ed0000e1ca9136a695f0a848012a16008b032":
    "https://walletchan.com/images/walletchan-icon.png",
};

// ---------------------------------------------------------------------------
// Portfolio price fallback — uses holdings prices when CoinGecko unavailable
// ---------------------------------------------------------------------------

/** Cache fetched portfolio for the duration of a simulation to avoid refetching */
let portfolioCache: { address: string; tokens: PortfolioToken[]; timestamp: number } | null = null;
const PORTFOLIO_CACHE_TTL = 30_000; // 30 seconds

async function getPortfolioPriceMap(
  accountAddress: string,
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  try {
    // Return cached if fresh and same address
    if (
      portfolioCache &&
      portfolioCache.address === accountAddress.toLowerCase() &&
      Date.now() - portfolioCache.timestamp < PORTFOLIO_CACHE_TTL
    ) {
      for (const t of portfolioCache.tokens) {
        if (t.priceUsd > 0) {
          // Key: "chainId:address" (lowercase)
          const key = `${t.chainId}:${t.contractAddress.toLowerCase()}`;
          priceMap.set(key, t.priceUsd);
        }
      }
      return priceMap;
    }

    const portfolio = await fetchPortfolio(accountAddress);
    portfolioCache = {
      address: accountAddress.toLowerCase(),
      tokens: portfolio.tokens,
      timestamp: Date.now(),
    };

    for (const t of portfolio.tokens) {
      if (t.priceUsd > 0) {
        const key = `${t.chainId}:${t.contractAddress.toLowerCase()}`;
        priceMap.set(key, t.priceUsd);
      }
    }
  } catch {
    // Portfolio fetch failed — no fallback prices available
  }

  return priceMap;
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------

export async function simulateAssetChanges(
  tx: {
    from: string;
    to?: string;
    data?: string;
    value?: string;
    chainId: number;
  },
  accountAddress: string,
): Promise<SimulationResult> {
  const EMPTY: SimulationResult = {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    simulationFailed: false,
    metadataComplete: true,
  };

  // Skip contract deployments (no `to` address)
  if (!tx.to) return EMPTY;

  const client = await getClient(tx.chainId);
  if (!client) {
    return { ...EMPTY, simulationFailed: true, simulationError: "No RPC URL" };
  }

  const from = accountAddress as Address;
  const to = tx.to as Address;
  const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;
  const data = (tx.data && tx.data !== "0x" ? tx.data : "0x") as `0x${string}`;

  try {
    // Step 1: Get access list to discover touched contracts
    const { accessList } = await client.createAccessList({
      account: from,
      to,
      value,
      data,
    });

    // Collect unique candidate addresses (include `to` — it could be a token)
    const seen = new Set<string>();
    seen.add(from.toLowerCase()); // exclude user's own address
    const candidates: Address[] = [];
    for (const entry of accessList) {
      const addr = entry.address.toLowerCase();
      if (!seen.has(addr)) {
        seen.add(addr);
        candidates.push(entry.address as Address);
      }
    }
    // Also include `to` if not already present
    if (!seen.has(to.toLowerCase())) {
      candidates.push(to);
    }

    // Step 2: Simulate via eth_call with state override
    const callData = encodeFunctionData({
      abi: SIMULATOR_ABI,
      functionName: "simulate",
      args: [to, value, data, candidates],
    });

    const result = await client.call({
      to: from, // call the user's address (overridden with simulator code)
      data: callData,
      stateOverride: [
        {
          address: from,
          code: SIMULATOR_BYTECODE,
          balance: parseEther("100000"), // ensure enough ETH for the call
        },
      ],
    });

    if (!result.data) {
      return { ...EMPTY, simulationFailed: true, simulationError: "Empty response" };
    }

    // Decode return: (bool success, int256 ethDelta, address[] tokens, int256[] deltas)
    const [txSuccess, ethDelta, tokens, deltas] = decodeFunctionResult({
      abi: SIMULATOR_ABI,
      functionName: "simulate",
      data: result.data,
    });

    // Step 3: Fetch token metadata + prices for non-zero changes
    const { changes: tokenChanges, metadataComplete } = await enrichTokenChanges(
      client,
      tx.chainId,
      tokens as Address[],
      deltas as bigint[],
      accountAddress,
    );

    // Build native change (with USD price from CoinGecko via gasEstimation cache)
    const native = getNativeCurrency(tx.chainId);
    let nativeChange: AssetChange | null = null;
    if (ethDelta !== 0n) {
      const abs = ethDelta < 0n ? -ethDelta : ethDelta;
      const amount = parseFloat(formatUnits(abs, native.decimals));

      // Fetch native price (reuses gasEstimation's CoinGecko cache via import)
      let nativePriceUsd: number | null = null;
      try {
        const { fetchNativePrice } = await import("./gasEstimation");
        nativePriceUsd = await fetchNativePrice(tx.chainId);
      } catch {}

      // Fallback to portfolio holdings price for native currency
      if (nativePriceUsd === null) {
        const portfolioPrices = await getPortfolioPriceMap(accountAddress);
        const key = `${tx.chainId}:native`;
        nativePriceUsd = portfolioPrices.get(key) ?? null;
      }

      nativeChange = {
        address: "native",
        symbol: native.symbol,
        name: native.name,
        decimals: native.decimals,
        logoUrl: native.icon,
        rawDelta: ethDelta.toString(),
        formattedAmount: formatAmount(amount),
        valueUsd: nativePriceUsd !== null ? amount * nativePriceUsd : null,
        direction: ethDelta > 0n ? "in" : "out",
      };
    }

    return { txSuccess, nativeChange, tokenChanges, simulationFailed: false, metadataComplete };
  } catch (err: any) {
    return {
      ...EMPTY,
      metadataComplete: true,
      simulationFailed: true,
      simulationError: err.shortMessage || err.message || "Simulation failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Token enrichment: token list → on-chain fallback → price fetch
// ---------------------------------------------------------------------------

async function enrichTokenChanges(
  client: PublicClient,
  chainId: number,
  tokens: Address[],
  deltas: bigint[],
  accountAddress: string,
): Promise<{ changes: AssetChange[]; metadataComplete: boolean }> {
  if (tokens.length === 0) return { changes: [], metadataComplete: true };

  // 1. Load token list for this chain (cached 24h) — primary metadata source
  const tokenList = await getCachedTokenList(chainId);
  const tokenListMap = new Map<string, { name: string; symbol: string; decimals: number; logoURI: string }>();
  for (const t of tokenList) {
    tokenListMap.set(t.address.toLowerCase(), t);
  }

  // 2. Identify tokens NOT in the token list — need on-chain metadata
  const unknownIndices: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!tokenListMap.has(tokens[i].toLowerCase())) {
      unknownIndices.push(i);
    }
  }

  // 3. On-chain multicall for unknown tokens: name(), symbol(), decimals()
  let metadataComplete = true;
  const onchainMeta = new Map<string, { name: string; symbol: string; decimals: number }>();
  if (unknownIndices.length > 0) {
    const contracts = unknownIndices.flatMap((idx) => [
      { address: tokens[idx], abi: erc20Abi, functionName: "name" as const },
      { address: tokens[idx], abi: erc20Abi, functionName: "symbol" as const },
      { address: tokens[idx], abi: erc20Abi, functionName: "decimals" as const },
    ]);

    try {
      const results = await client.multicall({
        contracts,
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
      });
      for (let j = 0; j < unknownIndices.length; j++) {
        const idx = unknownIndices[j];
        const nameResult = results[j * 3];
        const symbolResult = results[j * 3 + 1];
        const decimalsResult = results[j * 3 + 2];

        const name =
          nameResult?.status === "success" && typeof nameResult.result === "string"
            ? nameResult.result
            : "";
        const symbol =
          symbolResult?.status === "success" && typeof symbolResult.result === "string"
            ? symbolResult.result
            : `${tokens[idx].slice(0, 6)}...${tokens[idx].slice(-4)}`;
        const decimals =
          decimalsResult?.status === "success" && typeof decimalsResult.result === "number"
            ? decimalsResult.result
            : 18;

        // If symbol still looks like an address, metadata is incomplete
        if (symbol.includes("...")) metadataComplete = false;

        onchainMeta.set(tokens[idx].toLowerCase(), { name, symbol, decimals });
      }
    } catch {
      // Multicall failed entirely — mark as incomplete for retry
      metadataComplete = false;
      for (const idx of unknownIndices) {
        onchainMeta.set(tokens[idx].toLowerCase(), {
          name: "",
          symbol: `${tokens[idx].slice(0, 6)}...${tokens[idx].slice(-4)}`,
          decimals: 18,
        });
      }
    }
  }

  // 4. Fetch USD prices in parallel for all changed tokens
  const pricePromises = tokens.map((addr) =>
    fetchTokenPrice(chainId, addr).catch(() => 0),
  );
  let prices: number[];
  try {
    prices = await Promise.all(pricePromises);
  } catch {
    prices = tokens.map(() => 0);
    metadataComplete = false;
  }

  // 4b. Fallback to portfolio holdings prices for tokens with no CoinGecko price
  const hasMissingPrices = prices.some((p) => p === 0);
  if (hasMissingPrices) {
    const portfolioPrices = await getPortfolioPriceMap(accountAddress);
    for (let i = 0; i < prices.length; i++) {
      if (prices[i] === 0) {
        const key = `${chainId}:${tokens[i].toLowerCase()}`;
        const fallback = portfolioPrices.get(key);
        if (fallback) prices[i] = fallback;
      }
    }
  }

  // 5. Build final AssetChange array
  const changes: AssetChange[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const addr = tokens[i].toLowerCase();
    const listEntry = tokenListMap.get(addr);
    const onchain = onchainMeta.get(addr);

    const symbol = listEntry?.symbol ?? onchain?.symbol ?? `${tokens[i].slice(0, 6)}...${tokens[i].slice(-4)}`;
    const name = listEntry?.name ?? onchain?.name ?? "";
    const decimals = listEntry?.decimals ?? onchain?.decimals ?? 18;
    const logoUrl = listEntry?.logoURI || KNOWN_TOKEN_LOGOS[addr] || undefined;

    const delta = deltas[i];
    const abs = delta < 0n ? -delta : delta;
    const amount = parseFloat(formatUnits(abs, decimals));
    const priceUsd = prices[i];

    changes.push({
      address: tokens[i],
      symbol,
      name,
      decimals,
      logoUrl,
      rawDelta: delta.toString(),
      formattedAmount: formatAmount(amount),
      valueUsd: priceUsd > 0 ? amount * priceUsd : null,
      direction: delta > 0n ? "in" : "out",
    });
  }

  return { changes, metadataComplete };
}

// ---------------------------------------------------------------------------
// Metadata retry — called by the UI when initial metadata fetch was incomplete
// ---------------------------------------------------------------------------

export async function retryTokenMetadata(
  chainId: number,
  tokenChanges: AssetChange[],
  accountAddress: string,
): Promise<TokenMetadataResult> {
  // Only retry tokens that have incomplete metadata (symbol looks like an address)
  const needsRetry = tokenChanges.filter(
    (c) => c.symbol.includes("...") || c.valueUsd === null,
  );
  if (needsRetry.length === 0) return { tokenChanges };

  const client = await getClient(chainId);
  if (!client) return { tokenChanges };

  // 1. Try token list again (may have been cached since first attempt)
  const tokenList = await getCachedTokenList(chainId);
  const tokenListMap = new Map<string, { name: string; symbol: string; decimals: number; logoURI: string }>();
  for (const t of tokenList) {
    tokenListMap.set(t.address.toLowerCase(), t);
  }

  // 2. Identify tokens still needing on-chain metadata
  const onchainNeeded = needsRetry.filter(
    (c) => c.symbol.includes("...") && !tokenListMap.has(c.address.toLowerCase()),
  );

  const onchainMeta = new Map<string, { name: string; symbol: string; decimals: number }>();
  if (onchainNeeded.length > 0) {
    const contracts = onchainNeeded.flatMap((c) => [
      { address: c.address as Address, abi: erc20Abi, functionName: "name" as const },
      { address: c.address as Address, abi: erc20Abi, functionName: "symbol" as const },
      { address: c.address as Address, abi: erc20Abi, functionName: "decimals" as const },
    ]);

    try {
      const results = await client.multicall({
        contracts,
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
      });
      for (let j = 0; j < onchainNeeded.length; j++) {
        const addr = onchainNeeded[j].address.toLowerCase();
        const nameRes = results[j * 3];
        const symRes = results[j * 3 + 1];
        const decRes = results[j * 3 + 2];

        onchainMeta.set(addr, {
          name: nameRes?.status === "success" && typeof nameRes.result === "string" ? nameRes.result : "",
          symbol: symRes?.status === "success" && typeof symRes.result === "string" ? symRes.result : onchainNeeded[j].symbol,
          decimals: decRes?.status === "success" && typeof decRes.result === "number" ? decRes.result : onchainNeeded[j].decimals,
        });
      }
    } catch {
      // Still failing, keep existing values
    }
  }

  // 3. Retry prices for tokens missing USD value
  const priceNeeded = needsRetry.filter((c) => c.valueUsd === null);
  const priceMap = new Map<string, number>();
  if (priceNeeded.length > 0) {
    const prices = await Promise.all(
      priceNeeded.map((c) => fetchTokenPrice(chainId, c.address).catch(() => 0)),
    );
    priceNeeded.forEach((c, i) => {
      if (prices[i] > 0) priceMap.set(c.address.toLowerCase(), prices[i]);
    });

    // 3b. Fallback to portfolio holdings prices
    const stillMissing = priceNeeded.filter((c) => !priceMap.has(c.address.toLowerCase()));
    if (stillMissing.length > 0) {
      const portfolioPrices = await getPortfolioPriceMap(accountAddress);
      for (const c of stillMissing) {
        const key = `${chainId}:${c.address.toLowerCase()}`;
        const fallback = portfolioPrices.get(key);
        if (fallback) priceMap.set(c.address.toLowerCase(), fallback);
      }
    }
  }

  // 4. Merge updates into existing token changes
  const updated = tokenChanges.map((c) => {
    const addr = c.address.toLowerCase();
    const listEntry = tokenListMap.get(addr);
    const onchain = onchainMeta.get(addr);
    const newPrice = priceMap.get(addr);

    if (!listEntry && !onchain && newPrice === undefined) return c;

    const newSymbol = listEntry?.symbol ?? onchain?.symbol ?? c.symbol;
    const newName = listEntry?.name ?? onchain?.name ?? c.name;
    const newDecimals = listEntry?.decimals ?? onchain?.decimals ?? c.decimals;
    const newLogoUrl = listEntry?.logoURI || KNOWN_TOKEN_LOGOS[addr] || c.logoUrl;

    // Recompute formatted amount if decimals changed
    let formattedAmount = c.formattedAmount;
    let valueUsd = c.valueUsd;
    if (newDecimals !== c.decimals) {
      const delta = BigInt(c.rawDelta);
      const abs = delta < 0n ? -delta : delta;
      const amount = parseFloat(formatUnits(abs, newDecimals));
      formattedAmount = formatAmount(amount);
      const price = newPrice ?? (c.valueUsd !== null && parseFloat(c.formattedAmount) > 0
        ? c.valueUsd / parseFloat(c.formattedAmount)
        : undefined);
      valueUsd = price ? amount * price : null;
    } else if (newPrice !== undefined) {
      const delta = BigInt(c.rawDelta);
      const abs = delta < 0n ? -delta : delta;
      const amount = parseFloat(formatUnits(abs, newDecimals));
      valueUsd = amount * newPrice;
    }

    return {
      ...c,
      symbol: newSymbol,
      name: newName,
      decimals: newDecimals,
      logoUrl: newLogoUrl,
      formattedAmount,
      valueUsd,
    };
  });

  return { tokenChanges: updated };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a numeric amount to a human-readable string */
function formatAmount(value: number): string {
  if (value === 0) return "0";
  if (value >= 1_000_000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  if (value < 0.000001) return "<0.000001";
  // Show up to 6 significant digits for small values
  return parseFloat(value.toPrecision(6)).toString();
}

// ---------------------------------------------------------------------------
// Batch simulation — executes all calls sequentially in a single eth_call
// ---------------------------------------------------------------------------
// Uses the simulateBatch() function in TxSimulator.sol which runs all calls
// within one EVM execution context, so state changes (e.g. approve) persist
// for subsequent calls (e.g. swap). The simulator is deployed at the wallet
// address via state override, preserving msg.sender == wallet for all calls.

export async function simulateBatchAssetChanges(
  calls: { to?: string; data?: string; value?: string }[],
  fromAddress: string,
  chainId: number,
): Promise<SimulationResult> {
  const EMPTY: SimulationResult = {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    simulationFailed: false,
    metadataComplete: true,
  };

  const validCalls = calls.filter((c) => c.to);
  if (validCalls.length === 0) return EMPTY;

  console.log(`[batchSim] Starting batch simulation: ${validCalls.length} calls, from=${fromAddress}, chainId=${chainId}`);
  for (let i = 0; i < validCalls.length; i++) {
    console.log(`[batchSim] Call ${i}: to=${validCalls[i].to}, value=${validCalls[i].value}, data=${validCalls[i].data?.slice(0, 10)}...`);
  }

  const client = await getClient(chainId);
  if (!client) {
    console.log("[batchSim] FAILED: No RPC URL for chainId", chainId);
    return { ...EMPTY, simulationFailed: true, simulationError: "No RPC URL" };
  }

  const from = fromAddress as Address;

  try {
    // Step 1: Get access lists for all calls in parallel → merge candidates
    console.log("[batchSim] Step 1: Getting access lists...");
    const accessLists = await Promise.all(
      validCalls.map((call, i) =>
        client.createAccessList({
          account: from,
          to: call.to as Address,
          value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
          data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
        }).then((res) => {
          console.log(`[batchSim] AccessList call ${i}: ${res.accessList.length} entries`);
          return res;
        }).catch((err) => {
          console.log(`[batchSim] AccessList call ${i} FAILED:`, err.shortMessage || err.message);
          return { accessList: [] as { address: string }[] };
        }),
      ),
    );

    const seen = new Set<string>();
    seen.add(from.toLowerCase()); // exclude user's own address
    const candidates: Address[] = [];

    for (let i = 0; i < accessLists.length; i++) {
      for (const entry of accessLists[i].accessList) {
        const addr = entry.address.toLowerCase();
        if (!seen.has(addr)) {
          seen.add(addr);
          candidates.push(entry.address as Address);
        }
      }
      // Also include each call's `to` address
      const to = validCalls[i].to!.toLowerCase();
      if (!seen.has(to)) {
        seen.add(to);
        candidates.push(validCalls[i].to as Address);
      }
    }
    console.log(`[batchSim] Merged ${candidates.length} candidate addresses`);

    // Step 2: Encode simulateBatch(calls, candidates) and run single eth_call
    console.log("[batchSim] Step 2: Encoding simulateBatch and calling...");
    const batchCallsTuples = validCalls.map((call) => ({
      to: (call.to || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
      data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
    }));

    const callData = encodeFunctionData({
      abi: BATCH_SIMULATOR_ABI,
      functionName: "simulateBatch",
      args: [batchCallsTuples, candidates],
    });
    console.log(`[batchSim] Encoded calldata length: ${callData.length} chars`);

    const result = await client.call({
      to: from,
      data: callData,
      stateOverride: [
        {
          address: from,
          code: SIMULATOR_BYTECODE,
          balance: parseEther("100000"),
        },
      ],
    });

    console.log(`[batchSim] eth_call returned data: ${result.data ? result.data.length + " chars" : "null"}`);

    if (!result.data) {
      console.log("[batchSim] FAILED: Empty response from eth_call");
      return { ...EMPTY, simulationFailed: true, simulationError: "Empty response" };
    }

    // Step 3: Decode return values (same shape as simulate())
    const [txSuccess, ethDelta, tokens, deltas] = decodeFunctionResult({
      abi: BATCH_SIMULATOR_ABI,
      functionName: "simulateBatch",
      data: result.data,
    });

    console.log("[batchSim] Step 3: Decoded result:", {
      txSuccess,
      ethDelta: ethDelta.toString(),
      tokens: (tokens as Address[]).map((t) => t),
      deltas: (deltas as bigint[]).map((d) => d.toString()),
    });

    // Step 4: Enrich token metadata + prices (reuse existing function)
    console.log("[batchSim] Step 4: Enriching token metadata...");
    const { changes: tokenChanges, metadataComplete } = await enrichTokenChanges(
      client,
      chainId,
      tokens as Address[],
      deltas as bigint[],
      fromAddress,
    );
    console.log(`[batchSim] Enriched: ${tokenChanges.length} token changes, metadataComplete=${metadataComplete}`);

    // Build native change
    const native = getNativeCurrency(chainId);
    let nativeChange: AssetChange | null = null;
    if (ethDelta !== 0n) {
      const abs = ethDelta < 0n ? -ethDelta : ethDelta;
      const amount = parseFloat(formatUnits(abs, native.decimals));

      let nativePriceUsd: number | null = null;
      try {
        const { fetchNativePrice } = await import("./gasEstimation");
        nativePriceUsd = await fetchNativePrice(chainId);
      } catch {}
      if (nativePriceUsd === null) {
        const portfolioPrices = await getPortfolioPriceMap(fromAddress);
        const key = `${chainId}:native`;
        nativePriceUsd = portfolioPrices.get(key) ?? null;
      }

      nativeChange = {
        address: "native",
        symbol: native.symbol,
        name: native.name,
        decimals: native.decimals,
        logoUrl: native.icon,
        rawDelta: ethDelta.toString(),
        formattedAmount: formatAmount(amount),
        valueUsd: nativePriceUsd !== null ? amount * nativePriceUsd : null,
        direction: ethDelta > 0n ? "in" : "out",
      };
    }

    console.log("[batchSim] Final result:", {
      txSuccess,
      nativeChange: nativeChange ? `${nativeChange.direction} ${nativeChange.formattedAmount} ${nativeChange.symbol}` : null,
      tokenChanges: tokenChanges.map((tc) => `${tc.direction} ${tc.formattedAmount} ${tc.symbol} (${tc.address})`),
    });
    return { txSuccess, nativeChange, tokenChanges, simulationFailed: false, metadataComplete };
  } catch (err: any) {
    console.log("[batchSim] EXCEPTION:", err.shortMessage || err.message, err);
    return {
      ...EMPTY,
      simulationFailed: true,
      simulationError: err.shortMessage || err.message || "Batch simulation failed",
    };
  }
}
