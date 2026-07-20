import { decodeEventLog, keccak256, parseAbi, stringToHex, type Hex } from "viem";

import { fetchRpcResult } from "../../network/rpcClient";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import type {
  PrivacyDepositEventV1,
  PrivacyPoolEventPageV1,
  PrivacyRagequitEventV1,
  PrivacyWithdrawalEventV1,
} from "./types";

const DEPOSIT_EVENT_ABI = parseAbi([
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)",
  "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
]);
const DEPOSIT_TOPIC = keccak256(
  stringToHex("Deposited(address,uint256,uint256,uint256,uint256)"),
);
const WITHDRAWAL_TOPIC = keccak256(
  stringToHex("Withdrawn(address,uint256,uint256,uint256)"),
);
const RAGEQUIT_TOPIC = keccak256(
  stringToHex("Ragequit(address,uint256,uint256,uint256)"),
);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const MAX_LOGS_PER_PAGE = 5_000;

function hexUint(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export async function readPrivacyLatestBlock(rpcUrl: string): Promise<bigint> {
  const result = await fetchRpcResult(rpcUrl, "eth_blockNumber", [], {
    allowPrivateWithoutOrigin: true,
    timeoutMs: 12_000,
    maxResponseBytes: 64_000,
  });
  const block = hexUint(result);
  if (block === null) throw new Error("Invalid Sepolia head");
  return block;
}

export async function readPrivacyBlockHash(
  rpcUrl: string,
  blockNumber: bigint,
): Promise<Hex> {
  const result = await fetchRpcResult(
    rpcUrl,
    "eth_getBlockByNumber",
    [`0x${blockNumber.toString(16)}`, false],
    {
      allowPrivateWithoutOrigin: true,
      timeoutMs: 12_000,
      maxResponseBytes: 512_000,
    },
  );
  const hash = (result as { hash?: unknown } | null)?.hash;
  if (typeof hash !== "string" || !HASH.test(hash)) {
    throw new Error("Invalid Sepolia block");
  }
  return hash.toLowerCase() as Hex;
}

export async function readPrivacyDepositEvents(
  rpcUrl: string,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<PrivacyDepositEventV1[]> {
  return (await readPrivacyPoolEvents(rpcUrl, fromBlock, toBlock)).deposits;
}

export async function readPrivacyPoolEvents(
  rpcUrl: string,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<PrivacyPoolEventPageV1> {
  if (fromBlock < 0n || toBlock < fromBlock || toBlock - fromBlock > 100_000n) {
    throw new Error("Invalid privacy event range");
  }
  const result = await fetchRpcResult(
    rpcUrl,
    "eth_getLogs",
    [{
      address: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics: [[DEPOSIT_TOPIC, WITHDRAWAL_TOPIC, RAGEQUIT_TOPIC]],
    }],
    {
      allowPrivateWithoutOrigin: true,
      timeoutMs: 20_000,
      maxResponseBytes: 4_000_000,
    },
  );
  if (!Array.isArray(result) || result.length > MAX_LOGS_PER_PAGE) {
    throw new Error("Invalid privacy event response");
  }
  const page: PrivacyPoolEventPageV1 = { deposits: [], withdrawals: [], ragequits: [] };
  for (const raw of result) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid privacy event log");
    }
    const log = raw as Record<string, unknown>;
    const blockNumber = hexUint(log.blockNumber);
    const logIndex = hexUint(log.logIndex);
    if (
      blockNumber === null ||
      blockNumber < fromBlock ||
      blockNumber > toBlock ||
      logIndex === null ||
      logIndex > 0xffff_ffffn ||
      typeof log.blockHash !== "string" ||
      !HASH.test(log.blockHash) ||
      typeof log.transactionHash !== "string" ||
      !HASH.test(log.transactionHash) ||
      typeof log.address !== "string" ||
      log.address.toLowerCase() !==
        PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address.toLowerCase() ||
      log.removed === true ||
      typeof log.data !== "string" ||
      !Array.isArray(log.topics)
    ) {
      throw new Error("Invalid privacy event log");
    }
    const decoded = decodeEventLog({
      abi: DEPOSIT_EVENT_ABI,
      data: log.data as Hex,
      topics: log.topics as [Hex, ...Hex[]],
      strict: true,
    });
    const transactionHash = log.transactionHash.toLowerCase() as Hex;
    const common = {
      version: 1,
      id: `${transactionHash}:${logIndex.toString()}`,
      chainId: 11_155_111,
      blockNumber: blockNumber.toString(),
      blockHash: log.blockHash.toLowerCase() as Hex,
      logIndex: Number(logIndex),
      transactionHash,
    } as const;
    if (decoded.eventName === "Deposited") {
      const args = decoded.args as {
        _depositor: `0x${string}`;
        _commitment: bigint;
        _label: bigint;
        _value: bigint;
        _precommitmentHash: bigint;
      };
      page.deposits.push({
        ...common,
        depositor: args._depositor.toLowerCase() as `0x${string}`,
        commitment: args._commitment.toString(),
        label: args._label.toString(),
        valueWei: args._value.toString(),
        precommitment: args._precommitmentHash.toString(),
      } satisfies PrivacyDepositEventV1);
    } else if (decoded.eventName === "Withdrawn") {
      const args = decoded.args as {
        _processooor: `0x${string}`;
        _value: bigint;
        _spentNullifier: bigint;
        _newCommitment: bigint;
      };
      page.withdrawals.push({
        ...common,
        processooor: args._processooor.toLowerCase() as `0x${string}`,
        valueWei: args._value.toString(),
        spentNullifier: args._spentNullifier.toString(),
        newCommitment: args._newCommitment.toString(),
      } satisfies PrivacyWithdrawalEventV1);
    } else if (decoded.eventName === "Ragequit") {
      const args = decoded.args as {
        _ragequitter: `0x${string}`;
        _commitment: bigint;
        _label: bigint;
        _value: bigint;
      };
      page.ragequits.push({
        ...common,
        ragequitter: args._ragequitter.toLowerCase() as `0x${string}`,
        commitment: args._commitment.toString(),
        label: args._label.toString(),
        valueWei: args._value.toString(),
      } satisfies PrivacyRagequitEventV1);
    } else {
      throw new Error("Invalid privacy event log");
    }
  }
  return page;
}
