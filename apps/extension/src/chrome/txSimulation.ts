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
  keccak256,
  encodeAbiParameters,
  toHex,
  type PublicClient,
  type Address,
} from "viem";
import { getRpcUrl } from "./txHandlers";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { WALLETCHAN_ICON_URL } from "@/constants/externalUrls";
import { getCachedTokenList, fetchTokenPrice } from "./swapApi";
import { fetchPortfolio, type PortfolioToken } from "./portfolioApi";

/** Multicall3 is deployed at the same address on all supported chains */
const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

/** Permit2 is deployed at the same address on all supported chains */
const PERMIT2_ADDRESS: Address =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3";

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

/** Runtime bytecode of TxSimulator.sol (not creation code).
 *  Includes ERC-1271 isValidSignature so Permit2 signature verification
 *  still works when the user's address has contract code (the simulator). */
const SIMULATOR_BYTECODE: `0x${string}` =
  "0x608060405260043610610037575f3560e01c80631626ba7e14610042578063410bc60a1461007e578063887628c8146100bd5761003e565b3661003e57005b5f80fd5b34801561004d575f80fd5b5061006860048036038101906100639190610bd6565b6100fc565b6040516100759190610c6d565b60405180910390f35b348015610089575f80fd5b506100a4600480360381019061009f9190610d30565b6101c5565b6040516100b49493929190610f7e565b60405180910390f35b3480156100c8575f80fd5b506100e360048036038101906100de919061102c565b61065b565b6040516100f39493929190610f7e565b60405180910390f35b5f604183839050036101b3575f805f853592506020860135915060408601355f1a90505f73ffffffffffffffffffffffffffffffffffffffff166001888386866040515f815260200160405260405161015894939291906110f9565b6020604051602081039080840390855afa158015610178573d5f803e3d5ffd5b5050506020604051035173ffffffffffffffffffffffffffffffffffffffff16146101af57631626ba7e60e01b93505050506101be565b5050505b63ffffffff60e01b90505b9392505050565b5f806060805f4790505f8787905090505f8167ffffffffffffffff8111156101f0576101ef61113c565b5b60405190808252806020026020018201604052801561021e5781602001602082028036833780820191505090505b5090505f5b828110156102855761025b8a8a8381811061024157610240611169565b5b90506020020160208101906102569190611196565b610a3e565b82828151811061026e5761026d611169565b5b602002602001018181525050806001019050610223565b50600196505f5b8b8b90508110156103a7575f8c8c838181106102ab576102aa611169565b5b90506020028101906102bd91906111cd565b5f0160208101906102ce9190611196565b73ffffffffffffffffffffffffffffffffffffffff168d8d848181106102f7576102f6611169565b5b905060200281019061030991906111cd565b602001358e8e858181106103205761031f611169565b5b905060200281019061033291906111cd565b806040019061034191906111f4565b60405161034f929190611292565b5f6040518083038185875af1925050503d805f8114610389576040519150601f19603f3d011682016040523d82523d5f602084013e61038e565b606091505b505090508061039b575f98505b5080600101905061028c565b5082476103b491906112d7565b95505f808367ffffffffffffffff8111156103d2576103d161113c565b5b6040519080825280602002602001820160405280156104005781602001602082028036833780820191505090505b5090505f5b848110156104bf575f61043e8d8d8481811061042457610423611169565b5b90506020020160208101906104399190611196565b610a3e565b905084828151811061045357610452611169565b5b60200260200101518161046691906112d7565b83838151811061047957610478611169565b5b6020026020010181815250505f83838151811061049957610498611169565b5b6020026020010151146104b357836104b090611317565b93505b50806001019050610405565b508167ffffffffffffffff8111156104da576104d961113c565b5b6040519080825280602002602001820160405280156105085781602001602082028036833780820191505090505b5096508167ffffffffffffffff8111156105255761052461113c565b5b6040519080825280602002602001820160405280156105535781602001602082028036833780820191505090505b5095505f805b85811015610649575f83828151811061057557610574611169565b5b60200260200101511461063e578c8c8281811061059557610594611169565b5b90506020020160208101906105aa9190611196565b8983815181106105bd576105bc611169565b5b602002602001019073ffffffffffffffffffffffffffffffffffffffff16908173ffffffffffffffffffffffffffffffffffffffff168152505082818151811061060a57610609611169565b5b602002602001015188838151811061062557610624611169565b5b6020026020010181815250508161063b90611317565b91505b806001019050610559565b50505050505050945094509450949050565b5f806060805f4790505f8787905090505f8167ffffffffffffffff8111156106865761068561113c565b5b6040519080825280602002602001820160405280156106b45781602001602082028036833780820191505090505b5090505f5b8281101561071b576106f18a8a838181106106d7576106d6611169565b5b90506020020160208101906106ec9190611196565b610a3e565b82828151811061070457610703611169565b5b6020026020010181815250508060010190506106b9565b508c73ffffffffffffffffffffffffffffffffffffffff168c8c8c604051610744929190611292565b5f6040518083038185875af1925050503d805f811461077e576040519150601f19603f3d011682016040523d82523d5f602084013e610783565b606091505b505080975050824761079591906112d7565b95505f808367ffffffffffffffff8111156107b3576107b261113c565b5b6040519080825280602002602001820160405280156107e15781602001602082028036833780820191505090505b5090505f5b848110156108a0575f61081f8d8d8481811061080557610804611169565b5b905060200201602081019061081a9190611196565b610a3e565b905084828151811061083457610833611169565b5b60200260200101518161084791906112d7565b83838151811061085a57610859611169565b5b6020026020010181815250505f83838151811061087a57610879611169565b5b602002602001015114610894578361089190611317565b93505b508060010190506107e6565b508167ffffffffffffffff8111156108bb576108ba61113c565b5b6040519080825280602002602001820160405280156108e95781602001602082028036833780820191505090505b5096508167ffffffffffffffff8111156109065761090561113c565b5b6040519080825280602002602001820160405280156109345781602001602082028036833780820191505090505b5095505f805b85811015610a2a575f83828151811061095657610955611169565b5b602002602001015114610a1f578c8c8281811061097657610975611169565b5b905060200201602081019061098b9190611196565b89838151811061099e5761099d611169565b5b602002602001019073ffffffffffffffffffffffffffffffffffffffff16908173ffffffffffffffffffffffffffffffffffffffff16815250508281815181106109eb576109ea611169565b5b6020026020010151888381518110610a0657610a05611169565b5b60200260200101818152505081610a1c90611317565b91505b80600101905061093a565b505050505050509650965096509692505050565b5f805f8373ffffffffffffffffffffffffffffffffffffffff166370a0823130604051602401610a6e919061136d565b6040516020818303038152906040529060e01b6020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff8381831617835250505050604051610abc91906113ce565b5f60405180830381855afa9150503d805f8114610af4576040519150601f19603f3d011682016040523d82523d5f602084013e610af9565b606091505b5091509150818015610b0d57506020815110155b15610b2f5780806020019051810190610b2691906113f8565b92505050610b35565b5f925050505b919050565b5f80fd5b5f80fd5b5f819050919050565b610b5481610b42565b8114610b5e575f80fd5b50565b5f81359050610b6f81610b4b565b92915050565b5f80fd5b5f80fd5b5f80fd5b5f8083601f840112610b9657610b95610b75565b5b8235905067ffffffffffffffff811115610bb357610bb2610b79565b5b602083019150836001820283011115610bcf57610bce610b7d565b5b9250929050565b5f805f60408486031215610bed57610bec610b3a565b5b5f610bfa86828701610b61565b935050602084013567ffffffffffffffff811115610c1b57610c1a610b3e565b5b610c2786828701610b81565b92509250509250925092565b5f7fffffffff0000000000000000000000000000000000000000000000000000000082169050919050565b610c6781610c33565b82525050565b5f602082019050610c805f830184610c5e565b92915050565b5f8083601f840112610c9b57610c9a610b75565b5b8235905067ffffffffffffffff811115610cb857610cb7610b79565b5b602083019150836020820283011115610cd457610cd3610b7d565b5b9250929050565b5f8083601f840112610cf057610cef610b75565b5b8235905067ffffffffffffffff811115610d0d57610d0c610b79565b5b602083019150836020820283011115610d2957610d28610b7d565b5b9250929050565b5f805f8060408587031215610d4857610d47610b3a565b5b5f85013567ffffffffffffffff811115610d6557610d64610b3e565b5b610d7187828801610c86565b9450945050602085013567ffffffffffffffff811115610d9457610d93610b3e565b5b610da087828801610cdb565b925092505092959194509250565b5f8115159050919050565b610dc281610dae565b82525050565b5f819050919050565b610dda81610dc8565b82525050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610e3282610e09565b9050919050565b610e4281610e28565b82525050565b5f610e538383610e39565b60208301905092915050565b5f602082019050919050565b5f610e7582610de0565b610e7f8185610dea565b9350610e8a83610dfa565b805f5b83811015610eba578151610ea18882610e48565b9750610eac83610e5f565b925050600181019050610e8d565b5085935050505092915050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b610ef981610dc8565b82525050565b5f610f0a8383610ef0565b60208301905092915050565b5f602082019050919050565b5f610f2c82610ec7565b610f368185610ed1565b9350610f4183610ee1565b805f5b83811015610f71578151610f588882610eff565b9750610f6383610f16565b925050600181019050610f44565b5085935050505092915050565b5f608082019050610f915f830187610db9565b610f9e6020830186610dd1565b8181036040830152610fb08185610e6b565b90508181036060830152610fc48184610f22565b905095945050505050565b610fd881610e28565b8114610fe2575f80fd5b50565b5f81359050610ff381610fcf565b92915050565b5f819050919050565b61100b81610ff9565b8114611015575f80fd5b50565b5f8135905061102681611002565b92915050565b5f805f805f806080878903121561104657611045610b3a565b5b5f61105389828a01610fe5565b965050602061106489828a01611018565b955050604087013567ffffffffffffffff81111561108557611084610b3e565b5b61109189828a01610b81565b9450945050606087013567ffffffffffffffff8111156110b4576110b3610b3e565b5b6110c089828a01610cdb565b92509250509295509295509295565b6110d881610b42565b82525050565b5f60ff82169050919050565b6110f3816110de565b82525050565b5f60808201905061110c5f8301876110cf565b61111960208301866110ea565b61112660408301856110cf565b61113360608301846110cf565b95945050505050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b5f602082840312156111ab576111aa610b3a565b5b5f6111b884828501610fe5565b91505092915050565b5f80fd5b5f80fd5b5f80fd5b5f823560016060038336030381126111e8576111e76111c1565b5b80830191505092915050565b5f80833560016020038436030381126112105761120f6111c1565b5b80840192508235915067ffffffffffffffff821115611232576112316111c5565b5b60208301925060018202360383131561124e5761124d6111c9565b5b509250929050565b5f81905092915050565b828183375f83830152505050565b5f6112798385611256565b9350611286838584611260565b82840190509392505050565b5f61129e82848661126e565b91508190509392505050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f6112e182610dc8565b91506112ec83610dc8565b925082820390508181125f8412168282135f851215161715611311576113106112aa565b5b92915050565b5f61132182610ff9565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8203611353576113526112aa565b5b600182019050919050565b61136781610e28565b82525050565b5f6020820190506113805f83018461135e565b92915050565b5f81519050919050565b8281835e5f83830152505050565b5f6113a882611386565b6113b28185611256565b93506113c2818560208601611390565b80840191505092915050565b5f6113d9828461139e565b915081905092915050565b5f815190506113f281611002565b92915050565b5f6020828403121561140d5761140c610b3a565b5b5f61141a848285016113e4565b9150509291505056fea26469706673582212200a09646e7fd2c81195a90436e6cbc8d6d7e8b47303cd8d04dc60ec8ec876a73964736f6c634300081a0033";

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
    WALLETCHAN_ICON_URL,
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
// State overrides — grant balances + ERC-20 approvals + Permit2 allowances
// ---------------------------------------------------------------------------

type StateDiffEntry = { slot: `0x${string}`; value: `0x${string}` };
type StateOverride = { address: Address; stateDiff: StateDiffEntry[] };

/** Known EIP-1967 proxy slots to ignore when probing balance storage */
const PROXY_SLOTS = new Set([
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", // implementation
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103", // admin
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50", // beacon
]);

/**
 * Use eth_createAccessList on balanceOf(user) to discover the exact storage
 * slot where `token` stores the balance of `user`.
 */
async function findBalanceSlot(
  client: PublicClient,
  token: Address,
  user: Address,
): Promise<`0x${string}` | null> {
  try {
    const { accessList } = await client.createAccessList({
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user],
      }),
    });

    const tokenEntry = accessList.find(
      (e) => e.address.toLowerCase() === token.toLowerCase(),
    );
    if (!tokenEntry || tokenEntry.storageKeys.length === 0) return null;

    // Filter out known proxy slots — the remaining key(s) are the balance mapping
    const balanceSlots = tokenEntry.storageKeys.filter(
      (k: string) => !PROXY_SLOTS.has(k.toLowerCase()),
    );
    return (balanceSlots[0] as `0x${string}`) ?? null;
  } catch {
    return null;
  }
}

/**
 * Similarly, find the exact storage slot for `allowance[owner][spender]` in
 * an ERC-20 token by tracing an `allowance()` call.
 */
async function findAllowanceSlot(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<`0x${string}` | null> {
  try {
    const { accessList } = await client.createAccessList({
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      }),
    });

    const tokenEntry = accessList.find(
      (e) => e.address.toLowerCase() === token.toLowerCase(),
    );
    if (!tokenEntry || tokenEntry.storageKeys.length === 0) return null;

    const slots = tokenEntry.storageKeys.filter(
      (k: string) => !PROXY_SLOTS.has(k.toLowerCase()),
    );
    return (slots[0] as `0x${string}`) ?? null;
  } catch {
    return null;
  }
}

/**
 * Build complete state overrides for retry simulation:
 * 1. Token balance overrides (large balance for all candidates)
 * 2. ERC-20 approval overrides (approve Permit2 on all candidates)
 * 3. Permit2 allowance overrides (grant router access)
 *
 * Uses eth_createAccessList to discover exact storage slots — works for
 * any ERC-20 implementation (OZ, USDC proxy, custom, etc.).
 */
async function buildRetryOverrides(
  client: PublicClient,
  owner: Address,
  spender: Address,
  candidates: Address[],
): Promise<StateOverride[]> {
  const MAX_UINT256 = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as `0x${string}`;
  // Large but not max balance (avoids overflow issues in some token logic)
  const LARGE_BALANCE = toHex(10n ** 30n, { size: 32 });

  // Run all slot probes in parallel (balance + approval for each candidate)
  const [balanceSlots, allowanceSlots] = await Promise.all([
    Promise.all(candidates.map((token) => findBalanceSlot(client, token, owner))),
    Promise.all(candidates.map((token) => findAllowanceSlot(client, token, owner, PERMIT2_ADDRESS))),
  ]);

  console.log("[TxSim] Balance slots found:", balanceSlots.map((s, i) => `${candidates[i].slice(0, 8)}=${s ? "yes" : "no"}`).join(", "));
  console.log("[TxSim] Allowance slots found:", allowanceSlots.map((s, i) => `${candidates[i].slice(0, 8)}=${s ? "yes" : "no"}`).join(", "));

  // Merge all diffs per address
  const diffMap = new Map<string, StateDiffEntry[]>();
  const addressMap = new Map<string, Address>(); // lowercase → original

  function addDiff(address: Address, diff: StateDiffEntry) {
    const key = address.toLowerCase();
    addressMap.set(key, address);
    const arr = diffMap.get(key) ?? [];
    arr.push(diff);
    diffMap.set(key, arr);
  }

  // 1. Token balance overrides
  for (let i = 0; i < candidates.length; i++) {
    if (balanceSlots[i]) {
      addDiff(candidates[i], { slot: balanceSlots[i]!, value: LARGE_BALANCE });
    }
  }

  // 2. ERC-20 approval overrides (owner → Permit2)
  for (let i = 0; i < candidates.length; i++) {
    if (allowanceSlots[i]) {
      addDiff(candidates[i], { slot: allowanceSlots[i]!, value: MAX_UINT256 });
    }
  }

  // 3. Permit2 allowance overrides: allowance[owner][token][spender]
  // Permit2's allowance is a triple-nested mapping at slot 0.
  // CRITICAL: preserve the current nonce when overriding — Permit2's permit()
  // verifies the signed nonce matches storage, so changing it breaks signature checks.
  // Packed layout (256 bits): [nonce:48][expiration:48][amount:160]
  const permit2Slots: `0x${string}`[] = [];
  for (const token of candidates) {
    const ownerSlot = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, 0n]),
    );
    const tokenSlot = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [token, ownerSlot]),
    );
    const finalSlot = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [spender, tokenSlot]),
    );
    permit2Slots.push(finalSlot);
  }

  // Read current Permit2 slots in parallel to extract nonces
  const currentPermit2Values = await Promise.all(
    permit2Slots.map((slot) =>
      client.getStorageAt({ address: PERMIT2_ADDRESS, slot }).catch(() => "0x0" as `0x${string}`),
    ),
  );

  for (let i = 0; i < candidates.length; i++) {
    const currentValue = BigInt(currentPermit2Values[i] || "0x0");
    // Extract current nonce from top 48 bits
    const currentNonce = (currentValue >> 208n) & BigInt("0xffffffffffff");
    // Pack: [currentNonce:48][maxExpiration:48][maxAmount:160]
    const overrideValue = toHex(
      (currentNonce << 208n) |
      (BigInt("0xffffffffffff") << 160n) |
      BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"),
      { size: 32 },
    );
    addDiff(PERMIT2_ADDRESS, { slot: permit2Slots[i], value: overrideValue });
  }

  // Build final override array
  const overrides: StateOverride[] = [];
  for (const [key, diffs] of diffMap) {
    if (diffs.length > 0) {
      overrides.push({ address: addressMap.get(key)!, stateDiff: diffs });
    }
  }

  return overrides;
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
  console.log("[TxSim] simulateAssetChanges called", {
    from: tx.from,
    to: tx.to,
    data: tx.data?.slice(0, 10),
    value: tx.value,
    chainId: tx.chainId,
    accountAddress,
  });

  const EMPTY: SimulationResult = {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    simulationFailed: false,
    metadataComplete: true,
  };

  // Skip contract deployments (no `to` address)
  if (!tx.to) {
    console.log("[TxSim] Skipping: no 'to' address (contract deployment)");
    return EMPTY;
  }

  const client = await getClient(tx.chainId);
  if (!client) {
    console.log("[TxSim] Failed: no RPC URL for chainId", tx.chainId);
    return { ...EMPTY, simulationFailed: true, simulationError: "No RPC URL" };
  }

  const from = accountAddress as Address;
  const to = tx.to as Address;
  const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;
  const data = (tx.data && tx.data !== "0x" ? tx.data : "0x") as `0x${string}`;

  try {
    // Step 1: Get access list to discover touched contracts
    console.log("[TxSim] Step 1: Creating access list...");
    const { accessList } = await client.createAccessList({
      account: from,
      to,
      value,
      data,
    });
    console.log("[TxSim] Access list entries:", accessList.length, accessList.map(e => e.address));

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
    console.log("[TxSim] Candidate tokens:", candidates.length, candidates);

    // Step 2: Simulate via eth_call with state override
    const simResult = await runSimulation(client, from, to, value, data, candidates, []);

    // Step 2b: If inner tx reverted, retry with balance + approval + Permit2 overrides.
    // Common reasons: user lacks on-chain token balance (impersonator account),
    // missing ERC-20 approval to Permit2, or missing Permit2 allowance to router.
    if (!simResult.txSuccess && simResult.tokens.length === 0) {
      console.log("[TxSim] Inner tx reverted with no changes — retrying with balance + approval overrides...");
      const retryOverrides = await buildRetryOverrides(client, from, to, candidates);
      console.log("[TxSim] Built retry overrides:", retryOverrides.length, "addresses");
      const retryResult = await runSimulation(client, from, to, value, data, candidates, retryOverrides);
      if (retryResult.tokens.length > 0 || retryResult.ethDelta !== 0n) {
        console.log("[TxSim] Retry succeeded! tokens:", retryResult.tokens.length, "ethDelta:", retryResult.ethDelta.toString());
        return await buildSimulationResult(client, tx.chainId, accountAddress, retryResult, EMPTY);
      }
      console.log("[TxSim] Retry also produced no changes");
    }

    return await buildSimulationResult(client, tx.chainId, accountAddress, simResult, EMPTY);
  } catch (err: any) {
    console.error("[TxSim] Simulation error:", err.shortMessage || err.message || err);
    return {
      ...EMPTY,
      metadataComplete: true,
      simulationFailed: true,
      simulationError: err.shortMessage || err.message || "Simulation failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Simulation core — runs the eth_call with state overrides and decodes result
// ---------------------------------------------------------------------------

interface RawSimResult {
  txSuccess: boolean;
  ethDelta: bigint;
  tokens: Address[];
  deltas: bigint[];
}

async function runSimulation(
  client: PublicClient,
  from: Address,
  to: Address,
  value: bigint,
  data: `0x${string}`,
  candidates: Address[],
  extraOverrides: { address: Address; stateDiff: { slot: `0x${string}`; value: `0x${string}` }[] }[],
): Promise<RawSimResult> {
  const callData = encodeFunctionData({
    abi: SIMULATOR_ABI,
    functionName: "simulate",
    args: [to, value, data, candidates],
  });

  const label = extraOverrides.length > 0 ? "[TxSim retry]" : "[TxSim]";
  console.log(`${label} Running eth_call simulation (extraOverrides: ${extraOverrides.length})...`);

  const result = await client.call({
    account: from,
    to: from,
    data: callData,
    stateOverride: [
      {
        address: from,
        code: SIMULATOR_BYTECODE,
        balance: parseEther("100000"),
      },
      ...extraOverrides,
    ],
  });

  if (!result.data) {
    console.log(`${label} Empty response from eth_call`);
    return { txSuccess: false, ethDelta: 0n, tokens: [], deltas: [] };
  }
  console.log(`${label} eth_call response length:`, result.data.length);

  const [txSuccess, ethDelta, tokens, deltas] = decodeFunctionResult({
    abi: SIMULATOR_ABI,
    functionName: "simulate",
    data: result.data,
  });
  console.log(`${label} Decoded:`, {
    txSuccess,
    ethDelta: ethDelta.toString(),
    tokensCount: (tokens as Address[]).length,
    tokens,
    deltas: (deltas as bigint[]).map(d => d.toString()),
  });

  return {
    txSuccess: txSuccess as boolean,
    ethDelta: ethDelta as bigint,
    tokens: tokens as Address[],
    deltas: deltas as bigint[],
  };
}

async function buildSimulationResult(
  client: PublicClient,
  chainId: number,
  accountAddress: string,
  raw: RawSimResult,
  empty: SimulationResult,
): Promise<SimulationResult> {
  const { changes: tokenChanges, metadataComplete } = await enrichTokenChanges(
    client,
    chainId,
    raw.tokens,
    raw.deltas,
    accountAddress,
  );
  console.log("[TxSim] Token changes:", tokenChanges.length, tokenChanges.map(c => ({ symbol: c.symbol, amount: c.formattedAmount, direction: c.direction })));

  const native = getNativeCurrency(chainId);
  let nativeChange: AssetChange | null = null;
  if (raw.ethDelta !== 0n) {
    const abs = raw.ethDelta < 0n ? -raw.ethDelta : raw.ethDelta;
    const amount = parseFloat(formatUnits(abs, native.decimals));

    let nativePriceUsd: number | null = null;
    try {
      const { fetchNativePrice } = await import("./gasEstimation");
      nativePriceUsd = await fetchNativePrice(chainId);
    } catch {}
    if (nativePriceUsd === null) {
      const portfolioPrices = await getPortfolioPriceMap(accountAddress);
      nativePriceUsd = portfolioPrices.get(`${chainId}:native`) ?? null;
    }

    nativeChange = {
      address: "native",
      symbol: native.symbol,
      name: native.name,
      decimals: native.decimals,
      logoUrl: native.icon,
      rawDelta: raw.ethDelta.toString(),
      formattedAmount: formatAmount(amount),
      valueUsd: nativePriceUsd !== null ? amount * nativePriceUsd : null,
      direction: raw.ethDelta > 0n ? "in" : "out",
    };
  }

  const finalResult: SimulationResult = {
    txSuccess: raw.txSuccess,
    nativeChange,
    tokenChanges,
    simulationFailed: false,
    metadataComplete,
  };
  console.log("[TxSim] Final result:", {
    txSuccess: raw.txSuccess,
    nativeChange: nativeChange ? { symbol: nativeChange.symbol, amount: nativeChange.formattedAmount, direction: nativeChange.direction } : null,
    tokenChangesCount: tokenChanges.length,
    metadataComplete,
  });
  return finalResult;
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
      account: from, // sets tx.origin = from (critical for Permit2 / protocol checks)
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
