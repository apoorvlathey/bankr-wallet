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
  "0x608060405260043610610021575f3560e01c8063887628c81461002c57610028565b3661002857005b5f80fd5b348015610037575f80fd5b50610052600480360381019061004d9190610695565b61006b565b60405161006294939291906108d8565b60405180910390f35b5f806060805f4790505f8787905090505f8167ffffffffffffffff81111561009657610095610929565b5b6040519080825280602002602001820160405280156100c45781602001602082028036833780820191505090505b5090505f5b8281101561012b576101018a8a838181106100e7576100e6610956565b5b90506020020160208101906100fc9190610983565b61044e565b82828151811061011457610113610956565b5b6020026020010181815250508060010190506100c9565b508c73ffffffffffffffffffffffffffffffffffffffff168c8c8c6040516101549291906109ea565b5f6040518083038185875af1925050503d805f811461018e576040519150601f19603f3d011682016040523d82523d5f602084013e610193565b606091505b50508097505082476101a59190610a2f565b95505f808367ffffffffffffffff8111156101c3576101c2610929565b5b6040519080825280602002602001820160405280156101f15781602001602082028036833780820191505090505b5090505f5b848110156102b0575f61022f8d8d8481811061021557610214610956565b5b905060200201602081019061022a9190610983565b61044e565b905084828151811061024457610243610956565b5b6020026020010151816102579190610a2f565b83838151811061026a57610269610956565b5b6020026020010181815250505f83838151811061028a57610289610956565b5b6020026020010151146102a457836102a190610a6f565b93505b508060010190506101f6565b508167ffffffffffffffff8111156102cb576102ca610929565b5b6040519080825280602002602001820160405280156102f95781602001602082028036833780820191505090505b5096508167ffffffffffffffff81111561031657610315610929565b5b6040519080825280602002602001820160405280156103445781602001602082028036833780820191505090505b5095505f805b8581101561043a575f83828151811061036657610365610956565b5b60200260200101511461042f578c8c8281811061038657610385610956565b5b905060200201602081019061039b9190610983565b8983815181106103ae576103ad610956565b5b602002602001019073ffffffffffffffffffffffffffffffffffffffff16908173ffffffffffffffffffffffffffffffffffffffff16815250508281815181106103fb576103fa610956565b5b602002602001015188838151811061041657610415610956565b5b6020026020010181815250508161042c90610a6f565b91505b80600101905061034a565b505050505050509650965096509692505050565b5f805f8373ffffffffffffffffffffffffffffffffffffffff166370a082313060405160240161047e9190610ac5565b6040516020818303038152906040529060e01b6020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516104cc9190610b26565b5f60405180830381855afa9150503d805f8114610504576040519150601f19603f3d011682016040523d82523d5f602084013e610509565b606091505b509150915081801561051d57506020815110155b1561053f57808060200190518101906105369190610b50565b92505050610545565b5f925050505b919050565b5f80fd5b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61057b82610552565b9050919050565b61058b81610571565b8114610595575f80fd5b50565b5f813590506105a681610582565b92915050565b5f819050919050565b6105be816105ac565b81146105c8575f80fd5b50565b5f813590506105d9816105b5565b92915050565b5f80fd5b5f80fd5b5f80fd5b5f8083601f840112610600576105ff6105df565b5b8235905067ffffffffffffffff81111561061d5761061c6105e3565b5b602083019150836001820283011115610639576106386105e7565b5b9250929050565b5f8083601f840112610655576106546105df565b5b8235905067ffffffffffffffff811115610672576106716105e3565b5b60208301915083602082028301111561068e5761068d6105e7565b5b9250929050565b5f805f805f80608087890312156106af576106ae61054a565b5b5f6106bc89828a01610598565b96505060206106cd89828a016105cb565b955050604087013567ffffffffffffffff8111156106ee576106ed61054e565b5b6106fa89828a016105eb565b9450945050606087013567ffffffffffffffff81111561071d5761071c61054e565b5b61072989828a01610640565b92509250509295509295509295565b5f8115159050919050565b61074c81610738565b82525050565b5f819050919050565b61076481610752565b82525050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b61079c81610571565b82525050565b5f6107ad8383610793565b60208301905092915050565b5f602082019050919050565b5f6107cf8261076a565b6107d98185610774565b93506107e483610784565b805f5b838110156108145781516107fb88826107a2565b9750610806836107b9565b9250506001810190506107e7565b5085935050505092915050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b61085381610752565b82525050565b5f610864838361084a565b60208301905092915050565b5f602082019050919050565b5f61088682610821565b610890818561082b565b935061089b8361083b565b805f5b838110156108cb5781516108b28882610859565b97506108bd83610870565b92505060018101905061089e565b5085935050505092915050565b5f6080820190506108eb5f830187610743565b6108f8602083018661075b565b818103604083015261090a81856107c5565b9050818103606083015261091e818461087c565b905095945050505050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b5f602082840312156109985761099761054a565b5b5f6109a584828501610598565b91505092915050565b5f81905092915050565b828183375f83830152505050565b5f6109d183856109ae565b93506109de8385846109b8565b82840190509392505050565b5f6109f68284866109c6565b91508190509392505050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f610a3982610752565b9150610a4483610752565b925082820390508181125f8412168282135f851215161715610a6957610a68610a02565b5b92915050565b5f610a79826105ac565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8203610aab57610aaa610a02565b5b600182019050919050565b610abf81610571565b82525050565b5f602082019050610ad85f830184610ab6565b92915050565b5f81519050919050565b8281835e5f83830152505050565b5f610b0082610ade565b610b0a81856109ae565b9350610b1a818560208601610ae8565b80840191505092915050565b5f610b318284610af6565b915081905092915050565b5f81519050610b4a816105b5565b92915050565b5f60208284031215610b6557610b6461054a565b5b5f610b7284828501610b3c565b9150509291505056fea264697066735822122032f3007a5d4e5f238435f71c5d2d87ff7a98d619050b282bf42e8e6cbe5f5c4c64736f6c634300081a0033";

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
    icon: c.icon, // chain icon doubles as native token icon
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
const KNOWN_TOKEN_LOGOS: Record<string, string> = {
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
