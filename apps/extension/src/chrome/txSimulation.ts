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
import { getStoredResolvedChainById } from "@/lib/chains";

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
 *  still works when the user's address has contract code (the simulator).
 *  Exported so batchGasEstimation.ts can reuse the same bytecode for
 *  per-call gas measurement via simulateBatchGas(). */
export const SIMULATOR_BYTECODE: `0x${string}` =
  "0x608060405260043610610042575f3560e01c80631626ba7e1461004d57806332e923a114610089578063410bc60a146100c6578063887628c81461010557610049565b3661004957005b5f80fd5b348015610058575f80fd5b50610073600480360381019061006e9190610f13565b610144565b6040516100809190610faa565b60405180910390f35b348015610094575f80fd5b506100af60048036038101906100aa9190611018565b61020d565b6040516100bd92919061113d565b60405180910390f35b3480156100d1575f80fd5b506100ec60048036038101906100e791906111c0565b610451565b6040516100fc94939291906113f4565b60405180910390f35b348015610110575f80fd5b5061012b60048036038101906101269190611499565b6108e7565b60405161013b94939291906113f4565b60405180910390f35b5f604183839050036101fb575f805f853592506020860135915060408601355f1a90505f73ffffffffffffffffffffffffffffffffffffffff166001888386866040515f81526020016040526040516101a09493929190611566565b6020604051602081039080840390855afa1580156101c0573d5f803e3d5ffd5b5050506020604051035173ffffffffffffffffffffffffffffffffffffffff16146101f757631626ba7e60e01b9350505050610206565b5050505b63ffffffff60e01b90505b9392505050565b5f60608383905067ffffffffffffffff81111561022d5761022c6115a9565b5b60405190808252806020026020018201604052801561025b5781602001602082028036833780820191505090505b509050600191505f5b84849050811015610449575f5a90505f868684818110610287576102866115d6565b5b9050602002810190610299919061160f565b5f0160208101906102aa9190611636565b73ffffffffffffffffffffffffffffffffffffffff168787858181106102d3576102d26115d6565b5b90506020028101906102e5919061160f565b602001358888868181106102fc576102fb6115d6565b5b905060200281019061030e919061160f565b806040019061031d9190611661565b60405161032b9291906116ff565b5f6040518083038185875af1925050503d805f8114610365576040519150601f19603f3d011682016040523d82523d5f602084013e61036a565b606091505b505090505f5a8361037b9190611744565b90506103fb888886818110610393576103926115d6565b5b90506020028101906103a5919061160f565b80604001906103b49190611661565b8080601f0160208091040260200160405190810160405280939291908181526020018383808284375f81840152601f19601f82011690508083019250505050505050610cca565b615208826104099190611777565b6104139190611777565b858581518110610426576104256115d6565b5b6020026020010181815250508161043b575f95505b505050806001019050610264565b509250929050565b5f806060805f4790505f8787905090505f8167ffffffffffffffff81111561047c5761047b6115a9565b5b6040519080825280602002602001820160405280156104aa5781602001602082028036833780820191505090505b5090505f5b82811015610511576104e78a8a838181106104cd576104cc6115d6565b5b90506020020160208101906104e29190611636565b610d7b565b8282815181106104fa576104f96115d6565b5b6020026020010181815250508060010190506104af565b50600196505f5b8b8b9050811015610633575f8c8c83818110610537576105366115d6565b5b9050602002810190610549919061160f565b5f01602081019061055a9190611636565b73ffffffffffffffffffffffffffffffffffffffff168d8d84818110610583576105826115d6565b5b9050602002810190610595919061160f565b602001358e8e858181106105ac576105ab6115d6565b5b90506020028101906105be919061160f565b80604001906105cd9190611661565b6040516105db9291906116ff565b5f6040518083038185875af1925050503d805f8114610615576040519150601f19603f3d011682016040523d82523d5f602084013e61061a565b606091505b5050905080610627575f98505b50806001019050610518565b50824761064091906117aa565b95505f808367ffffffffffffffff81111561065e5761065d6115a9565b5b60405190808252806020026020018201604052801561068c5781602001602082028036833780820191505090505b5090505f5b8481101561074b575f6106ca8d8d848181106106b0576106af6115d6565b5b90506020020160208101906106c59190611636565b610d7b565b90508482815181106106df576106de6115d6565b5b6020026020010151816106f291906117aa565b838381518110610705576107046115d6565b5b6020026020010181815250505f838381518110610725576107246115d6565b5b60200260200101511461073f578361073c906117ea565b93505b50806001019050610691565b508167ffffffffffffffff811115610766576107656115a9565b5b6040519080825280602002602001820160405280156107945781602001602082028036833780820191505090505b5096508167ffffffffffffffff8111156107b1576107b06115a9565b5b6040519080825280602002602001820160405280156107df5781602001602082028036833780820191505090505b5095505f805b858110156108d5575f838281518110610801576108006115d6565b5b6020026020010151146108ca578c8c82818110610821576108206115d6565b5b90506020020160208101906108369190611636565b898381518110610849576108486115d6565b5b602002602001019073ffffffffffffffffffffffffffffffffffffffff16908173ffffffffffffffffffffffffffffffffffffffff1681525050828181518110610896576108956115d6565b5b60200260200101518883815181106108b1576108b06115d6565b5b602002602001018181525050816108c7906117ea565b91505b8060010190506107e5565b50505050505050945094509450949050565b5f806060805f4790505f8787905090505f8167ffffffffffffffff811115610912576109116115a9565b5b6040519080825280602002602001820160405280156109405781602001602082028036833780820191505090505b5090505f5b828110156109a75761097d8a8a83818110610963576109626115d6565b5b90506020020160208101906109789190611636565b610d7b565b8282815181106109905761098f6115d6565b5b602002602001018181525050806001019050610945565b508c73ffffffffffffffffffffffffffffffffffffffff168c8c8c6040516109d09291906116ff565b5f6040518083038185875af1925050503d805f8114610a0a576040519150601f19603f3d011682016040523d82523d5f602084013e610a0f565b606091505b5050809750508247610a2191906117aa565b95505f808367ffffffffffffffff811115610a3f57610a3e6115a9565b5b604051908082528060200260200182016040528015610a6d5781602001602082028036833780820191505090505b5090505f5b84811015610b2c575f610aab8d8d84818110610a9157610a906115d6565b5b9050602002016020810190610aa69190611636565b610d7b565b9050848281518110610ac057610abf6115d6565b5b602002602001015181610ad391906117aa565b838381518110610ae657610ae56115d6565b5b6020026020010181815250505f838381518110610b0657610b056115d6565b5b602002602001015114610b205783610b1d906117ea565b93505b50806001019050610a72565b508167ffffffffffffffff811115610b4757610b466115a9565b5b604051908082528060200260200182016040528015610b755781602001602082028036833780820191505090505b5096508167ffffffffffffffff811115610b9257610b916115a9565b5b604051908082528060200260200182016040528015610bc05781602001602082028036833780820191505090505b5095505f805b85811015610cb6575f838281518110610be257610be16115d6565b5b602002602001015114610cab578c8c82818110610c0257610c016115d6565b5b9050602002016020810190610c179190611636565b898381518110610c2a57610c296115d6565b5b602002602001019073ffffffffffffffffffffffffffffffffffffffff16908173ffffffffffffffffffffffffffffffffffffffff1681525050828181518110610c7757610c766115d6565b5b6020026020010151888381518110610c9257610c916115d6565b5b60200260200101818152505081610ca8906117ea565b91505b806001019050610bc6565b505050505050509650965096509692505050565b5f80825190505f5b81811015610d74575f60f81b7effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916848281518110610d1357610d126115d6565b5b602001015160f81c60f81b7effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff191603610d5957600483610d529190611777565b9250610d69565b601083610d669190611777565b92505b806001019050610cd2565b5050919050565b5f805f8373ffffffffffffffffffffffffffffffffffffffff166370a0823130604051602401610dab9190611840565b6040516020818303038152906040529060e01b6020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff8381831617835250505050604051610df991906118a1565b5f60405180830381855afa9150503d805f8114610e31576040519150601f19603f3d011682016040523d82523d5f602084013e610e36565b606091505b5091509150818015610e4a57506020815110155b15610e6c5780806020019051810190610e6391906118cb565b92505050610e72565b5f925050505b919050565b5f80fd5b5f80fd5b5f819050919050565b610e9181610e7f565b8114610e9b575f80fd5b50565b5f81359050610eac81610e88565b92915050565b5f80fd5b5f80fd5b5f80fd5b5f8083601f840112610ed357610ed2610eb2565b5b8235905067ffffffffffffffff811115610ef057610eef610eb6565b5b602083019150836001820283011115610f0c57610f0b610eba565b5b9250929050565b5f805f60408486031215610f2a57610f29610e77565b5b5f610f3786828701610e9e565b935050602084013567ffffffffffffffff811115610f5857610f57610e7b565b5b610f6486828701610ebe565b92509250509250925092565b5f7fffffffff0000000000000000000000000000000000000000000000000000000082169050919050565b610fa481610f70565b82525050565b5f602082019050610fbd5f830184610f9b565b92915050565b5f8083601f840112610fd857610fd7610eb2565b5b8235905067ffffffffffffffff811115610ff557610ff4610eb6565b5b60208301915083602082028301111561101157611010610eba565b5b9250929050565b5f806020838503121561102e5761102d610e77565b5b5f83013567ffffffffffffffff81111561104b5761104a610e7b565b5b61105785828601610fc3565b92509250509250929050565b5f8115159050919050565b61107781611063565b82525050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b5f819050919050565b6110b8816110a6565b82525050565b5f6110c983836110af565b60208301905092915050565b5f602082019050919050565b5f6110eb8261107d565b6110f58185611087565b935061110083611097565b805f5b8381101561113057815161111788826110be565b9750611122836110d5565b925050600181019050611103565b5085935050505092915050565b5f6040820190506111505f83018561106e565b818103602083015261116281846110e1565b90509392505050565b5f8083601f8401126111805761117f610eb2565b5b8235905067ffffffffffffffff81111561119d5761119c610eb6565b5b6020830191508360208202830111156111b9576111b8610eba565b5b9250929050565b5f805f80604085870312156111d8576111d7610e77565b5b5f85013567ffffffffffffffff8111156111f5576111f4610e7b565b5b61120187828801610fc3565b9450945050602085013567ffffffffffffffff81111561122457611223610e7b565b5b6112308782880161116b565b925092505092959194509250565b5f819050919050565b6112508161123e565b82525050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6112a88261127f565b9050919050565b6112b88161129e565b82525050565b5f6112c983836112af565b60208301905092915050565b5f602082019050919050565b5f6112eb82611256565b6112f58185611260565b935061130083611270565b805f5b8381101561133057815161131788826112be565b9750611322836112d5565b925050600181019050611303565b5085935050505092915050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b61136f8161123e565b82525050565b5f6113808383611366565b60208301905092915050565b5f602082019050919050565b5f6113a28261133d565b6113ac8185611347565b93506113b783611357565b805f5b838110156113e75781516113ce8882611375565b97506113d98361138c565b9250506001810190506113ba565b5085935050505092915050565b5f6080820190506114075f83018761106e565b6114146020830186611247565b818103604083015261142681856112e1565b9050818103606083015261143a8184611398565b905095945050505050565b61144e8161129e565b8114611458575f80fd5b50565b5f8135905061146981611445565b92915050565b611478816110a6565b8114611482575f80fd5b50565b5f813590506114938161146f565b92915050565b5f805f805f80608087890312156114b3576114b2610e77565b5b5f6114c089828a0161145b565b96505060206114d189828a01611485565b955050604087013567ffffffffffffffff8111156114f2576114f1610e7b565b5b6114fe89828a01610ebe565b9450945050606087013567ffffffffffffffff81111561152157611520610e7b565b5b61152d89828a0161116b565b92509250509295509295509295565b61154581610e7f565b82525050565b5f60ff82169050919050565b6115608161154b565b82525050565b5f6080820190506115795f83018761153c565b6115866020830186611557565b611593604083018561153c565b6115a0606083018461153c565b95945050505050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b5f80fd5b5f80fd5b5f80fd5b5f8235600160600383360303811261162a57611629611603565b5b80830191505092915050565b5f6020828403121561164b5761164a610e77565b5b5f6116588482850161145b565b91505092915050565b5f808335600160200384360303811261167d5761167c611603565b5b80840192508235915067ffffffffffffffff82111561169f5761169e611607565b5b6020830192506001820236038313156116bb576116ba61160b565b5b509250929050565b5f81905092915050565b828183375f83830152505050565b5f6116e683856116c3565b93506116f38385846116cd565b82840190509392505050565b5f61170b8284866116db565b91508190509392505050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f61174e826110a6565b9150611759836110a6565b925082820390508181111561177157611770611717565b5b92915050565b5f611781826110a6565b915061178c836110a6565b92508282019050808211156117a4576117a3611717565b5b92915050565b5f6117b48261123e565b91506117bf8361123e565b925082820390508181125f8412168282135f8512151617156117e4576117e3611717565b5b92915050565b5f6117f4826110a6565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff820361182657611825611717565b5b600182019050919050565b61183a8161129e565b82525050565b5f6020820190506118535f830184611831565b92915050565b5f81519050919050565b8281835e5f83830152505050565b5f61187b82611859565b61188581856116c3565b9350611895818560208601611863565b80840191505092915050565b5f6118ac8284611871565b915081905092915050565b5f815190506118c58161146f565b92915050565b5f602082840312156118e0576118df610e77565b5b5f6118ed848285016118b7565b9150509291505056fea26469706673582212204567b571c096394a253d4a4104ef4982fb8b0d298bfe9d0888f4ab212f5cdb7564736f6c634300081a0033";

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
// eth_simulateV1 support cache — tracks which chains support the method
// ---------------------------------------------------------------------------

const ethSimulateV1Support = new Map<number, { supported: boolean; checkedAt: number }>();
const SIMULATE_V1_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function isEthSimulateV1Supported(chainId: number): boolean | null {
  const cached = ethSimulateV1Support.get(chainId);
  if (!cached || Date.now() - cached.checkedAt > SIMULATE_V1_CACHE_TTL) return null;
  return cached.supported;
}

function setEthSimulateV1Support(chainId: number, supported: boolean): void {
  ethSimulateV1Support.set(chainId, { supported, checkedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Client cache (separate from gasEstimation to keep modules independent)
// ---------------------------------------------------------------------------

const RPC_TIMEOUT = 10_000;
const clientCache = new Map<number, { rpcUrl: string; client: PublicClient }>();

async function getClient(chainId: number): Promise<PublicClient | null> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;

  const cached = clientCache.get(chainId);
  if (cached && cached.rpcUrl === rpcUrl) {
    return cached.client;
  }

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 1 }),
  });
  clientCache.set(chainId, { rpcUrl, client });
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

async function resolveNativeCurrency(
  chainId: number,
): Promise<{ symbol: string; name: string; decimals: number; icon: string }> {
  const builtIn = NATIVE_CURRENCY[chainId];
  if (builtIn) return builtIn;

  const resolvedChain = await getStoredResolvedChainById(chainId).catch(
    () => undefined,
  );
  if (resolvedChain) {
    return {
      symbol: resolvedChain.nativeCurrency.symbol,
      name: resolvedChain.nativeCurrency.name,
      decimals: resolvedChain.nativeCurrency.decimals,
      icon:
        resolvedChain.nativeCurrency.symbol === "ETH"
          ? "/chainIcons/ethereum.svg"
          : resolvedChain.icon || "",
    };
  }

  return getNativeCurrency(chainId);
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

  const native = await resolveNativeCurrency(chainId);
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
    // Step 1: Get access list for the full batch to discover ALL touched contracts.
    // We call eth_createAccessList on the encoded ERC-7821 batch transaction
    // (to = user's smart account, data = execute(mode, calls)).
    // This traces the entire batch sequentially, so call 2 (swap) sees state
    // changes from call 1 (approve) — critical for approve+swap batches where
    // the swap would revert without the prior approval.
    console.log("[batchSim] Step 1: Getting access list for full batch...");

    // Encode the batch as an ERC-7821 execute call to the user's own address
    const batchCallsEncoded = validCalls.map((call) => ({
      to: (call.to || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
      data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
    }));
    const totalValue = batchCallsEncoded.reduce((sum, c) => sum + c.value, 0n);
    const executionData = encodeAbiParameters(
      [{ type: "tuple[]", components: [
        { type: "address", name: "to" },
        { type: "uint256", name: "value" },
        { type: "bytes", name: "data" },
      ]}],
      [batchCallsEncoded],
    );
    const ERC7821_BATCH_MODE = "0x0100000000007821000100000000000000000000000000000000000000000000" as `0x${string}`;
    const batchCalldata = encodeFunctionData({
      abi: [{ inputs: [{ name: "mode", type: "bytes32" }, { name: "executionData", type: "bytes" }], name: "execute", outputs: [], stateMutability: "payable", type: "function" }] as const,
      functionName: "execute",
      args: [ERC7821_BATCH_MODE, executionData],
    });

    // Try full-batch access list first; fall back to per-call if it fails
    // (e.g. if the account isn't an ERC-7821 smart account on-chain yet)
    let accessListEntries: { address: string }[] = [];
    try {
      const batchAL = await client.createAccessList({
        account: from,
        to: from, // ERC-7821 execute targets the user's own address
        value: totalValue,
        data: batchCalldata,
      });
      console.log(`[batchSim] Full-batch AccessList: ${batchAL.accessList.length} entries`);
      accessListEntries = batchAL.accessList;
    } catch (err: any) {
      console.log(`[batchSim] Full-batch AccessList failed (${err.shortMessage || err.message}), falling back to per-call...`);
      // Fallback: per-call access lists (may miss cross-call dependencies)
      const perCallALs = await Promise.all(
        validCalls.map((call, i) =>
          client.createAccessList({
            account: from,
            to: call.to as Address,
            value: call.value && call.value !== "0x0" ? BigInt(call.value) : 0n,
            data: (call.data && call.data !== "0x" ? call.data : "0x") as `0x${string}`,
          }).then((res) => {
            console.log(`[batchSim] AccessList call ${i}: ${res.accessList.length} entries`);
            return res;
          }).catch((err2) => {
            console.log(`[batchSim] AccessList call ${i} FAILED:`, err2.shortMessage || err2.message);
            return { accessList: [] as { address: string }[] };
          }),
        ),
      );
      accessListEntries = perCallALs.flatMap((al) => al.accessList);
    }

    const seen = new Set<string>();
    seen.add(from.toLowerCase()); // exclude user's own address
    const candidates: Address[] = [];

    for (const entry of accessListEntries) {
      const addr = entry.address.toLowerCase();
      if (!seen.has(addr)) {
        seen.add(addr);
        candidates.push(entry.address as Address);
      }
    }
    // Also include each call's `to` address
    for (const call of validCalls) {
      const to = call.to!.toLowerCase();
      if (!seen.has(to)) {
        seen.add(to);
        candidates.push(call.to as Address);
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

// ---------------------------------------------------------------------------
// eth_simulateV1-based batch simulation (non-atomic EOA accounts)
// ---------------------------------------------------------------------------

/** ERC-20 Transfer event topic */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Simulate multiple calls via eth_simulateV1 (sequential, state-persisting).
 * Returns the same SimulationResult as the bytecode-injection approach.
 *
 * Falls back to null if eth_simulateV1 is not supported (caller should
 * use the existing simulateBatchAssetChanges as fallback).
 */
async function simulateViaEthSimulateV1(
  calls: { to?: string; data?: string; value?: string }[],
  fromAddress: string,
  chainId: number,
): Promise<SimulationResult | null> {
  // Check cached support status
  const supported = isEthSimulateV1Supported(chainId);
  if (supported === false) return null;

  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;

  const from = fromAddress.toLowerCase();

  // Build eth_simulateV1 request
  const simulateCalls = calls.map((call) => ({
    from: fromAddress,
    to: call.to || "0x0000000000000000000000000000000000000000",
    data: call.data || "0x",
    value: call.value && call.value !== "0x0" ? call.value : "0x0",
  }));

  const requestBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_simulateV1",
    params: [
      {
        blockStateCalls: [
          {
            stateOverrides: {
              [fromAddress]: {
                balance: "0x56BC75E2D63100000", // 100 ETH
              },
            },
            calls: simulateCalls,
          },
        ],
        traceTransfers: true,
        validation: false,
      },
      "latest",
    ],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await response.json();

    // Check for RPC error (method not found = unsupported)
    if (json.error) {
      const errMsg = (json.error.message || "").toLowerCase();
      if (
        errMsg.includes("method not found") ||
        errMsg.includes("not supported") ||
        errMsg.includes("does not exist") ||
        errMsg.includes("unknown method") ||
        json.error.code === -32601
      ) {
        console.log(`[ethSimV1] eth_simulateV1 not supported on chain ${chainId}, caching`);
        setEthSimulateV1Support(chainId, false);
        return null;
      }
      // Other errors — method exists but call failed
      console.log(`[ethSimV1] RPC error:`, json.error);
      setEthSimulateV1Support(chainId, true);
      return null;
    }

    // Success — mark as supported
    setEthSimulateV1Support(chainId, true);

    // Parse the response
    const blockResults = json.result;
    if (!blockResults || !Array.isArray(blockResults) || blockResults.length === 0) {
      console.log("[ethSimV1] Empty response");
      return null;
    }

    const blockResult = blockResults[0];
    const callResults = blockResult.calls || [];
    console.log(`[ethSimV1] Got ${callResults.length} call results`);

    // Check if all calls succeeded
    let allSuccess = true;
    for (const cr of callResults) {
      if (cr.status !== "0x1") {
        allSuccess = false;
      }
    }

    // Parse Transfer logs to compute net balance changes
    // tokenAddress → net delta (positive = incoming, negative = outgoing)
    const tokenDeltas = new Map<string, bigint>();
    let nativeDelta = 0n;

    for (const cr of callResults) {
      const logs = cr.logs || [];
      for (const log of logs) {
        const topics = log.topics || [];
        const address = (log.address || "").toLowerCase();

        // Standard ERC-20 Transfer(from, to, amount)
        if (
          topics[0] === TRANSFER_TOPIC &&
          topics.length >= 3
        ) {
          const logFrom = "0x" + (topics[1] || "").slice(26).toLowerCase();
          const logTo = "0x" + (topics[2] || "").slice(26).toLowerCase();
          const amount = BigInt(log.data || "0x0");

          if (logFrom === from) {
            // User sending tokens
            const prev = tokenDeltas.get(address) ?? 0n;
            tokenDeltas.set(address, prev - amount);
          }
          if (logTo === from) {
            // User receiving tokens
            const prev = tokenDeltas.get(address) ?? 0n;
            tokenDeltas.set(address, prev + amount);
          }
        }

        // Synthetic native transfer (from traceTransfers: true)
        // These use a special synthetic address (0xeeee...eeee) or
        // are transfer events from the zero address
        if (
          topics[0] === TRANSFER_TOPIC &&
          topics.length >= 3 &&
          address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        ) {
          const logFrom = "0x" + (topics[1] || "").slice(26).toLowerCase();
          const logTo = "0x" + (topics[2] || "").slice(26).toLowerCase();
          const amount = BigInt(log.data || "0x0");

          if (logFrom === from) nativeDelta -= amount;
          if (logTo === from) nativeDelta += amount;
        }
      }
    }

    // Remove the synthetic native token address from ERC-20 deltas (if it got included)
    tokenDeltas.delete("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

    // Filter zero-delta tokens
    const nonZeroTokens: Address[] = [];
    const nonZeroDeltas: bigint[] = [];
    for (const [addr, delta] of tokenDeltas) {
      if (delta !== 0n) {
        nonZeroTokens.push(addr as Address);
        nonZeroDeltas.push(delta);
      }
    }

    console.log(`[ethSimV1] Parsed: native=${nativeDelta}, ${nonZeroTokens.length} token changes`);

    // Enrich token metadata
    const client = await getClient(chainId);
    if (!client) return null;

    const { changes: tokenChanges, metadataComplete } = await enrichTokenChanges(
      client,
      chainId,
      nonZeroTokens,
      nonZeroDeltas,
      fromAddress,
    );

    // Build native change
    const native = getNativeCurrency(chainId);
    let nativeChange: AssetChange | null = null;
    if (nativeDelta !== 0n) {
      const abs = nativeDelta < 0n ? -nativeDelta : nativeDelta;
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
        rawDelta: nativeDelta.toString(),
        formattedAmount: formatAmount(amount),
        valueUsd: nativePriceUsd !== null ? amount * nativePriceUsd : null,
        direction: nativeDelta > 0n ? "in" : "out",
      };
    }

    return {
      txSuccess: allSuccess,
      nativeChange,
      tokenChanges,
      simulationFailed: false,
      metadataComplete,
    };
  } catch (err: any) {
    console.log("[ethSimV1] Error:", err.message);
    // Network errors etc. — don't cache as unsupported, might be transient
    return null;
  }
}

/**
 * Non-atomic batch simulation: tries eth_simulateV1 first for robust
 * multi-tx simulation, falls back to the bytecode-injection approach.
 */
export async function simulateBatchAssetChangesNonAtomic(
  calls: { to?: string; data?: string; value?: string }[],
  fromAddress: string,
  chainId: number,
): Promise<SimulationResult> {
  // Try eth_simulateV1 first (better cross-call state handling for EOAs)
  const v1Result = await simulateViaEthSimulateV1(calls, fromAddress, chainId);
  if (v1Result) {
    console.log("[batchSimNonAtomic] Used eth_simulateV1 successfully");
    return v1Result;
  }

  // Fallback: existing bytecode-injection approach (works for EOAs via per-call access list fallback)
  console.log("[batchSimNonAtomic] Falling back to bytecode-injection simulation");
  return simulateBatchAssetChanges(calls, fromAddress, chainId);
}
