import {
  decodeFunctionData,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import type {
  PrivacyPoolsComplianceStatus,
  PrivacyPoolsExplorerNetwork,
  PrivacyPoolsReviewStatus,
} from "../../privacy-pools-explorer/types";

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const FIELD_ELEMENT = /^(?:0|[1-9]\d{0,79})$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_RESPONSE_BYTES = 2_500_000;
export const FETCH_TIMEOUT_MS = 12_000;
const ROOT_PUBLICATION_SEARCH_BLOCKS = 2_000n;
const ROOT_PUBLICATION_BATCH_SIZE = 20n;

export const DEPOSIT_EVENT = parseAbiItem(
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
);
export const ENTRYPOINT_ABI = parseAbi([
  "function latestRoot() view returns (uint256)",
  "function updateRoot(uint256 root, string ipfsHash)",
]);

export type Deployment = {
  network: PrivacyPoolsExplorerNetwork;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerBaseUrl: string;
  aspBaseUrl: string;
  scope: string;
  deploymentBlock: bigint;
  entrypoint: Address;
  ethPool: Address;
};

export const DEPLOYMENTS: Record<PrivacyPoolsExplorerNetwork, Deployment> = {
  mainnet: {
    network: "mainnet",
    chainId: 1,
    chainName: "Ethereum",
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorerBaseUrl: "https://etherscan.io",
    aspBaseUrl: "https://api.0xbow.io",
    scope:
      "4916574638117198869413701114161172350986437430914933850166949084132905299523",
    deploymentBlock: 22_153_707n,
    entrypoint: "0x6818809EefCe719E480a7526D76bD3e561526b46",
    ethPool: "0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB",
  },
  sepolia: {
    network: "sepolia",
    chainId: 11_155_111,
    chainName: "Sepolia",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerBaseUrl: "https://sepolia.etherscan.io",
    aspBaseUrl: "https://dw.0xbow.io",
    scope:
      "13541713702858359530363969798588891965037210808099002426745892519913535247342",
    deploymentBlock: 8_587_019n,
    entrypoint: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
    ethPool: "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
  },
};

type AspDeposit = {
  type: "deposit";
  amount: string;
  address: string;
  label: string;
  txHash: string;
  timestamp: number;
  precommitmentHash: string;
  reviewStatus: PrivacyPoolsReviewStatus;
};

type AspRoots = {
  mtRoot: string;
  createdAt: string;
  onchainMtRoot: string;
};

type AspLeaves = {
  aspLeaves: string[];
  stateTreeLeaves: string[];
};

export function parseNetwork(value: unknown): PrivacyPoolsExplorerNetwork | null {
  return value === "mainnet" || value === "sepolia" ? value : null;
}

export function parseTransactionHash(value: unknown): Hex | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (TRANSACTION_HASH.test(trimmed)) return trimmed.toLowerCase() as Hex;

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "etherscan.io" && hostname !== "sepolia.etherscan.io") {
      return null;
    }
    const match = url.pathname.match(/^\/tx\/(0x[0-9a-fA-F]{64})\/?$/);
    return match ? (match[1].toLowerCase() as Hex) : null;
  } catch {
    return null;
  }
}

function isFieldElement(value: unknown): value is string {
  if (typeof value !== "string" || !FIELD_ELEMENT.test(value)) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function isReviewStatus(value: unknown): value is PrivacyPoolsReviewStatus {
  return [
    "pending",
    "approved",
    "declined",
    "exited",
    "spent",
    "poi_required",
  ].includes(String(value));
}

export function parseAspDeposits(value: unknown): AspDeposit[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error("Privacy Pools ASP returned invalid deposit data");
  }
  return value.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      (item as { type?: unknown }).type !== "deposit"
    ) {
      throw new Error("Privacy Pools ASP returned an invalid deposit");
    }
    const deposit = item as Partial<AspDeposit>;
    if (
      !isFieldElement(deposit.amount) ||
      typeof deposit.address !== "string" ||
      !ADDRESS.test(deposit.address) ||
      !isFieldElement(deposit.label) ||
      typeof deposit.txHash !== "string" ||
      !TRANSACTION_HASH.test(deposit.txHash) ||
      !Number.isSafeInteger(deposit.timestamp) ||
      deposit.timestamp! < 0 ||
      !isFieldElement(deposit.precommitmentHash) ||
      !isReviewStatus(deposit.reviewStatus)
    ) {
      throw new Error("Privacy Pools ASP returned an invalid deposit");
    }
    return deposit as AspDeposit;
  });
}

export function parseAspRoots(value: unknown): AspRoots {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Privacy Pools ASP returned invalid roots");
  }
  const roots = value as Partial<AspRoots>;
  if (
    !isFieldElement(roots.mtRoot) ||
    !isFieldElement(roots.onchainMtRoot) ||
    typeof roots.createdAt !== "string" ||
    !Number.isFinite(Date.parse(roots.createdAt))
  ) {
    throw new Error("Privacy Pools ASP returned invalid roots");
  }
  return roots as AspRoots;
}

export function parseAspLeaves(value: unknown): AspLeaves {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Privacy Pools ASP returned invalid leaves");
  }
  const leaves = value as Partial<AspLeaves>;
  if (
    !Array.isArray(leaves.aspLeaves) ||
    !Array.isArray(leaves.stateTreeLeaves) ||
    leaves.aspLeaves.length > 10_000 ||
    leaves.stateTreeLeaves.length > 10_000 ||
    !leaves.aspLeaves.every(isFieldElement) ||
    !leaves.stateTreeLeaves.every(isFieldElement)
  ) {
    throw new Error("Privacy Pools ASP returned invalid leaves");
  }
  return leaves as AspLeaves;
}

export async function fetchBoundedJson(url: string, headers: HeadersInit) {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Privacy Pools ASP returned HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Privacy Pools ASP response is too large");
  }
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new Error("Privacy Pools ASP response is too large");
  }
  return JSON.parse(body) as unknown;
}

async function findBlockAtOrAfter(
  client: PublicClient,
  targetTimestamp: bigint,
  lowBlock: bigint,
  highBlock: bigint,
): Promise<bigint> {
  let low = lowBlock;
  let high = highBlock;
  while (low < high) {
    const midpoint = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: midpoint });
    if (block.timestamp < targetTimestamp) low = midpoint + 1n;
    else high = midpoint;
  }
  return low;
}

export async function findRootPublication(
  client: PublicClient,
  deployment: Deployment,
  root: bigint,
  rootCreatedAt: string,
): Promise<{ blockNumber: bigint; timestamp: bigint; transactionHash: Hex } | null> {
  const latestBlock = await client.getBlock();
  const createdAtSeconds = BigInt(Math.floor(Date.parse(rootCreatedAt) / 1_000));
  const approximateBlock = await findBlockAtOrAfter(
    client,
    createdAtSeconds,
    deployment.deploymentBlock,
    latestBlock.number,
  );
  let fromBlock = approximateBlock > 16n
    ? approximateBlock - 16n
    : deployment.deploymentBlock;
  const searchLimit = fromBlock + ROOT_PUBLICATION_SEARCH_BLOCKS < latestBlock.number
    ? fromBlock + ROOT_PUBLICATION_SEARCH_BLOCKS
    : latestBlock.number;

  // PublicNode permits historical blocks but reserves broad historical log and
  // state queries for authenticated archive users. Inspect the bounded block
  // window around ASP root creation and decode the exact updateRoot call.
  while (fromBlock <= searchLimit) {
    const batchEnd = fromBlock + ROOT_PUBLICATION_BATCH_SIZE - 1n < searchLimit
      ? fromBlock + ROOT_PUBLICATION_BATCH_SIZE - 1n
      : searchLimit;
    const blocks = await Promise.all(
      Array.from(
        { length: Number(batchEnd - fromBlock + 1n) },
        (_, offset) => client.getBlock({
          blockNumber: fromBlock + BigInt(offset),
          includeTransactions: true,
        }),
      ),
    );
    for (const block of blocks) {
      const publicationTransaction = block.transactions.find((transaction) => {
        if (
          typeof transaction === "string" ||
          transaction.to?.toLowerCase() !== deployment.entrypoint.toLowerCase()
        ) {
          return false;
        }
        try {
          const call = decodeFunctionData({ abi: ENTRYPOINT_ABI, data: transaction.input });
          return call.functionName === "updateRoot" && call.args[0] === root;
        } catch {
          return false;
        }
      });
      if (publicationTransaction && typeof publicationTransaction !== "string") {
        return {
          blockNumber: block.number,
          timestamp: block.timestamp,
          transactionHash: publicationTransaction.hash,
        };
      }
    }
    fromBlock = batchEnd + 1n;
  }
  return null;
}

export function complianceStatus(input: {
  reviewStatus: PrivacyPoolsReviewStatus;
  exactDepositMatch: boolean;
  labelIncluded: boolean;
  rootMatches: boolean;
}): PrivacyPoolsComplianceStatus {
  if (input.reviewStatus === "declined") return "declined";
  const acceptedReview = ["approved", "exited", "spent"].includes(
    input.reviewStatus,
  );
  return acceptedReview &&
    input.exactDepositMatch &&
    input.labelIncluded &&
    input.rootMatches
    ? "confirmed"
    : "pending";
}
